// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Folder, Task, TaskList } from '../../../types/task';

// Mock DB module
const mockTasks: Task[] = [];
const mockLists: TaskList[] = [];
const mockFolders: Folder[] = [];

function upsertItems<T extends { id: string }>(arr: T[], items: T[]) {
  const map = new Map(arr.map((x) => [x.id, x]));
  for (const item of items) map.set(item.id, item);
  arr.length = 0;
  arr.push(...map.values());
}

function deleteIds<T extends { id: string }>(arr: T[], ids: string[]) {
  const del = new Set(ids);
  const kept = arr.filter((x) => !del.has(x.id));
  arr.length = 0;
  arr.push(...kept);
}

vi.mock('../../../db/db', () => ({
  db: {
    tasks: {
      toArray: vi.fn(async () => [...mockTasks]),
      bulkPut: vi.fn(async (items: Task[]) => upsertItems(mockTasks, items)),
      bulkDelete: vi.fn(async (ids: string[]) => deleteIds(mockTasks, ids)),
    },
    lists: {
      toArray: vi.fn(async () => [...mockLists]),
      bulkPut: vi.fn(async (items: TaskList[]) => upsertItems(mockLists, items)),
      bulkDelete: vi.fn(async (ids: string[]) => deleteIds(mockLists, ids)),
    },
    folders: {
      toArray: vi.fn(async () => [...mockFolders]),
      bulkPut: vi.fn(async (items: Folder[]) => upsertItems(mockFolders, items)),
      bulkDelete: vi.fn(async (ids: string[]) => deleteIds(mockFolders, ids)),
    },
    transaction: vi.fn(async (_mode, _t1, _t2, _t3, cb) => cb()),
  },
  ensureInboxList: vi.fn().mockResolvedValue(undefined),
}));

import { exportJsonBackup, importJsonBackup, previewJsonBackup } from '../dataTransfer';
import { setTombstonesPrunedBefore } from '../../../sync/syncWatermark';

