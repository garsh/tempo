import { describe, it, expect } from 'vitest';
import { mergeLists, mergeTasks, resolveListConflict, resolveTaskConflict } from '../merge';
import type { Task, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

describe('Merge & Conflict Resolution Engine', () => {
  const baseTask: Task = {
    id: 'task-1',
    title: 'Water Fern',
    listId: INBOX_LIST_ID,
    dueAt: '2026-09-25',
    recurrence: {
      type: 'after_completion',
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
});
