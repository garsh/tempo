import { describe, it, expect } from 'vitest';
import { groupAndSortTasks, sortTasks } from '../groupSort';
import type { Task, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

const t = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({
  title: p.id,
  listId: INBOX_LIST_ID,
  createdAt: 1,
  updatedAt: 1,
  completionHistory: [],
  recurrence: null,
  ...p,
});

const now = new Date(2026, 9, 6, 8, 0, 0);
const todayKey = '2026-10-06';
const lists: TaskList[] = [
  { id: 'work', name: 'Work', sortOrder: 2, createdAt: 1, updatedAt: 1 },
  { id: 'home', name: 'Home', sortOrder: 1, createdAt: 1, updatedAt: 1 },
  { id: INBOX_LIST_ID, name: 'Inbox', createdAt: 1, updatedAt: 1 },
];

const tasks = [
  t({ id: 'b-low', title: 'banana', priority: 'low', dueAt: '2026-10-08', listId: 'work', tags: ['errand'], createdAt: 3 }),
  t({ id: 'a-high', title: 'Apple', priority: 'high', dueAt: '2026-10-06', listId: 'home', createdAt: 5 }),
  t({ id: 'c-none', title: 'cherry', createdAt: 9, tags: ['zeta', 'errand'] }),
  t({ id: 'd-over', title: 'date', priority: 'medium', dueAt: '2026-10-01', listId: 'work', createdAt: 2 }),
  t({ id: 'done', title: 'done', completedAt: 100 }),
];

describe('sortTasks', () => {
  it('sorts by title, priority, created; pinned first', () => {
    expect(sortTasks(tasks.slice(0, 4), 'title', now).map((x) => x.id)).toEqual(['a-high', 'b-low', 'c-none', 'd-over']);
    expect(sortTasks(tasks.slice(0, 4), 'priority', now).map((x) => x.id)).toEqual(['a-high', 'd-over', 'b-low', 'c-none']);
    expect(sortTasks(tasks.slice(0, 4), 'created', now).map((x) => x.id)).toEqual(['c-none', 'a-high', 'b-low', 'd-over']);
    const pinned = [...tasks.slice(0, 4), t({ id: 'zz', title: 'zz', pinned: true })];
    expect(sortTasks(pinned, 'title', now)[0].id).toBe('zz');
  });

  it('due order = overdue, today, upcoming, none', () => {
    expect(sortTasks(tasks.slice(0, 4), 'due', now).map((x) => x.id)).toEqual(['d-over', 'a-high', 'b-low', 'c-none']);
  });
});

describe('groupAndSortTasks', () => {
  const ids = (s: { tasks: Task[] }) => s.tasks.map((x) => x.id);

  it('groups by date (default) with trailing Completed', () => {
    const g = groupAndSortTasks(tasks, { groupBy: 'date', sortBy: 'due', includeCompleted: true, todayKey, now });
    expect(g.map((s) => s.id)).toEqual(['overdue', 'today', 'later', 'nodate', 'completed']);
    expect(ids(g[4])).toEqual(['done']);
  });

  it('omits Completed when not requested (Hide Completed)', () => {
    const g = groupAndSortTasks(tasks, { groupBy: 'none', sortBy: 'title', includeCompleted: false, now });
    expect(g).toHaveLength(1);
    expect(g[0].label).toBe('');
    expect(ids(g[0])).toEqual(['a-high', 'b-low', 'c-none', 'd-over']);
  });

  it('groups by list in Inbox-first, sortOrder order', () => {
    const g = groupAndSortTasks(tasks, { groupBy: 'list', sortBy: 'title', lists, now });
    expect(g.map((s) => s.label)).toEqual(['Inbox', 'Home', 'Work']);
    expect(ids(g[2])).toEqual(['b-low', 'd-over']);
  });

  it('groups by priority high → none', () => {
    const g = groupAndSortTasks(tasks, { groupBy: 'priority', sortBy: 'due', now });
    expect(g.map((s) => s.id)).toEqual(['pri:high', 'pri:medium', 'pri:low', 'pri:none']);
  });

  it('groups by first tag, untagged last', () => {
    const g = groupAndSortTasks(tasks, { groupBy: 'tag', sortBy: 'title', now });
    expect(g.map((s) => s.label)).toEqual(['#errand', '#zeta', 'No Tags']);
    expect(ids(g[0])).toEqual(['b-low']);
    expect(ids(g[1])).toEqual(['c-none']);
    expect(ids(g[2])).toEqual(['a-high', 'd-over']);
  });
});
