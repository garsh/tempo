import { describe, it, expect } from 'vitest';
import {
  hasExpiredTombstones,
  mergeFolders,
  mergeLists,
  mergeTasks,
  resolveListConflict,
  resolveTaskConflict,
  TOMBSTONE_TTL_MS,
} from '../merge';
import type { Folder, Task, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

describe('Merge & Conflict Resolution Engine', () => {
  const baseTask: Task = {
    id: 'task-1',
    title: 'Water Fern',
    listId: INBOX_LIST_ID,
    dueAt: '2026-09-25',
    recurrence: {
      type: 'fixed_interval',
      intervalValue: 3,
      intervalUnit: 'days',
    },
    createdAt: 1000,
    updatedAt: 1000,
    completionHistory: [500],
  };

  const baseList: TaskList = {
    id: 'list-1',
    name: 'Home',
    sortOrder: 1,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('keeps local-only and adds remote-only tasks', () => {
    const localTask: Task = { ...baseTask, id: 'local-only' };
    const remoteTask: Task = { ...baseTask, id: 'remote-only' };

    const merged = mergeTasks([localTask], [remoteTask]);
    expect(merged.length).toBe(2);
    expect(merged.find((t) => t.id === 'local-only')).toBeDefined();
    expect(merged.find((t) => t.id === 'remote-only')).toBeDefined();
  });

  it('resolves metadata conflicts using Last-Write-Wins (LWW)', () => {
    const local: Task = {
      ...baseTask,
      title: 'Water Fern in Living Room',
      updatedAt: 2000,
    };
    const remote: Task = {
      ...baseTask,
      title: 'Water Small Fern',
      updatedAt: 1500,
    };

    const resolved = resolveTaskConflict(local, remote);
    expect(resolved.title).toBe('Water Fern in Living Room');
    expect(resolved.updatedAt).toBe(2000);
  });

  it('unions completion history when tasks are checked off across devices', () => {
    const phoneVersion: Task = {
      ...baseTask,
      completionHistory: [500, 1500],
      updatedAt: 1500,
    };
    const laptopVersion: Task = {
      ...baseTask,
      completionHistory: [500, 2500],
      updatedAt: 2500,
    };

    const resolved = resolveTaskConflict(phoneVersion, laptopVersion);
    expect(resolved.completionHistory).toEqual([500, 1500, 2500]);
  });

  it('caps the union of completion history at 365 entries', () => {
    const history = (start: number) => Array.from({ length: 300 }, (_, i) => start + i);
    const resolved = resolveTaskConflict(
      { ...baseTask, completionHistory: history(1), updatedAt: 1 },
      { ...baseTask, completionHistory: history(200), updatedAt: 2 }
    );
    expect(resolved.completionHistory).toHaveLength(365);
    expect(resolved.completionHistory.at(-1)).toBe(499);
  });

  it('unions skippedDates and preserves startDate across conflicts', () => {
    const phoneVersion: Task = {
      ...baseTask,
      startDate: '2026-09-01',
      skippedDates: ['2026-09-10'],
      updatedAt: 1500,
    };
    const laptopVersion: Task = {
      ...baseTask,
      skippedDates: ['2026-09-10', '2026-09-15'],
      updatedAt: 2500,
    };

    const resolved = resolveTaskConflict(phoneVersion, laptopVersion);
    expect(resolved.skippedDates).toEqual(['2026-09-10', '2026-09-15']);
    expect(resolved.startDate).toBe('2026-09-01');
  });

  it('respects soft-delete tombstones', () => {
    const activeLocal: Task = {
      ...baseTask,
      updatedAt: 1000,
    };
    const deletedRemote: Task = {
      ...baseTask,
      deletedAt: 1800,
      updatedAt: 1800,
    };

    const resolved = resolveTaskConflict(activeLocal, deletedRemote);
    expect(resolved.deletedAt).toBe(1800);
  });

  it('resurrects a task if an update occurred after a deletion', () => {
    const deletedRemote: Task = {
      ...baseTask,
      deletedAt: 1500,
      updatedAt: 1500,
    };
    const updatedLocal: Task = {
      ...baseTask,
      title: 'Resurrected Task',
      deletedAt: null,
      updatedAt: 2000,
    };

    const resolved = resolveTaskConflict(updatedLocal, deletedRemote);
    expect(resolved.deletedAt).toBeNull();
    expect(resolved.title).toBe('Resurrected Task');
  });

  it('merges one-off and recurring fields via LWW', () => {
    const local: Task = {
      ...baseTask,
      recurrence: null,
      listId: 'list-work',
      updatedAt: 3000,
    };
    const remote: Task = {
      ...baseTask,
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
      },
      listId: INBOX_LIST_ID,
      updatedAt: 2000,
    };

    const resolved = resolveTaskConflict(local, remote);
    expect(resolved.recurrence).toBeNull();
    expect(resolved.listId).toBe('list-work');
  });

  it('merges lists with LWW and soft-delete rules', () => {
    const localOnly: TaskList = { ...baseList, id: 'local-list' };
    const remoteOnly: TaskList = { ...baseList, id: 'remote-list', name: 'Work' };
    const merged = mergeLists([localOnly], [remoteOnly]);
    expect(merged.length).toBe(2);

    const local: TaskList = { ...baseList, name: 'Home Renamed', updatedAt: 2000 };
    const remote: TaskList = { ...baseList, name: 'Home Old', updatedAt: 1000 };
    const resolved = resolveListConflict(local, remote);
    expect(resolved.name).toBe('Home Renamed');
  });

  it('merges folders with LWW', () => {
    const a: Folder = {
      id: 'f1',
      name: 'Personal',
      sortOrder: 1,
      createdAt: 1000,
      updatedAt: 1000,
    };
    const b: Folder = {
      id: 'f1',
      name: 'Personal Renamed',
      sortOrder: 1,
      createdAt: 1000,
      updatedAt: 2000,
    };
    const merged = mergeFolders([a], [b]);
    expect(merged).toHaveLength(1);
    expect(merged[0].name).toBe('Personal Renamed');
  });

  it('unions removedCompletions CRDT tombstones, subtracts deleted entries, and clears startDate on window tasks', () => {
    const ts1 = new Date(2026, 4, 1, 12, 0, 0).getTime();
    const ts2 = new Date(2026, 4, 10, 12, 0, 0).getTime();
    const ts3 = new Date(2026, 4, 18, 12, 0, 0).getTime();

    const windowBase: Task = {
      id: 'approx-1',
      title: 'Vacuum rug',
      listId: INBOX_LIST_ID,
      dueAt: null,
      startDate: '2026-05-01',
      recurrence: {
        type: 'after_completion',
        intervalValue: 5,
        maxIntervalValue: 8,
        intervalUnit: 'days',
      },
      completionHistory: [ts1],
      removedCompletions: [ts2],
      createdAt: 1000,
      updatedAt: 2000,
    };

    // Device B still has ts2 in history and also completed ts3, while removing ts1
    const remote: Task = {
      ...windowBase,
      startDate: '2026-04-20',
      completionHistory: [ts1, ts2, ts3],
      removedCompletions: [ts1],
      updatedAt: 3000,
    };

    const merged = mergeTasks([windowBase], [remote]);
    expect(merged).toHaveLength(1);
    expect(merged[0].removedCompletions).toEqual([ts1, ts2].sort((a, b) => a - b));
    expect(merged[0].completionHistory).toEqual([ts3]);
    expect(merged[0].startDate).toBeNull();
  });

  it('unions removedSkippedDates tombstones so unskipped dates do not resurrect and preserves winner rescheduledDates/scheduleHistory', () => {
    const local: Task = {
      id: 'rec-merge-1',
      title: 'Trash',
      listId: INBOX_LIST_ID,
      dueAt: '2026-11-22',
      startDate: '2026-11-22',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [0] },
      completionHistory: [],
      skippedDates: ['2026-11-07'],
      removedSkippedDates: ['2026-11-28'],
      rescheduledDates: { '2026-11-29': '2026-11-30' },
      scheduleHistory: [
        {
          startDate: '2026-11-01',
          endDate: '2026-11-20',
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [6] },
        },
      ],
      createdAt: 1000,
      updatedAt: 4000,
    };
    const remote: Task = {
      ...local,
      startDate: '2026-11-01',
      skippedDates: ['2026-11-07', '2026-11-28'],
      removedSkippedDates: undefined,
      rescheduledDates: undefined,
      scheduleHistory: undefined,
      updatedAt: 2000,
    };

    const merged = mergeTasks([local], [remote]);
    expect(merged).toHaveLength(1);
    expect(merged[0].skippedDates).toEqual(['2026-11-07']);
    expect(merged[0].removedSkippedDates).toEqual(['2026-11-28']);
    expect(merged[0].startDate).toBe('2026-11-22');
    expect(merged[0].rescheduledDates).toEqual({ '2026-11-29': '2026-11-30' });
    expect(merged[0].scheduleHistory).toHaveLength(1);
  });

  it('prunes tombstones with deletedAt <= prunedBefore across tasks, lists, and folders', () => {
    const cutoff = 5000;
    const localTasks: Task[] = [
      { ...baseTask, id: 'old-del', deletedAt: 4000, updatedAt: 4000 },
      { ...baseTask, id: 'exact-del', deletedAt: 5000, updatedAt: 5000 },
      { ...baseTask, id: 'fresh-del', deletedAt: 5001, updatedAt: 5001 },
      { ...baseTask, id: 'active-task', updatedAt: 3000 },
    ];
    const remoteTasks: Task[] = [
      { ...baseTask, id: 'remote-old-del', deletedAt: 2000, updatedAt: 2000 },
      { ...baseTask, id: 'active-task', updatedAt: 3000 },
    ];
    const mergedTasks = mergeTasks(localTasks, remoteTasks, { prunedBefore: cutoff });
    expect(mergedTasks.map((t) => t.id)).toEqual(['fresh-del', 'active-task']);

    const mergedLists = mergeLists(
      [
        { id: INBOX_LIST_ID, name: 'Inbox', createdAt: 1, updatedAt: 1 },
        { id: 'l-old', name: '', createdAt: 1, updatedAt: 1000, deletedAt: 1000 },
        { id: 'l-new', name: '', createdAt: 1, updatedAt: 6000, deletedAt: 6000 },
      ],
      [],
      { prunedBefore: cutoff }
    );
    expect(mergedLists.map((l) => l.id)).toEqual([INBOX_LIST_ID, 'l-new']);

    const mergedFolders = mergeFolders(
      [{ id: 'f-old', name: '', createdAt: 1, updatedAt: 2000, deletedAt: 2000 }],
      [{ id: 'f-new', name: '', createdAt: 1, updatedAt: 7000, deletedAt: 7000 }],
      { prunedBefore: cutoff }
    );
    expect(mergedFolders.map((f) => f.id)).toEqual(['f-new']);
  });

  it('drops stale active local items removed and pruned remotely while preserving offline edits, inbox, and unsynced devices', () => {
    const prunedBefore = 5000;
    const localSyncedBefore = 4000;
    const localTasks: Task[] = [
      { ...baseTask, id: 'stale-active', updatedAt: 3000 },
      { ...baseTask, id: 'edited-offline', updatedAt: 4500 },
      { ...baseTask, id: 'kept-remote', updatedAt: 1000 },
    ];
    const remoteTasks: Task[] = [{ ...baseTask, id: 'kept-remote', updatedAt: 1000 }];

    const syncedMerge = mergeTasks(localTasks, remoteTasks, {
      prunedBefore,
      localSyncedBefore,
      hasRemote: true,
    });
    expect(syncedMerge.map((t) => t.id)).toEqual(['edited-offline', 'kept-remote']);

    // Fresh device (localSyncedBefore == null) keeps local active tasks instead of dropping them
    const freshDeviceMerge = mergeTasks(localTasks, remoteTasks, {
      prunedBefore,
      localSyncedBefore: null,
      hasRemote: true,
    });
    expect(freshDeviceMerge.map((t) => t.id)).toEqual([
      'stale-active',
      'edited-offline',
      'kept-remote',
    ]);

    // Inbox is always protected even if missing from remote
    const mergedLists = mergeLists(
      [
        { id: INBOX_LIST_ID, name: 'Inbox', createdAt: 1, updatedAt: 100 },
        { id: 'stale-list', name: 'Old', createdAt: 1, updatedAt: 100 },
      ],
      [],
      { prunedBefore, localSyncedBefore, hasRemote: true }
    );
    expect(mergedLists.map((l) => l.id)).toEqual([INBOX_LIST_ID]);
  });

  it('detects expired tombstones using TOMBSTONE_TTL_MS', () => {
    const now = 1_795_461_688_588;
    const cutoff = now - TOMBSTONE_TTL_MS;
    expect(hasExpiredTombstones([{ deletedAt: cutoff + 1 }], cutoff)).toBe(false);
    expect(hasExpiredTombstones([{ deletedAt: cutoff }], cutoff)).toBe(true);
    expect(hasExpiredTombstones([{ deletedAt: null }], cutoff)).toBe(false);
  });
});
