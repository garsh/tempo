import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';
import { db, completeTask, updateTaskCompletionDate } from '../db';
import { mergeTasks } from '../../domain/merge';
import { completionTimestampForDate, formatDate } from '../../domain/recurrence';

function makeStoredTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('updateTaskCompletionDate', () => {
  let store: Map<string, Task>;

  beforeEach(() => {
    store = new Map();
    vi.spyOn(db.tasks, 'get').mockImplementation(((id: string) =>
      Promise.resolve(store.get(id))) as never);
    vi.spyOn(db.tasks, 'put').mockImplementation(((t: Task) => {
      store.set(t.id, structuredClone(t));
      return Promise.resolve(t.id);
    }) as never);
    vi.spyOn(db.tasks, 'toArray').mockImplementation((() =>
      Promise.resolve(Array.from(store.values()))) as never);
    vi.spyOn(db, 'transaction').mockImplementation(((_mode: unknown, _table: unknown, cb: () => Promise<unknown>) =>
      cb()) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('moves an overdue one-off task completed today to yesterday while preserving dueAt and tombstoning today', async () => {
    const taskId = 'task1';
    const dueAt = '2026-11-27';
    const completedAtToday = new Date(2026, 10, 28, 10, 0, 0).getTime();
    const task = makeStoredTask(taskId, { dueAt, recurrence: null });
    store.set(taskId, task);

    vi.spyOn(Date, 'now').mockReturnValue(completedAtToday);
    const afterComplete = await completeTask(taskId, '2026-11-28');
    expect(afterComplete).not.toBeNull();
    const preEditSnapshot = structuredClone(afterComplete!);

    vi.spyOn(Date, 'now').mockReturnValue(completedAtToday + 1000);
    const updatedTask = await updateTaskCompletionDate(taskId, '2026-11-28', '2026-11-27');
    expect(updatedTask).not.toBeNull();
    expect(updatedTask!.dueAt).toBe(dueAt);
    expect(formatDate(new Date(updatedTask!.completedAt!))).toBe('2026-11-27');
    expect(updatedTask!.completionHistory).toHaveLength(1);
    expect(formatDate(new Date(updatedTask!.completionHistory[0]))).toBe('2026-11-27');
    expect(updatedTask!.removedCompletions).toContain(completedAtToday);

    const merged = mergeTasks([updatedTask!], [preEditSnapshot]);
    expect(merged).toHaveLength(1);
    expect(merged[0].completionHistory).not.toContain(completedAtToday);
    expect(merged[0].completionHistory).toEqual(updatedTask!.completionHistory);
  });

  it('moves a one-off task due today and completed today to yesterday while preserving dueAt', async () => {
    const taskId = 'task2';
    const dueAt = '2026-11-28';
    const completedAtToday = new Date(2026, 10, 28, 10, 0, 0).getTime();
    const task = makeStoredTask(taskId, { dueAt });
    store.set(taskId, task);

    vi.spyOn(Date, 'now').mockReturnValue(completedAtToday);
    await completeTask(taskId, '2026-11-28');

    vi.spyOn(Date, 'now').mockReturnValue(completedAtToday + 1000);
    const updatedTask = await updateTaskCompletionDate(taskId, '2026-11-28', '2026-11-27');
    expect(updatedTask).not.toBeNull();
    expect(updatedTask!.dueAt).toBe(dueAt);
    expect(formatDate(new Date(updatedTask!.completedAt!))).toBe('2026-11-27');
  });

  it('moves a fixed-interval recurring completion to yesterday, tombstones today, and unskips yesterday', async () => {
    const taskId = 'task3';
    const dueAt = '2026-11-27';
    const startDate = '2026-11-27';
    const todayTs = new Date(2026, 10, 28, 10, 0, 0).getTime();
    const task = makeStoredTask(taskId, {
      dueAt,
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      startDate,
      completionHistory: [todayTs],
      skippedDates: ['2026-11-27'],
    });
    store.set(taskId, task);

    vi.spyOn(Date, 'now').mockReturnValue(todayTs + 1000);
    const updatedTask = await updateTaskCompletionDate(taskId, '2026-11-28', '2026-11-27');
    expect(updatedTask).not.toBeNull();
    expect(updatedTask!.completionHistory).not.toContain(todayTs);
    expect(updatedTask!.completionHistory).toEqual([completionTimestampForDate('2026-11-27', todayTs + 1000)]);
    expect(updatedTask!.removedCompletions).toContain(todayTs);
    expect(updatedTask!.skippedDates).not.toContain('2026-11-27');
    expect(updatedTask!.removedSkippedDates).toContain('2026-11-27');
    expect(updatedTask!.dueAt).toBe(dueAt);
    expect(updatedTask!.startDate).toBe(startDate);
    expect(updatedTask!.completedAt).toBeNull();
  });

  it('moves a window periodic completion to yesterday and tombstones today', async () => {
    const taskId = 'task4';
    const todayTs = new Date(2026, 10, 28, 10, 0, 0).getTime();
    const task = makeStoredTask(taskId, {
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 5,
        intervalUnit: 'days',
      },
      completionHistory: [todayTs],
    });
    store.set(taskId, task);

    vi.spyOn(Date, 'now').mockReturnValue(todayTs + 1000);
    const updatedTask = await updateTaskCompletionDate(taskId, '2026-11-28', '2026-11-27');
    expect(updatedTask).not.toBeNull();
    expect(updatedTask!.completionHistory).not.toContain(todayTs);
    expect(updatedTask!.completionHistory).toEqual([completionTimestampForDate('2026-11-27', todayTs + 1000)]);
    expect(updatedTask!.removedCompletions).toContain(todayTs);
    expect(updatedTask!.dueAt).toBeNull();
    expect(updatedTask!.completedAt).toBeNull();
  });
});
