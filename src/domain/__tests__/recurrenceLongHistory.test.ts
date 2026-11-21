import { describe, expect, it } from 'vitest';
import { completedTasksOnDate, tasksDueOnDate } from '../calendar';
import {
  completionTimestampForDate,
  getCompletedDateSet,
  getNextUncompletedOccurrenceDate,
  taskOccursOnDate,
} from '../recurrence';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

/** Local calendar dates every `step` days, independent of the recurrence engine. */
function everyNDays(start: string, step: number, count: number): string[] {
  const [y, m, d] = start.split('-').map(Number);
  const origin = new Date(y, m - 1, d);
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    const cur = new Date(origin);
    cur.setDate(origin.getDate() + i * step);
    const month = String(cur.getMonth() + 1).padStart(2, '0');
    const day = String(cur.getDate()).padStart(2, '0');
    out.push(`${cur.getFullYear()}-${month}-${day}`);
  }
  return out;
}

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'dueAt'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: new Date(2026, 0, 1).getTime(),
    updatedAt: new Date(2026, 0, 1).getTime(),
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('long completion histories', () => {
  it('keeps fixed-interval dates correct across a long history and excludes window tasks from due dates', () => {
    const dates = everyNDays('2026-03-01', 3, 40);
    const completed = dates.slice(0, 39);
    const routine = task({
      id: 'every-3',
      title: 'Water plants',
      dueAt: dates[0],
      recurrence: { type: 'fixed_interval', intervalValue: 3, intervalUnit: 'days' },
      completionHistory: completed.map((d) => completionTimestampForDate(d)),
    });

    const occursOn = (date: string) => {
      const first = taskOccursOnDate(routine, date);
      const second = taskOccursOnDate(routine, date);
      expect(second).toBe(first);
      return first;
    };

    for (const date of completed) expect(occursOn(date)).toBe(true);
    expect(occursOn(dates[39])).toBe(true);
    expect(occursOn('2026-03-02')).toBe(false);
    expect(occursOn('2026-03-03')).toBe(false);

    const [y, m, d] = dates[38].split('-').map(Number);
    expect(getNextUncompletedOccurrenceDate(routine, new Date(y, m - 1, d, 15, 0))).toBe(dates[39]);
    expect(getNextUncompletedOccurrenceDate(routine, new Date(y, m - 1, d, 15, 0))).toBe(dates[39]);

    expect(tasksDueOnDate([routine], dates[39]).map((t) => t.id)).toEqual(['every-3']);
    expect(tasksDueOnDate([routine], dates[10])).toEqual([]);
    expect(completedTasksOnDate([routine], dates[10]).map((t) => t.id)).toEqual(['every-3']);

    const approx = task({
      id: 'approx-3',
      title: 'Water ferns',
      dueAt: null,
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 5,
        intervalUnit: 'days',
      },
      completionHistory: completed.map((d) => completionTimestampForDate(d)),
    });
    expect(taskOccursOnDate(approx, dates[39])).toBe(false);
    expect(getNextUncompletedOccurrenceDate(approx, new Date(y, m - 1, d, 15, 0))).toBeNull();
    expect(tasksDueOnDate([approx], dates[39])).toEqual([]);
    expect(completedTasksOnDate([approx], dates[10]).map((t) => t.id)).toEqual(['approx-3']);

    const sameIdWithoutHistory = { ...routine, completionHistory: [] as number[] };
    expect(getCompletedDateSet(sameIdWithoutHistory).size).toBe(0);
    expect([...getCompletedDateSet(routine)].sort()).toEqual([...completed].sort());
  });

  it('finds the next day after a long run of daily completions', () => {
    const dates = everyNDays('2026-01-01', 1, 120);
    const daily = task({
      id: 'daily',
      title: 'Vitamins',
      dueAt: '2026-01-01',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      completionHistory: dates.map((d) => completionTimestampForDate(d)),
    });
    const next = everyNDays('2026-01-01', 1, 121)[120];
    const [y, m, d] = dates[119].split('-').map(Number);
    expect(getNextUncompletedOccurrenceDate(daily, new Date(y, m - 1, d, 9, 0))).toBe(next);
    expect(taskOccursOnDate(daily, next)).toBe(true);
    expect(taskOccursOnDate(daily, '2025-12-31')).toBe(false);
    expect(tasksDueOnDate([daily], next).map((t) => t.id)).toEqual(['daily']);
    expect(completedTasksOnDate([daily], dates[60]).map((t) => t.id)).toEqual(['daily']);
  });

  it('stops a finished end-after-count series without dropping completed days', () => {
    const dates = everyNDays('2026-01-01', 1, 10);
    const limited = task({
      id: 'course',
      title: 'Course',
      dueAt: dates[0],
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'days',
        endAfterCount: 10,
      },
      completionHistory: dates.map((d) => completionTimestampForDate(d)),
    });

    for (const date of dates) expect(taskOccursOnDate(limited, date)).toBe(true);
    expect(taskOccursOnDate(limited, '2026-01-11')).toBe(false);
    const [y, m, d] = dates[9].split('-').map(Number);
    expect(getNextUncompletedOccurrenceDate(limited, new Date(y, m - 1, d, 9, 0))).toBeNull();
  });
});
