import { describe, it, expect } from 'vitest';
import { matchesSearch, matchesTag, sortTasksForDailyView } from '../sorting';
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

  it('matches search across title notes tags', () => {
    const t = task({
      id: '1',
      title: 'Buy milk',
      notes: 'Whole milk',
      tags: ['Groceries'],
    });
    expect(matchesSearch(t, 'milk')).toBe(true);
    expect(matchesSearch(t, 'groc')).toBe(true);
    expect(matchesSearch(t, 'xyz')).toBe(false);
    expect(matchesTag(t, 'Groceries')).toBe(true);
    expect(matchesTag(t, 'Work')).toBe(false);
    expect(matchesTag(t, null)).toBe(true);
  });
});
