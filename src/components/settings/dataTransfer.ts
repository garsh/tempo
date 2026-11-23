import { db, ensureInboxList } from '../../db/db';
import { SYNC_VERSION } from '../../sync/googleDrive';
import { mergeFolders, mergeLists, mergeTasks } from '../../domain/merge';
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
  incomingActiveLists: number;
  incomingActiveFolders: number;
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
  if (incoming.tasks.length === 0 && incoming.lists.length === 0 && incoming.folders.length === 0) {
    throw new Error('Invalid format: no valid tasks found.');
  }
  return incoming;
}

export async function exportJsonBackup(): Promise<string> {
  await ensureInboxList();
  const [tasks, lists, folders] = await Promise.all([
    db.tasks.toArray(),
    db.lists.toArray(),
    db.folders.toArray(),
  ]);
  const data = compactSyncData({
    version: SYNC_VERSION,
    exportedAt: Date.now(),
    tasks: tasks.filter((t) => !t.deletedAt),
    lists: lists.filter((l) => !l.deletedAt),
    folders: folders.filter((f) => !f.deletedAt),
  });
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tempo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
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

  let incomingActiveLists = 0;
  for (const l of incoming.lists) {
    if (l.deletedAt) {
      if (prunedBefore > 0 && l.deletedAt <= prunedBefore) skippedPrunedTombstones += 1;
    } else {
      incomingActiveLists += 1;
    }
  }

  let incomingActiveFolders = 0;
  for (const f of incoming.folders) {
    if (f.deletedAt) {
      if (prunedBefore > 0 && f.deletedAt <= prunedBefore) skippedPrunedTombstones += 1;
    } else {
      incomingActiveFolders += 1;
    }
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
    incomingActiveLists,
    incomingActiveFolders,
    newTasksToAdd,
    existingTasksToUpdate,
    existingLocalTasksKept,
  };
}

/** Merge a JSON backup (SyncData or a bare Task[]) into the local database. */
export async function importJsonBackup(content: string): Promise<string> {
  const incoming = parseBackupContent(content);
  const incomingTasks = incoming.tasks;
  const incomingLists = incoming.lists;
  const incomingFolders = incoming.folders;

  const prunedBefore = getTombstonesPrunedBefore();
  const pruneOptions = prunedBefore > 0 ? { prunedBefore } : undefined;
  const mergedTasks = mergeTasks(await db.tasks.toArray(), incomingTasks, pruneOptions);
  const mergedLists = mergeLists(await db.lists.toArray(), incomingLists, pruneOptions);
  const mergedFolders = mergeFolders(await db.folders.toArray(), incomingFolders, pruneOptions);

  await db.transaction('rw', db.tasks, db.lists, db.folders, async () => {
    await db.tasks.bulkPut(mergedTasks);
    if (mergedLists.length > 0) await db.lists.bulkPut(mergedLists);
    if (mergedFolders.length > 0) await db.folders.bulkPut(mergedFolders);
  });
  await ensureInboxList();
  markLocalRestorePending();
  recordDiagEvent('json_import', `incoming=${incomingTasks.length} merged=${mergedTasks.length}`);
  return `Imported ${incomingTasks.length} task${incomingTasks.length === 1 ? '' : 's'}!`;
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}
