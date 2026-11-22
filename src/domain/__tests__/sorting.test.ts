import { describe, it, expect } from 'vitest';
import {
  computeTopSortOrder,
  sortTasksForDailyView,
  sortUndatedOneTimeTasks,
} from '../sorting';
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

describe('computeTopSortOrder', () => {
  it('returns 0 when empty or when no non-deleted task has a finite sortOrder', () => {
    expect(computeTopSortOrder([])).toBe(0);
    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'Unordered' }),
        task({ id: 'b', title: 'Deleted ordered', sortOrder: 500, deletedAt: 1000 }),
      ])
    ).toBe(0);
  });

  it('returns minSortOrder - 1000 across positive, zero, and negative values while ignoring deleted tasks', () => {
    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: 2000 }),
        task({ id: 'b', title: 'B', sortOrder: 1000 }),
        task({ id: 'deleted', title: 'Deleted', sortOrder: -50000, deletedAt: 999 }),
      ])
    ).toBe(0);

    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: 0 }),
        task({ id: 'b', title: 'B', sortOrder: 1000 }),
      ])
    ).toBe(-1000);

    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: -1000 }),
        task({ id: 'b', title: 'B', sortOrder: 0 }),
      ])
    ).toBe(-2000);
  });

  it('places sequentially top-inserted tasks ahead of both ordered and unordered tasks', () => {
    const existing = [
      task({ id: 'old-ordered', title: 'Old ordered', dueAt: '2026-10-05', sortOrder: 1000, createdAt: 100 }),
      task({ id: 'old-unordered', title: 'Old unordered', dueAt: '2026-10-05', createdAt: 200 }),
    ];
    const firstNew = task({
      id: 'new-1',
      title: 'New 1',
      dueAt: '2026-10-05',
      sortOrder: computeTopSortOrder(existing),
      createdAt: 300,
    });
    const secondNew = task({
      id: 'new-2',
      title: 'New 2',
      dueAt: '2026-10-05',
      sortOrder: computeTopSortOrder([...existing, firstNew]),
      createdAt: 400,
    });

    const all = [...existing, firstNew, secondNew];
    expect(sortTasksForDailyView(all).map((t) => t.id)).toEqual([
      'new-2',
      'new-1',
      'old-ordered',
      'old-unordered',
    ]);
    expect(sortUndatedOneTimeTasks(all).map((t) => t.id)).toEqual([
      'new-2',
      'new-1',
      'old-ordered',
      'old-unordered',
    ]);
  });
});
