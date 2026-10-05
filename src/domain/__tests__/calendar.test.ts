import { describe, it, expect } from 'vitest';
import { buildAgenda, buildMonthGrid, tasksDueOnDate } from '../calendar';
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

describe('Calendar helpers', () => {
  it('builds a 42-cell month grid', () => {
    const grid = buildMonthGrid(2026, 9, new Date(2026, 9, 5)); // Oct 2026
    expect(grid).toHaveLength(42);
    expect(grid.some((c) => c.isToday && c.dateStr === '2026-10-05')).toBe(true);
    // Oct 1 2026 is Thursday → grid starts Sep 27
    expect(grid[0].dateStr).toBe('2026-09-27');
  });

  it('filters tasks due on a date', () => {
    const tasks = [
      task({ id: '1', title: 'A', dueAt: '2026-10-05T09:00' }),
      task({ id: '2', title: 'B', dueAt: '2026-10-06' }),
      task({ id: '3', title: 'Done', dueAt: '2026-10-05', completedAt: 1 }),
    ];
    expect(tasksDueOnDate(tasks, '2026-10-05').map((t) => t.id)).toEqual(['1']);
  });

  it('builds agenda with overdue bucket', () => {
    const now = new Date(2026, 9, 5);
    const tasks = [
      task({ id: '1', title: 'Old', dueAt: '2026-10-01' }),
      task({ id: '2', title: 'Today', dueAt: '2026-10-05' }),
      task({ id: '3', title: 'Soon', dueAt: '2026-10-07' }),
    ];
    const agenda = buildAgenda(tasks, now, 7, false);
    expect(agenda[0].dateStr).toBe('overdue');
    expect(agenda[0].tasks.map((t) => t.id)).toEqual(['1']);
    expect(agenda.some((d) => d.dateStr === '2026-10-05')).toBe(true);
    expect(agenda.some((d) => d.dateStr === '2026-10-07')).toBe(true);
  });
});
