// @vitest-environment happy-dom
import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { Folder, Task, TaskList } from '../../../types/task';

// Mock DB module
const mockTasks: Task[] = [];
const mockLists: TaskList[] = [];
const mockFolders: Folder[] = [];

vi.mock('../../../db/db', () => ({
  db: {
    tasks: {
      toArray: vi.fn(async () => [...mockTasks]),
      bulkPut: vi.fn(async (items: Task[]) => {
        mockTasks.length = 0;
        mockTasks.push(...items);
      }),
    },
    lists: {
      toArray: vi.fn(async () => [...mockLists]),
      bulkPut: vi.fn(async (items: TaskList[]) => {
        mockLists.length = 0;
        mockLists.push(...items);
      }),
    },
    folders: {
      toArray: vi.fn(async () => [...mockFolders]),
      bulkPut: vi.fn(async (items: Folder[]) => {
        mockFolders.length = 0;
        mockFolders.push(...items);
      }),
    },
    transaction: vi.fn(async (_mode, _t1, _t2, _t3, cb) => cb()),
  },
  ensureInboxList: vi.fn().mockResolvedValue(undefined),
}));

import { exportJsonBackup, importJsonBackup } from '../dataTransfer';

describe('dataTransfer', () => {
  beforeEach(() => {
    mockTasks.length = 0;
    mockLists.length = 0;
    mockFolders.length = 0;
    vi.clearAllMocks();

    // Mock DOM URL create/revoke and anchor click for headless test environment
    vi.stubGlobal('URL', {
      createObjectURL: vi.fn(() => 'blob:http://localhost/mock-blob-id'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
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
      expect(resultMsg).toContain('Imported 2 tasks, 1 lists, 1 folders');

      expect(mockTasks.map((t) => t.id)).toEqual(['t1', 't2']);
      expect(mockLists.map((l) => l.id)).toEqual(['l1']);
      expect(mockFolders.map((f) => f.id)).toEqual(['f1']);
    });

    it('imports legacy backup format consisting of a raw Task[] array', async () => {
      const legacyPayload: Task[] = [
        { id: 'legacy-1', title: 'Legacy Chore', listId: 'inbox', completionHistory: [], createdAt: 100, updatedAt: 100 },
      ];

      const resultMsg = await importJsonBackup(JSON.stringify(legacyPayload));
      expect(resultMsg).toContain('Imported 1 tasks, 0 lists, 0 folders');
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
  });

  describe('exportJsonBackup', () => {
    it('generates a backup JSON and triggers browser download', async () => {
      mockTasks.push({ id: 'task-a', title: 'Task A', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 1 });
      mockLists.push({ id: 'list-a', name: 'List A', createdAt: 1, updatedAt: 1 });

      const clickSpy = vi.fn();
      vi.spyOn(document, 'createElement').mockReturnValue({
        set href(_val: string) {},
        set download(_val: string) {},
        get download() {
          return 'tempo-backup-2026-11-18.json';
        },
        click: clickSpy,
      } as unknown as HTMLElement);

      const message = await exportJsonBackup();
      expect(message).toContain('Exported 1 tasks');
      expect(clickSpy).toHaveBeenCalled();
      expect(URL.createObjectURL).toHaveBeenCalled();
      expect(URL.revokeObjectURL).toHaveBeenCalled();
    });
  });
});
