// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Folder, Task, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import {
  cleanupImportedAndTombstones,
  db,
  findImportedCompletedTaskIds,
  getStorageCleanupPreview,
  repairAndDeduplicateDatabase,
} from '../db';
import { TOMBSTONE_TTL_MS } from '../../domain/merge';
import * as googleAccount from '../../sync/googleAccount';
import { getTombstonesPrunedBefore } from '../../sync/syncWatermark';

function makeTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    listId: INBOX_LIST_ID,
    completionHistory: [],
    createdAt: 1_700_000_000_000,
    updatedAt: 1_700_000_000_000,
    ...overrides,
  };
}

describe('storage cleanup & database repair', () => {
  let taskStore: Map<string, Task>;
  let listStore: Map<string, TaskList>;
  let folderStore: Map<string, Folder>;

  const wireStore = <T extends { id: string }>(table: unknown, map: Map<string, T>) => {
    const t = table as {
      toArray: () => Promise<T[]>;
      bulkPut: (items: T[]) => Promise<void>;
      bulkDelete: (ids: string[]) => Promise<void>;
    };
    vi.spyOn(t, 'toArray').mockImplementation(async () =>
      Array.from(map.values()).map((item) => structuredClone(item))
    );
    vi.spyOn(t, 'bulkPut').mockImplementation(async (items: T[]) => {
      for (const item of items) map.set(item.id, structuredClone(item));
    });
    vi.spyOn(t, 'bulkDelete').mockImplementation(async (ids: string[]) => {
      for (const id of ids) map.delete(id);
    });
  };

  beforeEach(() => {
    localStorage.clear();
    taskStore = new Map();
    listStore = new Map([[INBOX_LIST_ID, { id: INBOX_LIST_ID, name: 'Inbox', createdAt: 1, updatedAt: 1 }]]);
    folderStore = new Map();

    wireStore(db.tasks, taskStore);
    wireStore(db.lists, listStore);
    wireStore(db.folders, folderStore);
    vi.spyOn(db, 'transaction').mockImplementation((async (...args: unknown[]) => {
      const cb = args[args.length - 1] as () => Promise<unknown>;
      return cb();
    }) as never);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
  });

  it('findImportedCompletedTaskIds detects TickTick bulk-imported completed tasks and leaves native Tempo tasks untouched', () => {
    const importTs = 1_794_767_976_143;
    const tasks: Task[] = [
      makeTask('imp-1', { dueAt: '2024-01-01', completedAt: 1_704_067_200_000, completionHistory: [1_704_067_200_000], updatedAt: importTs }),
      makeTask('imp-2', { dueAt: '2025-05-05', completedAt: 1_746_403_200_000, completionHistory: [1_746_403_200_000], updatedAt: importTs }),
      makeTask('imp-3', { dueAt: '2026-11-15', completedAt: importTs - 5_000, completionHistory: [importTs - 5_000], updatedAt: importTs }),
      makeTask('tempo-comp', { dueAt: '2026-11-16', completedAt: 1_794_850_000_000, updatedAt: 1_794_850_000_000 }),
      makeTask('tempo-open', { dueAt: '2026-11-23', completedAt: null, updatedAt: importTs }),
      makeTask('imp-reordered', { dueAt: '2024-02-02', completedAt: 1_706_832_000_000, sortOrder: 1000, updatedAt: importTs }),
      makeTask('imp-rec', { dueAt: '2024-03-03', completedAt: 1_709_424_000_000, recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' }, updatedAt: importTs }),
      makeTask('demo-1', { dueAt: '2024-04-04', completedAt: 1_712_188_800_000, updatedAt: importTs }),
      makeTask('imp-deleted', { deletedAt: importTs, updatedAt: importTs, completedAt: 1_704_067_200_000 }),
    ];

    expect(findImportedCompletedTaskIds(tasks)).toEqual(['imp-1', 'imp-2', 'imp-3']);
  });

  it('computes accurate cleanup preview and deletes immediately when signed out', async () => {
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue(null);
    const now = 1_795_461_688_588;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const importTs = 1_794_767_976_143;
    taskStore.set('imp-1', makeTask('imp-1', { completedAt: 1_700_000_000_000, updatedAt: importTs }));
    taskStore.set('imp-2', makeTask('imp-2', { completedAt: 1_710_000_000_000, updatedAt: importTs }));
    taskStore.set('keep-open', makeTask('keep-open', { dueAt: '2026-11-23', updatedAt: now - 1000 }));
    taskStore.set('keep-comp', makeTask('keep-comp', { dueAt: '2026-11-20', completedAt: now - 5000, updatedAt: now - 5000 }));
    taskStore.set('del-task', makeTask('del-task', { title: '', deletedAt: importTs, updatedAt: importTs }));
    listStore.set('del-list', { id: 'del-list', name: '', createdAt: 1, updatedAt: importTs, deletedAt: importTs });
    folderStore.set('del-folder', { id: 'del-folder', name: '', createdAt: 1, updatedAt: importTs, deletedAt: importTs });

    const preview = await getStorageCleanupPreview();
    expect(preview).toEqual({
      importedCompletedTasks: 2,
      tombstonedTasks: 1,
      tombstonedLists: 1,
      tombstonedFolders: 1,
      activeRemainingTasks: 2,
    });

    const res = await cleanupImportedAndTombstones();
    expect(res).toEqual({
      removedImportedCompleted: 2,
      purgedTasks: 1,
      purgedLists: 1,
      purgedFolders: 1,
      needsSync: false,
    });

    expect(Array.from(taskStore.keys())).toEqual(['keep-open', 'keep-comp']);
    expect(Array.from(listStore.keys())).toEqual([INBOX_LIST_ID]);
    expect(Array.from(folderStore.keys())).toEqual([]);
    expect(getTombstonesPrunedBefore()).toBe(now);
  });

  it('stages soft-deletes and sets prune watermark when signed in so Drive sync deletes remotely first', async () => {
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'donna@example.com' });
    const now = 1_795_461_688_588;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    const importTs = 1_794_767_976_143;
    taskStore.set('imp-1', makeTask('imp-1', { completedAt: 1_700_000_000_000, updatedAt: importTs }));
    taskStore.set('imp-2', makeTask('imp-2', { completedAt: 1_710_000_000_000, updatedAt: importTs }));
    taskStore.set('keep-open', makeTask('keep-open', { dueAt: '2026-11-23', updatedAt: now - 1000 }));
    taskStore.set('del-task', makeTask('del-task', { title: '', deletedAt: importTs, updatedAt: importTs }));
    listStore.set('del-list', { id: 'del-list', name: '', createdAt: 1, updatedAt: importTs, deletedAt: importTs });

    const res = await cleanupImportedAndTombstones();
    expect(res).toEqual({
      removedImportedCompleted: 2,
      purgedTasks: 1,
      purgedLists: 1,
      purgedFolders: 0,
      needsSync: true,
    });

    // Rows remain as tombstones locally until Drive upload succeeds
    expect(taskStore.get('imp-1')?.deletedAt).toBe(now);
    expect(taskStore.get('imp-2')?.deletedAt).toBe(now);
    expect(taskStore.get('del-task')?.deletedAt).toBe(importTs);
    expect(listStore.get('del-list')?.deletedAt).toBe(importTs);
    expect(getTombstonesPrunedBefore()).toBe(now);

    // Running repair before sync completes must NOT wipe recent staged tombstones
    const repairRes = await repairAndDeduplicateDatabase();
    expect(repairRes.purgedTombstones).toBe(0);
    expect(taskStore.get('imp-1')?.deletedAt).toBe(now);
  });

  it('repairAndDeduplicateDatabase purges all tombstones when signed out even if a default client ID exists, and purges expired (>30d) tombstones when signed in', async () => {
    const now = 1_795_461_688_588;
    vi.useFakeTimers();
    vi.setSystemTime(now);

    // Signed out: purges all tombstones (including recent ones)
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue(null);
    taskStore.set('active', makeTask('active'));
    taskStore.set('recent-del', makeTask('recent-del', { deletedAt: now - 1000, updatedAt: now - 1000 }));
    listStore.set('del-list', { id: 'del-list', name: '', createdAt: 1, updatedAt: now - 1000, deletedAt: now - 1000 });
    folderStore.set('del-folder', { id: 'del-folder', name: '', createdAt: 1, updatedAt: now - 1000, deletedAt: now - 1000 });

    const signedOutRepair = await repairAndDeduplicateDatabase();
    expect(signedOutRepair.purgedTombstones).toBe(3);
    expect(Array.from(taskStore.keys())).toEqual(['active']);
    expect(Array.from(listStore.keys())).toEqual([INBOX_LIST_ID]);
    expect(Array.from(folderStore.keys())).toEqual([]);

    // Signed in: stages >30d expired tombstones and advances watermark so Drive sync deletes remotely first
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'donna@example.com' });
    const expiredAt = now - TOMBSTONE_TTL_MS - 10_000;
    const recentAt = now - 5_000;
    taskStore.set('expired-del', makeTask('expired-del', { deletedAt: expiredAt, updatedAt: expiredAt }));
    taskStore.set('recent-del', makeTask('recent-del', { deletedAt: recentAt, updatedAt: recentAt }));

    const signedInRepair = await repairAndDeduplicateDatabase();
    expect(signedInRepair.purgedTombstones).toBe(1);
    expect(Array.from(taskStore.keys())).toEqual(['active', 'expired-del', 'recent-del']);
    expect(getTombstonesPrunedBefore()).toBe(now - TOMBSTONE_TTL_MS);
  });
});
