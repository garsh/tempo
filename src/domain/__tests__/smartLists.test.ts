import { describe, it, expect } from 'vitest';
import {
  filterByListId,
  filterInbox,
  filterNext7Days,
  filterToday,
  filterTomorrow,
} from '../smartLists';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'dueAt'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('Smart lists', () => {
  const now = new Date(2026, 9, 5, 10, 0, 0); // Oct 5, 2026

  const tasks: Task[] = [
    task({ id: '1', title: 'Overdue', dueAt: '2026-10-03' }),
    task({ id: '2', title: 'Today am', dueAt: '2026-10-05T09:00' }),
    task({ id: '3', title: 'Today pm', dueAt: '2026-10-05T18:00' }),
    task({ id: '4', title: 'Tomorrow', dueAt: '2026-10-06' }),
    task({ id: '5', title: 'In 3 days', dueAt: '2026-10-08' }),
    task({ id: '6', title: 'In 10 days', dueAt: '2026-10-15' }),
    task({ id: '7', title: 'No due', dueAt: null }),
    task({ id: '8', title: 'Done', dueAt: '2026-10-05', completedAt: 99, recurrence: null }),
    task({
      id: '9',
      title: 'Home list',
      dueAt: '2026-10-05',
      listId: 'home',
    }),
  ];

  it('Today includes overdue + due today, excludes completed and undated', () => {
    const ids = filterToday(tasks, now).map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2', '3', '9']);
  });

  it('Tomorrow only includes next calendar day', () => {
    expect(filterTomorrow(tasks, now).map((t) => t.id)).toEqual(['4']);
  });

  it('Next 7 Days includes through +6 days and overdue', () => {
    const ids = filterNext7Days(tasks, now).map((t) => t.id).sort();
    expect(ids).toEqual(['1', '2', '3', '4', '5', '9']);
  });

  it('Inbox filters by list id', () => {
    const ids = filterInbox(tasks).map((t) => t.id).sort();
    expect(ids).toContain('1');
    expect(ids).not.toContain('9');
    expect(ids).not.toContain('8'); // completed
  });

  it('filterByListId works for user lists', () => {
    expect(filterByListId(tasks, 'home').map((t) => t.id)).toEqual(['9']);
  });
});
