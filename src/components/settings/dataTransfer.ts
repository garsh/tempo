import { db, ensureInboxList } from '../../db/db';
import { SYNC_VERSION } from '../../sync/googleDrive';
import type { SyncData, Task, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import { mergeFolders, mergeLists, mergeTasks } from '../../domain/merge';
import { parseSyncPayload, SyncPayloadError } from '../../domain/syncPayload';
import { isCompleted, isRecurring } from '../../domain/recurrence';
import { importTasksFromCsv } from '../../domain/ticktickImport';
import { recordDiagEvent } from '../../domain/diagnostics';

/** Settings › Integrations & Import: JSON backup / restore and TickTick / CSV import. */

export async function exportJsonBackup(): Promise<string> {
  await ensureInboxList();
  const data: SyncData = {
    version: SYNC_VERSION,
    exportedAt: Date.now(),
    tasks: await db.tasks.toArray(),
    lists: await db.lists.toArray(),
    folders: await db.folders.toArray(),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `tempo-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
  return `Exported ${data.tasks.length} tasks to ${a.download}.`;
}

/** Merge a JSON backup (SyncData or a bare Task[]) into the local database. */
export async function importJsonBackup(content: string): Promise<string> {
  let incoming: ReturnType<typeof parseSyncPayload>;
  try {
    incoming = parseSyncPayload(content);
  } catch (err) {
    if (err instanceof SyncPayloadError && err.code === 'tasks_not_array') {
      throw new Error('Invalid format: tasks array missing.');
    }
    throw err;
  }
  const incomingTasks = incoming.tasks;
  const incomingLists = incoming.lists;
  const incomingFolders = incoming.folders;
  if (incomingTasks.length === 0 && incomingLists.length === 0 && incomingFolders.length === 0) {
    throw new Error('Invalid format: no valid tasks, lists, or folders.');
  }

  const mergedTasks = mergeTasks(await db.tasks.toArray(), incomingTasks);
  const mergedLists = mergeLists(await db.lists.toArray(), incomingLists);
  const mergedFolders = mergeFolders(await db.folders.toArray(), incomingFolders);

  await db.transaction('rw', db.tasks, db.lists, db.folders, async () => {
    await db.tasks.bulkPut(mergedTasks);
    if (mergedLists.length > 0) await db.lists.bulkPut(mergedLists);
    if (mergedFolders.length > 0) await db.folders.bulkPut(mergedFolders);
  });
  await ensureInboxList();
  recordDiagEvent('json_import', `incoming=${incomingTasks.length} merged=${mergedTasks.length}`);
  return `Imported ${incomingTasks.length} tasks, ${incomingLists.length} lists, ${incomingFolders.length} folders!`;
}

function mergeHistories(sources: number[][]): number[] {
  const unique = new Set<number>();
  for (const h of sources) {
    for (const ts of h) unique.add(ts);
  }
  const sorted = [...unique].sort((a, b) => a - b);
  return sorted.length > 365 ? sorted.slice(-365) : sorted;
}

export async function importCsv(content: string): Promise<string> {
  const result = importTasksFromCsv(content);
  if (result.format === 'unknown' || result.tasks.length === 0) {
    throw new Error(
      'Unrecognized CSV. Export from TickTick (CSV) or use columns: title, list, due, priority, tags, notes, status.'
    );
  }
  await ensureInboxList();

  let deduplicated = 0;
  let updatedExisting = 0;
  let newListsCount = 0;

  await db.transaction('rw', db.tasks, db.lists, async () => {
    const now = Date.now();
    const existingLists = await db.lists.toArray();
    const activeListByName = new Map<string, TaskList>();
    for (const l of existingLists) {
      if (l.deletedAt) continue;
      if (l.id === INBOX_LIST_ID) activeListByName.set('inbox', l);
      const key = l.name.trim().toLowerCase();
      if (!activeListByName.has(key)) activeListByName.set(key, l);
    }

    const listIdRemap = new Map<string, string>();
    const listsToPut: TaskList[] = [];
    for (const l of result.lists) {
      const key = l.name.trim().toLowerCase();
      const existing = activeListByName.get(key);
      if (existing) {
        listIdRemap.set(l.id, existing.id);
      } else {
        activeListByName.set(key, l);
        listsToPut.push(l);
      }
    }
    newListsCount = listsToPut.length;

    const remappedTasks = result.tasks.map((t) => ({
      ...t,
      listId: listIdRemap.get(t.listId) ?? t.listId,
    }));

    const existingTasks = await db.tasks.toArray();
    const existingByIdentity = new Map<string, Task[]>();
    const existingOpenByTitle = new Map<string, Task[]>();

    const makeIdentityKey = (t: Pick<Task, 'listId' | 'title' | 'createdAt'>) =>
      `${t.listId}::${t.title.trim().toLowerCase()}::${t.createdAt}`;
    const makeTitleKey = (t: Pick<Task, 'listId' | 'title'>) =>
      `${t.listId}::${t.title.trim().toLowerCase()}`;

    for (const t of existingTasks) {
      if (t.deletedAt) continue;
      const idKey = makeIdentityKey(t);
      const list = existingByIdentity.get(idKey);
      if (list) list.push(t);
      else existingByIdentity.set(idKey, [t]);

      if (!isCompleted(t)) {
        const titleKey = makeTitleKey(t);
        const tList = existingOpenByTitle.get(titleKey);
        if (tList) tList.push(t);
        else existingOpenByTitle.set(titleKey, [t]);
      }
    }

    const incomingIdentities = new Set(remappedTasks.map((t) => makeIdentityKey(t)));
    const claimedIds = new Set<string>();
    const tasksToPut: Task[] = [];

    for (const incoming of remappedTasks) {
      const idKey = makeIdentityKey(incoming);
      const exactAll = (existingByIdentity.get(idKey) ?? []).filter(
        (e) => !claimedIds.has(e.id)
      );
      const incomingDone = isCompleted(incoming);
      const sameStateExact = exactAll.filter((e) => isCompleted(e) === incomingDone);
      let matches = sameStateExact.length > 0 ? sameStateExact : exactAll;

      if (matches.length === 0 && !incomingDone && isRecurring(incoming)) {
        const titleKey = makeTitleKey(incoming);
        matches = (existingOpenByTitle.get(titleKey) ?? []).filter(
          (e) => !claimedIds.has(e.id) && !incomingIdentities.has(makeIdentityKey(e))
        );
      }

      if (matches.length > 0) {
        const primary = matches.find((e) => !!e.recurrence) ?? matches[0];
        for (const m of matches) claimedIds.add(m.id);

        const mergedHistory = mergeHistories([
          incoming.completionHistory,
          ...matches.map((m) => m.completionHistory || []),
        ]);

        tasksToPut.push({
          ...incoming,
          id: primary.id,
          sortOrder: primary.sortOrder,
          pinned: primary.pinned || incoming.pinned,
          completionHistory: mergedHistory,
          updatedAt: now,
          deletedAt: null,
        });
        updatedExisting += 1;

        for (const extra of matches) {
          if (extra.id === primary.id) continue;
          tasksToPut.push({
            ...extra,
            deletedAt: now,
            updatedAt: now,
          });
          deduplicated += 1;
        }
      } else {
        tasksToPut.push(incoming);
      }
    }

    if (listsToPut.length) await db.lists.bulkPut(listsToPut);
    if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
  });

  recordDiagEvent(
    'csv_import',
    `imported=${result.tasks.length} updated=${updatedExisting} deduped=${deduplicated} newLists=${newListsCount}`
  );

  return (
    `Imported ${result.tasks.length} tasks from ${result.format} CSV` +
    (newListsCount ? ` (${newListsCount} new lists)` : '') +
    (deduplicated ? `, removed ${deduplicated} duplicates` : '') +
    (result.skipped ? `, skipped ${result.skipped}` : '') +
    '.'
  );
}

export function readFileText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read file'));
    reader.readAsText(file);
  });
}
