import { describe, it, expect } from 'vitest';
import { applySavedFilter, dueBucketForTask, taskMatchesCriteria } from '../filters';
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

describe('Saved filters', () => {
  const now = new Date(2026, 9, 5, 12, 0, 0);

  const tasks: Task[] = [
    task({ id: '1', title: 'High overdue', dueAt: '2026-10-01', priority: 'high', tags: ['Work'] }),
    task({ id: '2', title: 'Today errand', dueAt: '2026-10-05', priority: 'medium', tags: ['Errands'], listId: 'home' }),
    task({ id: '3', title: 'Pinned later', dueAt: '2026-10-20', priority: 'low', pinned: true, tags: ['Work'] }),
    task({ id: '4', title: 'No due', dueAt: null, priority: 'none', tags: ['Health'] }),
  ];

  it('classifies due buckets', () => {
    expect(dueBucketForTask(tasks[0], now)).toBe('overdue');
    expect(dueBucketForTask(tasks[1], now)).toBe('today');
    expect(dueBucketForTask(tasks[2], now)).toBe('later');
    expect(dueBucketForTask(tasks[3], now)).toBe('none');
  });

  it('AND requires all criteria', () => {
    const matched = applySavedFilter(
      tasks,
      {
        match: 'and',
        criteria: { tags: ['Work'], priorities: ['high'] },
      },
      now
    );
    expect(matched.map((t) => t.id)).toEqual(['1']);
  });

  it('OR matches any criterion group', () => {
    const matched = applySavedFilter(
      tasks,
      {
        match: 'or',
        criteria: { tags: ['Health'], priorities: ['high'] },
      },
      now
    );
    expect(matched.map((t) => t.id).sort()).toEqual(['1', '4']);
  });

  it('supports list + pinned', () => {
    expect(
      taskMatchesCriteria(tasks[2], { pinnedOnly: true, listIds: [INBOX_LIST_ID] }, 'and', now)
    ).toBe(true);
    expect(
      taskMatchesCriteria(tasks[1], { pinnedOnly: true }, 'and', now)
    ).toBe(false);
  });
});
