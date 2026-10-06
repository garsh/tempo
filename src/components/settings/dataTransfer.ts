import { db, ensureInboxList } from '../../db/db';
import { SYNC_VERSION } from '../../sync/googleDrive';
import type { Folder, SavedFilter, SyncData, Task, TaskList } from '../../types/task';
import { mergeFolders, mergeLists, mergeSavedFilters, mergeTasks } from '../../domain/merge';
import { importTasksFromCsv } from '../../domain/ticktickImport';

/** Settings › Integrations & Import: JSON backup / restore and TickTick / CSV import. */

export async function exportJsonBackup(): Promise<string> {
  await ensureInboxList();
  const data: SyncData = {
    version: SYNC_VERSION,
    exportedAt: Date.now(),
    tasks: await db.tasks.toArray(),
    lists: await db.lists.toArray(),
    folders: await db.folders.toArray(),
    savedFilters: await db.savedFilters.toArray(),
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
  const parsed = JSON.parse(content) as SyncData | Task[];
  const incomingTasks: Task[] = Array.isArray(parsed) ? parsed : parsed.tasks || [];
  const incomingLists: TaskList[] = Array.isArray(parsed) ? [] : parsed.lists || [];
  const incomingFolders: Folder[] = Array.isArray(parsed) ? [] : parsed.folders || [];
  const incomingFilters: SavedFilter[] = Array.isArray(parsed) ? [] : parsed.savedFilters || [];
  if (!Array.isArray(incomingTasks)) throw new Error('Invalid format: tasks array missing.');

  const mergedTasks = mergeTasks(await db.tasks.toArray(), incomingTasks);
  const mergedLists = mergeLists(await db.lists.toArray(), incomingLists);
  const mergedFolders = mergeFolders(await db.folders.toArray(), incomingFolders);
  const mergedFilters = mergeSavedFilters(await db.savedFilters.toArray(), incomingFilters);

  await db.transaction('rw', db.tasks, db.lists, db.folders, db.savedFilters, async () => {
    await db.tasks.bulkPut(mergedTasks);
    if (mergedLists.length > 0) await db.lists.bulkPut(mergedLists);
    if (mergedFolders.length > 0) await db.folders.bulkPut(mergedFolders);
    if (mergedFilters.length > 0) await db.savedFilters.bulkPut(mergedFilters);
  });
  await ensureInboxList();
  return `Imported ${incomingTasks.length} tasks, ${incomingLists.length} lists, ${incomingFolders.length} folders, ${incomingFilters.length} filters!`;
}

export async function importCsv(content: string): Promise<string> {
  const result = importTasksFromCsv(content);
  if (result.format === 'unknown' || result.tasks.length === 0) {
    throw new Error(
      'Unrecognized CSV. Export from TickTick (CSV) or use columns: title, list, due, priority, tags, notes, status.'
    );
  }
  await ensureInboxList();
  await db.transaction('rw', db.tasks, db.lists, async () => {
    if (result.lists.length) await db.lists.bulkPut(result.lists);
    if (result.tasks.length) await db.tasks.bulkPut(result.tasks);
  });
  return (
    `Imported ${result.tasks.length} tasks from ${result.format} CSV` +
    (result.lists.length ? ` (${result.lists.length} lists)` : '') +
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
