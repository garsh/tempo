import { describe, it, expect } from 'vitest';
import { groupTasksForListView } from '../taskGroups';
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

describe('groupTasksForListView', () => {
  it('buckets overdue, today, nodate, completed', () => {
    const groups = groupTasksForListView(
      [
        task({ id: '1', title: 'Old', dueAt: '2020-01-01' }),
        task({ id: '2', title: 'Now', dueAt: '2026-10-05' }),
        task({ id: '3', title: 'Someday' }),
        task({ id: '4', title: 'Done', completedAt: 1, completionHistory: [1] }),
      ],
      { includeCompleted: true, todayKey: '2026-10-05' }
    );
    expect(groups.map((g) => g.id)).toEqual(['overdue', 'today', 'nodate', 'completed']);
    expect(groups.find((g) => g.id === 'today')!.tasks[0].id).toBe('2');
  });
});
