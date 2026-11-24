import { db } from '../../db/db';
import { SYNC_VERSION } from '../../sync/googleDrive';
import { mergeTasks } from '../../domain/merge';
import { compactSyncData, parseSyncPayload, SyncPayloadError } from '../../domain/syncPayload';
import { getTombstonesPrunedBefore, markLocalRestorePending } from '../../sync/syncWatermark';
import { isCompleted, isRecurring } from '../../domain/recurrence';
import { recordDiagEvent } from '../../domain/diagnostics';

/** Settings › Integrations & Import: JSON backup / restore. */

export interface JsonImportPreview {
  exportedAt?: number;
  incomingActiveTasks: number;
  incomingOpenTasks: number;
  incomingCompletedTasks: number;
  incomingRecurringTasks: number;
  incomingTombstonedTasks: number;
  skippedPrunedTombstones: number;
  newTasksToAdd: number;
  existingTasksToUpdate: number;
  existingLocalTasksKept: number;
}

function parseBackupContent(content: string): ReturnType<typeof parseSyncPayload> {
  let incoming: ReturnType<typeof parseSyncPayload>;
  try {
    incoming = parseSyncPayload(content);
  } catch (err) {
    if (err instanceof SyncPayloadError && err.code === 'tasks_not_array') {
      throw new Error('Invalid format: tasks array missing.');
    }
    throw err;
  }
  if (incoming.tasks.length === 0) {
    throw new Error('Invalid format: no valid tasks found.');
  }
  return incoming;
}

export async function exportJsonBackup(): Promise<string> {
  const tasks = await db.tasks.toArray();
  const data = compactSyncData({
    version: SYNC_VERSION,
    exportedAt: Date.now(),
    tasks: tasks.filter((t) => !t.deletedAt),
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tempo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return `Exported ${data.tasks.length} tasks to ${a.download}.`;
}

/** Parse and summarize a JSON backup against the local database before confirming restore. */
export async function previewJsonBackup(content: string): Promise<JsonImportPreview> {
  const incoming = parseBackupContent(content);
  const prunedBefore = getTombstonesPrunedBefore();
  const pruneOptions = prunedBefore > 0 ? { prunedBefore } : undefined;
  const localTasks = await db.tasks.toArray();
  const mergedTasks = mergeTasks(localTasks, incoming.tasks, pruneOptions);

  let incomingActiveTasks = 0;
  let incomingOpenTasks = 0;
  let incomingCompletedTasks = 0;
  let incomingRecurringTasks = 0;
  let incomingTombstonedTasks = 0;
  let skippedPrunedTombstones = 0;

  for (const t of incoming.tasks) {
    if (t.deletedAt) {
      incomingTombstonedTasks += 1;
      if (prunedBefore > 0 && t.deletedAt <= prunedBefore) skippedPrunedTombstones += 1;
      continue;
    }
    incomingActiveTasks += 1;
    if (isRecurring(t)) incomingRecurringTasks += 1;
    if (isCompleted(t)) incomingCompletedTasks += 1;
    else incomingOpenTasks += 1;
  }

  const localMap = new Map(localTasks.map((t) => [t.id, t]));
  const incomingTaskIds = new Set(incoming.tasks.map((t) => t.id));
  let newTasksToAdd = 0;
  let existingTasksToUpdate = 0;
  for (const merged of mergedTasks) {
    const existing = localMap.get(merged.id);
    if (!existing) {
      if (!merged.deletedAt) newTasksToAdd += 1;
    } else if (JSON.stringify(existing) !== JSON.stringify(merged)) {
      existingTasksToUpdate += 1;
    }
  }

  const existingLocalTasksKept = localTasks.filter(
    (t) => !t.deletedAt && !incomingTaskIds.has(t.id)
  ).length;

  return {
    exportedAt: incoming.exportedAt,
    incomingActiveTasks,
    incomingOpenTasks,
    incomingCompletedTasks,
    incomingRecurringTasks,
    incomingTombstonedTasks,
    skippedPrunedTombstones,
    newTasksToAdd,
    existingTasksToUpdate,
    existingLocalTasksKept,
  };
}

/** Merge a JSON backup (SyncData or a bare Task[]) into the local database. */
export async function importJsonBackup(content: string): Promise<string> {
  const incoming = parseBackupContent(content);
  const incomingTasks = incoming.tasks;

  const prunedBefore = getTombstonesPrunedBefore();
  const pruneOptions = prunedBefore > 0 ? { prunedBefore } : undefined;
  let mergedTasksCount = 0;

  await db.transaction('rw', db.tasks, async () => {
    const localTasks = await db.tasks.toArray();
    const mergedTasks = mergeTasks(localTasks, incomingTasks, pruneOptions);
    mergedTasksCount = mergedTasks.length;

    const mergedTaskIds = new Set(mergedTasks.map((t) => t.id));
    const prunedTaskIds = localTasks.filter((t) => !mergedTaskIds.has(t.id)).map((t) => t.id);

    if (mergedTasks.length > 0) await db.tasks.bulkPut(mergedTasks);

    if (prunedTaskIds.length > 0 && typeof db.tasks.bulkDelete === 'function') {
      await db.tasks.bulkDelete(prunedTaskIds);
    }
  });
  markLocalRestorePending();
  recordDiagEvent('json_import', `incoming=${incomingTasks.length} merged=${mergedTasksCount}`);
  const activeIncoming = incomingTasks.filter((t) => !t.deletedAt).length;
  return `Imported ${activeIncoming} task${activeIncoming === 1 ? '' : 's'}!`;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}
