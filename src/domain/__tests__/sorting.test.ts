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
  it('sorts earlier due date first, then creation order, then title', () => {
    const tasks = [
      task({ id: 'a', title: 'Later A', dueAt: '2026-10-20' }),
      task({ id: 'b', title: 'Overdue', dueAt: '2026-10-01' }),
      task({ id: 'c', title: 'Later B', dueAt: '2026-10-20' }),
      task({ id: 'd', title: 'Today', dueAt: '2026-10-05' }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps untimed same-day tasks in addition order (createdAt ascending)', () => {
    const tasks = [
      task({ id: '1', title: 'Zebra', dueAt: '2026-10-05', createdAt: 100 }),
      task({ id: '2', title: 'Apple', dueAt: '2026-10-05', createdAt: 200 }),
      task({ id: '3', title: 'Mango', dueAt: '2026-10-05', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('respects manual sortOrder within a day and places newly added items after ordered ones', () => {
    const tasks = [
      task({ id: 'a', title: 'First', dueAt: '2026-10-05', sortOrder: 2000, createdAt: 100 }),
      task({ id: 'b', title: 'Second', dueAt: '2026-10-05', sortOrder: 1000, createdAt: 200 }),
      task({ id: 'c', title: 'Third (new)', dueAt: '2026-10-05', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('preserves manual sortOrder across earlier-today overdue times', () => {
    const tasks = [
      task({ id: 'morning', title: 'Morning timed', dueAt: '2026-10-05T09:00', sortOrder: 3000 }),
      task({ id: 'untimed', title: 'Untimed today', dueAt: '2026-10-05', sortOrder: 1000 }),
      task({ id: 'afternoon', title: 'Afternoon moved down', dueAt: '2026-10-05T15:00', sortOrder: 2000 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual([
      'untimed',
      'afternoon',
      'morning',
    ]);
  });
});
