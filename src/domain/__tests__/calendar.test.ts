import { describe, it, expect } from 'vitest';
import { buildMonthGrid, completedTasksOnDate, tasksDueOnDate } from '../calendar';
import { completionTimestampForDate } from '../recurrence';
import type { Task } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'dueAt'>): Task {
  return {
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
  });

  it('omits skipped occurrences on specific dates without affecting surrounding occurrences', () => {
    const tasks = [
      task({
        id: 'daily-skipped-cal',
        title: 'Daily Exercises',
        dueAt: '2026-10-05',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        skippedDates: ['2026-10-06'],
      }),
    ];

    expect(tasksDueOnDate(tasks, '2026-10-05').map((t) => t.id)).toEqual(['daily-skipped-cal']);
    // Oct 6 is skipped
    expect(tasksDueOnDate(tasks, '2026-10-06')).toEqual([]);
    // Oct 7 is open again
    expect(tasksDueOnDate(tasks, '2026-10-07').map((t) => t.id)).toEqual(['daily-skipped-cal']);
  });
});

describe('Overdue one-off task completed on a later date', () => {
  it('shows completed overdue one-off task only on its completion day while preserving original dueAt', () => {
    const completedTodayMs = new Date(2026, 10, 24, 10, 30, 0).getTime();
    const overdueCompleted = task({
      id: 'overdue-done',
      title: 'Pay electric bill',
      dueAt: '2026-11-20',
      completedAt: completedTodayMs,
      completionHistory: [completionTimestampForDate('2026-11-20'), completedTodayMs],
    });

    const todayDone = completedTasksOnDate([overdueCompleted], '2026-11-24');
    expect(todayDone.map((t) => t.id)).toEqual(['overdue-done']);
    expect(todayDone[0].dueAt).toBe('2026-11-20');
    expect(completedTasksOnDate([overdueCompleted], '2026-11-20')).toEqual([]);

    const movedToYesterdayMs = new Date(2026, 10, 23, 12, 0, 0).getTime();
    const editedCompleted = {
      ...overdueCompleted,
      completedAt: movedToYesterdayMs,
      completionHistory: [movedToYesterdayMs],
    };
    expect(completedTasksOnDate([editedCompleted], '2026-11-24')).toEqual([]);
    const yesterdayDone = completedTasksOnDate([editedCompleted], '2026-11-23');
    expect(yesterdayDone.map((t) => t.id)).toEqual(['overdue-done']);
    expect(yesterdayDone[0].dueAt).toBe('2026-11-20');
  });

  it('shows a one-off task due today with completedAt yesterday only on yesterday', () => {
    const completedYesterdayMs = new Date(2026, 10, 23, 12, 0, 0).getTime();
    const doneEarly = task({
      id: 'done-early',
      title: 'Submit report',
      dueAt: '2026-11-24',
      completedAt: completedYesterdayMs,
      completionHistory: [completedYesterdayMs],
    });

    expect(completedTasksOnDate([doneEarly], '2026-11-24')).toEqual([]);
    expect(completedTasksOnDate([doneEarly], '2026-11-23').map((t) => t.id)).toEqual(['done-early']);
  });

  it('shows a fixed recurring task with a completion on an off-schedule date', () => {
    const offScheduleTs = completionTimestampForDate('2026-10-06');
    const weekly = task({
      id: 'weekly-off',
      title: 'Weekly review',
      dueAt: '2026-10-05',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      completionHistory: [offScheduleTs],
    });

    const doneOffSchedule = completedTasksOnDate([weekly], '2026-10-06');
    expect(doneOffSchedule.map((t) => t.id)).toEqual(['weekly-off']);
    expect(doneOffSchedule[0].completedAt).toBe(offScheduleTs);
  });
});
