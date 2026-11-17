import { describe, it, expect } from 'vitest';
import { sortTasksForDailyView } from '../sorting';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('Sorting & search', () => {
  const now = new Date(2026, 9, 5, 12, 0, 0);

  it('sorts pinned, then urgency, then priority', () => {
    const tasks = [
      task({ id: 'a', title: 'Low later', dueAt: '2026-10-20', priority: 'low' }),
      task({ id: 'b', title: 'High overdue', dueAt: '2026-10-01', priority: 'high' }),
      task({ id: 'c', title: 'Pinned medium', dueAt: '2026-10-20', priority: 'medium', pinned: true }),
      task({ id: 'd', title: 'Today low', dueAt: '2026-10-05', priority: 'low' }),
    ];
    expect(sortTasksForDailyView(tasks, now).map((t) => t.id)).toEqual(['c', 'b', 'd', 'a']);
  });

  it('keeps untimed same-day tasks in addition order (createdAt ascending)', () => {
    const tasks = [
      task({ id: '1', title: 'Zebra', dueAt: '2026-10-05', createdAt: 100 }),
      task({ id: '2', title: 'Apple', dueAt: '2026-10-05', createdAt: 200 }),
      task({ id: '3', title: 'Mango', dueAt: '2026-10-05', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks, now).map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('respects manual sortOrder within a day and places newly added items after ordered ones', () => {
    const tasks = [
      task({ id: 'a', title: 'First', dueAt: '2026-10-05', priority: 'high', sortOrder: 2000, createdAt: 100 }),
      task({ id: 'b', title: 'Second', dueAt: '2026-10-05', priority: 'none', sortOrder: 1000, createdAt: 200 }),
      task({ id: 'c', title: 'Third (new)', dueAt: '2026-10-05', priority: 'high', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks, now).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('preserves manual sortOrder across earlier-today overdue times and pinned states', () => {
    const midDay = new Date(2026, 9, 5, 14, 0, 0);
    const tasks = [
      task({ id: 'morning', title: 'Morning timed', dueAt: '2026-10-05T09:00', sortOrder: 3000 }),
      task({ id: 'untimed', title: 'Untimed today', dueAt: '2026-10-05', sortOrder: 1000 }),
      task({ id: 'pinned-after', title: 'Pinned moved down', dueAt: '2026-10-05', pinned: true, sortOrder: 2000 }),
    ];
    expect(sortTasksForDailyView(tasks, midDay).map((t) => t.id)).toEqual([
      'untimed',
      'pinned-after',
      'morning',
    ]);
  });
});
