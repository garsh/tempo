import { describe, it, expect } from 'vitest';
import { mergeTasks, resolveTaskConflict } from '../merge';
import type { PeriodicTask } from '../../types/task';

describe('Merge & Conflict Resolution Engine', () => {
  const baseTask: PeriodicTask = {
    id: 'task-1',
    title: 'Water Fern',
    recurrenceType: 'after_completion',
    intervalValue: 3,
    intervalUnit: 'days',
    dueDate: '2026-09-25',
    createdAt: 1000,
    updatedAt: 1000,
    completionHistory: [500],
  };

  it('keeps local-only and adds remote-only tasks', () => {
    const localTask: PeriodicTask = { ...baseTask, id: 'local-only' };
    const remoteTask: PeriodicTask = { ...baseTask, id: 'remote-only' };

    const merged = mergeTasks([localTask], [remoteTask]);
    expect(merged.length).toBe(2);
    expect(merged.find((t) => t.id === 'local-only')).toBeDefined();
    expect(merged.find((t) => t.id === 'remote-only')).toBeDefined();
  });

  it('resolves metadata conflicts using Last-Write-Wins (LWW)', () => {
    const local: PeriodicTask = {
      ...baseTask,
      title: 'Water Fern in Living Room',
      updatedAt: 2000, // Newer
    };
    const remote: PeriodicTask = {
      ...baseTask,
      title: 'Water Small Fern',
      updatedAt: 1500, // Older
    };

    const resolved = resolveTaskConflict(local, remote);
    expect(resolved.title).toBe('Water Fern in Living Room');
    expect(resolved.updatedAt).toBe(2000);
  });

  it('unions completion history when tasks are checked off across devices', () => {
    // Phone completed at 1500
    const phoneVersion: PeriodicTask = {
      ...baseTask,
      completionHistory: [500, 1500],
      updatedAt: 1500,
    };
    // Laptop completed at 2500
    const laptopVersion: PeriodicTask = {
      ...baseTask,
      completionHistory: [500, 2500],
      updatedAt: 2500,
    };

    const resolved = resolveTaskConflict(phoneVersion, laptopVersion);
    expect(resolved.completionHistory).toEqual([500, 1500, 2500]);
  });

  it('respects soft-delete tombstones', () => {
    const activeLocal: PeriodicTask = {
      ...baseTask,
      updatedAt: 1000,
    };
    const deletedRemote: PeriodicTask = {
      ...baseTask,
      deletedAt: 1800,
      updatedAt: 1800,
    };

    const resolved = resolveTaskConflict(activeLocal, deletedRemote);
    expect(resolved.deletedAt).toBe(1800);
  });

  it('resurrects a task if an update occurred after a deletion', () => {
    const deletedRemote: PeriodicTask = {
      ...baseTask,
      deletedAt: 1500,
      updatedAt: 1500,
    };
    const updatedLocal: PeriodicTask = {
      ...baseTask,
      title: 'Resurrected Task',
      deletedAt: null,
      updatedAt: 2000, // updated after deletion
    };

    const resolved = resolveTaskConflict(updatedLocal, deletedRemote);
    expect(resolved.deletedAt).toBeNull();
    expect(resolved.title).toBe('Resurrected Task');
  });
});