describe('dataTransfer', () => {
  beforeEach(() => {
    mockTasks.length = 0;
    mockLists.length = 0;
    mockFolders.length = 0;
    localStorage.clear();
    vi.clearAllMocks();

    // Mock DOM URL create/revoke and anchor click for headless test environment
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:http://localhost/mock-blob-id'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('importJsonBackup', () => {
    it('imports full SyncData backup payload with tasks, lists, and folders', async () => {
      const backupPayload = {
        version: 4,
        exportedAt: 1700000000000,
        tasks: [
          { id: 't1', title: 'Task 1', listId: 'inbox', createdAt: 100, updatedAt: 100 },
          { id: 't2', title: 'Task 2', listId: 'inbox', createdAt: 110, updatedAt: 110 },
        ],
        lists: [{ id: 'l1', name: 'Work', createdAt: 100, updatedAt: 100 }],
        folders: [{ id: 'f1', name: 'Projects', createdAt: 100, updatedAt: 100 }],
      };

      const resultMsg = await importJsonBackup(JSON.stringify(backupPayload));
      expect(resultMsg).toBe('Imported 2 tasks!');

      expect(mockTasks.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(mockLists.map((l) => l.id)).toEqual(['l1']);
      expect(mockFolders.map((f) => f.id)).toEqual(['f1']);
    });

    it('imports legacy backup format consisting of a raw Task[] array', async () => {
      const legacyPayload: Task[] = [
        { id: 'legacy-1', title: 'Legacy Chore', listId: 'inbox', completionHistory: [], createdAt: 100, updatedAt: 100 },
      ];

      const resultMsg = await importJsonBackup(JSON.stringify(legacyPayload));
      expect(resultMsg).toBe('Imported 1 task!');
      expect(mockTasks.map((t) => t.id)).toEqual(['legacy-1']);
    });

    it('merges incoming tasks with existing database records using LWW', async () => {
      mockTasks.push({
        id: 'shared-task',
        title: 'Old Title',
        listId: 'inbox',
        completionHistory: [],
        createdAt: 100,
        updatedAt: 100,
      });

      const incomingPayload = {
        version: 4,
        exportedAt: 200,
        tasks: [
          {
            id: 'shared-task',
            title: 'Newer Title',
            listId: 'inbox',
            completionHistory: [],
            createdAt: 100,
            updatedAt: 200,
          },
        ],
      };

      await importJsonBackup(JSON.stringify(incomingPayload));
      const updated = mockTasks.find((t) => t.id === 'shared-task');
      expect(updated?.title).toBe('Newer Title');
    });

    it('throws error when JSON content is malformed', async () => {
      await expect(importJsonBackup('not valid { json')).rejects.toThrow();
    });

    it('clamps a far-future updatedAt so a later local edit wins the next import', async () => {
      const future = Date.now() + 1000 * 60 * 60 * 24 * 365 * 50;
      await importJsonBackup(
        JSON.stringify({
          tasks: [
            {
              id: 'future-task',
              title: 'Remote',
              listId: 'inbox',
              completionHistory: [],
              createdAt: 1,
              updatedAt: future,
            },
          ],
        })
      );
      const imported = mockTasks.find((t) => t.id === 'future-task');
      expect(imported).toBeDefined();
      expect(imported!.updatedAt).toBeLessThanOrEqual(Date.now() + 5 * 60 * 1000);
      expect(imported!.updatedAt).toBeGreaterThan(Date.now() - 60_000);

      mockTasks[0] = { ...imported!, title: 'Local edit', updatedAt: imported!.updatedAt + 60_000 };
      await importJsonBackup(
        JSON.stringify({
          tasks: [
            {
              id: 'future-task',
              title: 'Remote again',
              listId: 'inbox',
              completionHistory: [],
              createdAt: 1,
              updatedAt: future,
            },
          ],
        })
      );
      expect(mockTasks.find((t) => t.id === 'future-task')?.title).toBe('Local edit');
    });

    it('throws error when tasks field is missing or not an array', async () => {
      const invalidPayload = {
        version: 4,
        tasks: 'not an array',
      };

      await expect(importJsonBackup(JSON.stringify(invalidPayload))).rejects.toThrow(
        'Invalid format: tasks array missing.'
      );
    });

    it('drops tombstones older than the prune watermark on restore and marks local restore pending', async () => {
      setTombstonesPrunedBefore(500);
      localStorage.setItem('tempo_last_synced_file_id', 'drive-file-1');

      await importJsonBackup(
        JSON.stringify({
          version: 4,
          exportedAt: 1000,
          tasks: [
            { id: 'old-del', title: '', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 400, deletedAt: 400 },
            { id: 'new-del', title: '', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 600, deletedAt: 600 },
            { id: 'restored-active', title: 'Restored', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 300 },
          ],
          lists: [
            { id: 'old-list-del', name: '', createdAt: 1, updatedAt: 400, deletedAt: 400 },
            { id: 'active-list', name: 'Home', createdAt: 1, updatedAt: 200 },
          ],
          folders: [
            { id: 'old-folder-del', name: '', createdAt: 1, updatedAt: 400, deletedAt: 400 },
          ],
        })
      );

      expect(mockTasks.map((t) => t.id)).toEqual(['new-del', 'restored-active']);
      expect(mockLists.map((l) => l.id)).toEqual(['active-list']);
      expect(mockFolders).toEqual([]);
      expect(localStorage.getItem('tempo_last_synced_file_id')).toBe('');
    });

    it('bulkDeletes pruned local tombstones and counts only active tasks in message', async () => {
      setTombstonesPrunedBefore(500);
      mockTasks.push({
        id: 'local-old-del',
        title: '',
        listId: 'inbox',
        completionHistory: [],
        createdAt: 1,
        updatedAt: 300,
        deletedAt: 300,
      });

      const msg = await importJsonBackup(
        JSON.stringify({
          version: 4,
          exportedAt: 1000,
          tasks: [
            { id: 't-active', title: 'Active', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 600 },
            { id: 't-del', title: '', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 600, deletedAt: 600 },
          ],
        })
      );

      expect(msg).toBe('Imported 1 task!');
      expect(mockTasks.map((t) => t.id)).toEqual(['t-active', 't-del']);
    });
  });

  describe('previewJsonBackup', () => {
    it('summarizes incoming task counts, merge impact, and pruned tombstones without mutating db', async () => {
      setTombstonesPrunedBefore(500);
      mockTasks.push(
        {
          id: 'shared-update',
          title: 'Older local',
          listId: 'inbox',
          completionHistory: [],
          createdAt: 1,
          updatedAt: 100,
        },
        {
          id: 'local-only',
          title: 'Local only',
          listId: 'inbox',
          completionHistory: [],
          createdAt: 1,
          updatedAt: 100,
        }
      );

      const preview = await previewJsonBackup(
        JSON.stringify({
          version: 4,
          exportedAt: 1700000000000,
          tasks: [
            {
              id: 'shared-update',
              title: 'Newer backup',
              listId: 'inbox',
              completionHistory: [],
              createdAt: 1,
              updatedAt: 200,
            },
            {
              id: 'new-open-rec',
              title: 'Daily Walk',
              listId: 'inbox',
              dueAt: '2026-11-23',
              recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
              completionHistory: [],
              createdAt: 2,
              updatedAt: 200,
            },
            {
              id: 'new-done',
              title: 'Done One-Off',
              listId: 'inbox',
              dueAt: '2026-11-20',
              completedAt: 300,
              completionHistory: [300],
              createdAt: 3,
              updatedAt: 300,
            },
            {
              id: 'pruned-del',
              title: '',
              listId: 'inbox',
              completionHistory: [],
              createdAt: 1,
              updatedAt: 400,
              deletedAt: 400,
            },
            {
              id: 'recent-del',
              title: '',
              listId: 'inbox',
              completionHistory: [],
              createdAt: 1,
              updatedAt: 600,
              deletedAt: 600,
            },
          ],
          lists: [
            { id: 'l1', name: 'Home', createdAt: 1, updatedAt: 1 },
            { id: 'l-pruned', name: '', createdAt: 1, updatedAt: 400, deletedAt: 400 },
          ],
          folders: [{ id: 'f1', name: 'Area', createdAt: 1, updatedAt: 1 }],
        })
      );

      expect(preview).toEqual({
        exportedAt: 1700000000000,
        incomingActiveTasks: 3,
        incomingOpenTasks: 2,
        incomingCompletedTasks: 1,
        incomingRecurringTasks: 1,
        incomingTombstonedTasks: 2,
        skippedPrunedTombstones: 2,
        newTasksToAdd: 2,
        existingTasksToUpdate: 1,
        existingLocalTasksKept: 1,
      });
      // DB remains untouched until confirmed
      expect(mockTasks.map((t) => t.id)).toEqual(['shared-update', 'local-only']);
    });

    it('rejects invalid JSON and missing tasks array', async () => {
      await expect(previewJsonBackup('{bad json')).rejects.toThrow();
      await expect(previewJsonBackup(JSON.stringify({ tasks: 'nope' }))).rejects.toThrow(
        'Invalid format: tasks array missing.'
      );
    });
  });

  describe('exportJsonBackup', () => {
    it('generates a backup JSON, omits tombstones across tasks, lists, and folders, and triggers browser download', async () => {
      mockTasks.push(
        { id: 'task-a', title: 'Task A', listId: 'inbox', completionHistory: [], notes: '', createdAt: 1, updatedAt: 1, deletedAt: null },
        { id: 'task-del', title: 'Deleted', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 2, deletedAt: 2 }
      );
      mockLists.push(
        { id: 'list-a', name: 'List A', folderId: null, createdAt: 1, updatedAt: 1, deletedAt: null },
        { id: 'list-del', name: 'Deleted List', createdAt: 1, updatedAt: 2, deletedAt: 2 }
      );
      mockFolders.push(
        { id: 'folder-a', name: 'Folder A', createdAt: 1, updatedAt: 1, deletedAt: null },
        { id: 'folder-del', name: 'Deleted Folder', createdAt: 1, updatedAt: 2, deletedAt: 2 }
      );

      let capturedBlob: Blob | null = null;
      vi.stubGlobal('URL', {
        createObjectURL: vi.fn((blob: Blob) => {
          capturedBlob = blob;
          return 'blob:http://localhost/mock-blob-id';
        }),
        revokeObjectURL: vi.fn(),
      });

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        get download() {
          return 'tempo-backup-2026-11-18.json';
        },
        click: clickSpy,
      } as unknown as HTMLElement);

      vi.useFakeTimers();
      const message = await exportJsonBackup();
      expect(message).toContain('Exported 1 tasks');
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
      vi.advanceTimersByTime(60_000);
      expect(URL.revokeObjectURL).toHaveBeenCalled();

      const exported = JSON.parse(await capturedBlob!.text()) as {
        tasks: Task[];
        lists: TaskList[];
        folders: Folder[];
      };
      expect(exported.tasks).toEqual([
        { id: 'task-a', title: 'Task A', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 1 },
      ]);
      expect(exported.lists).toEqual([{ id: 'list-a', name: 'List A', createdAt: 1, updatedAt: 1 }]);
      expect(exported.folders).toEqual([{ id: 'folder-a', name: 'Folder A', createdAt: 1, updatedAt: 1 }]);
    });
  });
});
