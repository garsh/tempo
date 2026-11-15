import { describe, it, expect } from 'vitest';
import { buildAgenda, buildMonthGrid, completedTasksOnDate, tasksDueOnDate } from '../calendar';
import { completionTimestampForDate } from '../recurrence';
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

describe('week start', () => {
  it('rotates month grid + labels for Monday / Saturday starts', async () => {
    const { buildMonthGrid, weekdayLabels, startOfWeek } = await import('../calendar');
    // Oct 1 2026 is a Thursday
    expect(buildMonthGrid(2026, 9, new Date(2026, 9, 6), 0)[0].dateStr).toBe('2026-09-27');
    expect(buildMonthGrid(2026, 9, new Date(2026, 9, 6), 1)[0].dateStr).toBe('2026-09-28');
    expect(buildMonthGrid(2026, 9, new Date(2026, 9, 6), 6)[0].dateStr).toBe('2026-09-26');
    expect(weekdayLabels(1)[0]).toBe('Mon');
    expect(weekdayLabels(6)).toEqual(['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    expect(startOfWeek(new Date(2026, 9, 4), 1).getDate()).toBe(28);
  });
});

describe('Calendar recurring tasks', () => {
  it('shows recurring tasks on every repeat day and marks completion per day only', () => {
    const oct6Ts = completionTimestampForDate('2026-10-06');
    const tasks = [
      task({
        id: 'daily',
        title: 'Brush teeth',
        dueAt: '2026-10-05T08:00',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        completionHistory: [oct6Ts],
      }),
      task({
        id: 'mwf',
        title: 'Workout',
        dueAt: '2026-10-05',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [1, 3, 5],
        },
      }),
      task({
        id: 'weekly',
        title: 'Weekly review',
        dueAt: '2026-10-05',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      task({
        id: 'monthly',
        title: 'Pay rent',
        dueAt: '2026-10-05',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'months',
          monthDay: 5,
        },
      }),
    ];

    expect(tasksDueOnDate(tasks, '2026-10-05').map((t) => t.id)).toEqual([
      'daily',
      'mwf',
      'weekly',
      'monthly',
    ]);
    // Oct 6: daily was completed for Oct 6 only; mwf/weekly/monthly do not repeat on Tuesday Oct 6
    expect(tasksDueOnDate(tasks, '2026-10-06')).toEqual([]);
    const doneOct6 = completedTasksOnDate(tasks, '2026-10-06');
    expect(doneOct6.map((t) => t.id)).toEqual(['daily']);
    expect(doneOct6[0].completedAt).toBe(oct6Ts);
    expect(doneOct6[0].dueAt).toBe('2026-10-06T08:00');

    // Oct 7: daily and mwf are both open again
    expect(tasksDueOnDate(tasks, '2026-10-07').map((t) => t.id)).toEqual(['daily', 'mwf']);
    expect(completedTasksOnDate(tasks, '2026-10-07')).toEqual([]);

    // Next week & next month
    expect(tasksDueOnDate(tasks, '2026-10-12').map((t) => t.id)).toEqual([
      'daily',
      'mwf',
      'weekly',
    ]);
    expect(tasksDueOnDate(tasks, '2026-11-05').map((t) => t.id)).toEqual(['daily', 'monthly']);

    // Agenda projects recurring tasks across days in the range
    const agenda = buildAgenda(tasks, new Date(2026, 9, 5), 4, false);
    expect(agenda.find((d) => d.dateStr === '2026-10-05')?.tasks.map((t) => t.id)).toEqual([
      'mwf',
      'weekly',
      'monthly',
      'daily',
    ]);
    expect(agenda.find((d) => d.dateStr === '2026-10-06')).toBeUndefined();
    expect(agenda.find((d) => d.dateStr === '2026-10-07')?.tasks.map((t) => t.id)).toEqual([
      'mwf',
      'daily',
    ]);
  });
});
