import { describe, it, expect } from 'vitest';
import {
  calculateNextDueDate,
  combineDueAt,
  completionTimestampForDate,
  formatDate,
  formatDateTime,
  formatRecurrenceLabel,
  getDaysDifference,
  getDueDeadline,
  getNextUncompletedOccurrenceDate,
  getTaskUrgency,
  hasDueTime,
  isCompleted,
  isCompletedOnDate,
  isRecurring,
  parseDate,
  parseDueAt,
  projectTaskForDate,
  splitDueAt,
  taskOccursOnDate,
} from '../recurrence';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

describe('Recurrence Engine', () => {
  it('formats and parses date correctly', () => {
    const d = new Date(2026, 8, 25); // Sep 25, 2026
    const str = formatDate(d);
    expect(str).toBe('2026-09-25');
    const parsed = parseDate('2026-09-25');
    expect(parsed.getFullYear()).toBe(2026);
    expect(parsed.getMonth()).toBe(8);
    expect(parsed.getDate()).toBe(25);
  });

  it('formats and parses datetime', () => {
    const d = new Date(2026, 8, 25, 14, 30);
    expect(formatDateTime(d)).toBe('2026-09-25T14:30');
    expect(hasDueTime('2026-09-25T14:30')).toBe(true);
    expect(hasDueTime('2026-09-25')).toBe(false);
    const parsed = parseDueAt('2026-09-25T14:30');
    expect(parsed.getHours()).toBe(14);
    expect(parsed.getMinutes()).toBe(30);
    expect(splitDueAt('2026-09-25T14:30')).toEqual({ date: '2026-09-25', time: '14:30' });
    expect(combineDueAt('2026-09-25', '09:15')).toBe('2026-09-25T09:15');
    expect(combineDueAt('2026-09-25', '')).toBe('2026-09-25');
  });

  it('treats date-only deadline as end of day', () => {
    const deadline = getDueDeadline('2026-09-25');
    expect(deadline.getHours()).toBe(23);
    expect(deadline.getMinutes()).toBe(59);
  });

  describe('calculateNextDueDate', () => {
    it('calculates after_completion cadence from completion date', () => {
      const task = {
        recurrence: {
          type: 'after_completion' as const,
          intervalValue: 3,
          intervalUnit: 'days' as const,
        },
        dueAt: '2026-09-20',
      };
      const completionDate = new Date(2026, 8, 25);
      expect(calculateNextDueDate(task, completionDate)).toBe('2026-09-28');
    });

    it('preserves time of day when rolling recurring due', () => {
      const task = {
        recurrence: {
          type: 'after_completion' as const,
          intervalValue: 1,
          intervalUnit: 'weeks' as const,
        },
        dueAt: '2026-09-20T09:00',
      };
      const completionDate = new Date(2026, 8, 25, 18, 0);
      expect(calculateNextDueDate(task, completionDate)).toBe('2026-10-02T09:00');
    });

    it('calculates after_completion with weeks and months', () => {
      const taskWeeks = {
        recurrence: {
          type: 'after_completion' as const,
          intervalValue: 2,
          intervalUnit: 'weeks' as const,
        },
        dueAt: '2026-09-01',
      };
      const completionDate = new Date(2026, 8, 10);
      expect(calculateNextDueDate(taskWeeks, completionDate)).toBe('2026-09-24');

      const taskMonths = {
        recurrence: {
          type: 'after_completion' as const,
          intervalValue: 1,
          intervalUnit: 'months' as const,
        },
        dueAt: '2026-09-01',
      };
      expect(calculateNextDueDate(taskMonths, completionDate)).toBe('2026-10-10');
    });

    it('advances fixed_interval from current due date', () => {
      const task = {
        recurrence: {
          type: 'fixed_interval' as const,
          intervalValue: 7,
          intervalUnit: 'days' as const,
        },
        dueAt: '2026-09-25',
      };
      const completionDate = new Date(2026, 8, 25);
      expect(calculateNextDueDate(task, completionDate)).toBe('2026-10-02');
    });

    it('catches up overdue fixed_interval tasks past completion date', () => {
      const task = {
        recurrence: {
          type: 'fixed_interval' as const,
          intervalValue: 7,
          intervalUnit: 'days' as const,
        },
        dueAt: '2026-09-01',
      };
      const completionDate = new Date(2026, 8, 25);
      expect(calculateNextDueDate(task, completionDate)).toBe('2026-09-29');
    });
  });

  describe('Urgency & Labels', () => {
    const today = new Date(2026, 8, 25, 12, 0, 0);

    it('computes days difference accurately', () => {
      expect(getDaysDifference('2026-09-23', today)).toBe(-2);
      expect(getDaysDifference('2026-09-25', today)).toBe(0);
      expect(getDaysDifference('2026-09-25T18:00', today)).toBe(0);
      expect(getDaysDifference('2026-09-28', today)).toBe(3);
    });

    it('categorizes urgency buckets including timed dues', () => {
      expect(getTaskUrgency('2026-09-24', today)).toBe('overdue');
      expect(getTaskUrgency('2026-09-25', today)).toBe('due_today');
      expect(getTaskUrgency('2026-09-25T09:00', today)).toBe('overdue'); // 9am already passed
      expect(getTaskUrgency('2026-09-25T18:00', today)).toBe('due_today');
      expect(getTaskUrgency('2026-09-27', today)).toBe('upcoming');
      expect(getTaskUrgency('2026-10-05', today)).toBe('later');
      expect(getTaskUrgency(null, today)).toBe('none');
    });

    it('formats human friendly recurrence labels', () => {
      expect(formatRecurrenceLabel('fixed_interval', 1, 'days')).toBe('Every day');
      expect(formatRecurrenceLabel('after_completion', 5, 'days')).toBe('5 days after completion');
      expect(
        formatRecurrenceLabel({
          type: 'after_completion',
          intervalValue: 2,
          intervalUnit: 'weeks',
        })
      ).toBe('2 weeks after completion');
    });

    it('detects recurring vs completed one-off', () => {
      expect(
        isRecurring({
          recurrence: { type: 'after_completion', intervalValue: 1, intervalUnit: 'days' },
        })
      ).toBe(true);
      expect(isRecurring({ recurrence: null })).toBe(false);
      expect(isCompleted({ recurrence: null, completedAt: 123 })).toBe(true);
      expect(isCompleted({ recurrence: null, completedAt: null })).toBe(false);
    });
  });
});

describe('12/24h time format', () => {
  it('formats clock times and due labels', async () => {
    const { formatClockTime, formatDueLabel } = await import('../recurrence');
    expect(formatClockTime('17:30', '12h')).toBe('5:30 PM');
    expect(formatClockTime('00:05', '12h')).toBe('12:05 AM');
    expect(formatClockTime('7:05', '24h')).toBe('07:05');
    expect(formatDueLabel('2026-10-06T17:30', '24h')).toBe('2026-10-06 17:30');
    expect(formatDueLabel('2026-10-06T17:30')).toBe('2026-10-06 5:30 PM');
  });
});

function recurringTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: new Date(2026, 9, 1, 8, 0).getTime(),
    updatedAt: new Date(2026, 9, 1, 8, 0).getTime(),
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('Per-day recurrence occurrences & completion', () => {
  it('matches daily, weekly, weekday, and monthly recurring tasks on repeat days', () => {
    const daily = recurringTask({
      id: 'd1',
      title: 'Daily',
      dueAt: '2026-10-05',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
    });
    expect(taskOccursOnDate(daily, '2026-10-04')).toBe(false);
    expect(taskOccursOnDate(daily, '2026-10-05')).toBe(true);
    expect(taskOccursOnDate(daily, '2026-10-06')).toBe(true);
    expect(taskOccursOnDate(daily, '2026-10-12')).toBe(true);

    const mwf = recurringTask({
      id: 'w1',
      title: 'Gym',
      dueAt: '2026-10-05', // Monday
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 3, 5],
      },
    });
    expect(taskOccursOnDate(mwf, '2026-10-05')).toBe(true); // Mon
    expect(taskOccursOnDate(mwf, '2026-10-06')).toBe(false); // Tue
    expect(taskOccursOnDate(mwf, '2026-10-07')).toBe(true); // Wed
    expect(taskOccursOnDate(mwf, '2026-10-09')).toBe(true); // Fri
    expect(taskOccursOnDate(mwf, '2026-10-12')).toBe(true); // Next Mon

    const weekly = recurringTask({
      id: 'wk1',
      title: 'Weekly',
      dueAt: '2026-10-05',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
    });
    expect(taskOccursOnDate(weekly, '2026-10-05')).toBe(true);
    expect(taskOccursOnDate(weekly, '2026-10-06')).toBe(false);
    expect(taskOccursOnDate(weekly, '2026-10-12')).toBe(true);

    const monthly = recurringTask({
      id: 'm1',
      title: 'Rent',
      dueAt: '2026-10-15',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 15,
      },
    });
    expect(taskOccursOnDate(monthly, '2026-10-15')).toBe(true);
    expect(taskOccursOnDate(monthly, '2026-10-16')).toBe(false);
    expect(taskOccursOnDate(monthly, '2026-11-15')).toBe(true);
    expect(taskOccursOnDate(monthly, '2026-12-15')).toBe(true);
  });

  it('tracks completion per day and preserves time when projecting', () => {
    const tsOct6 = completionTimestampForDate('2026-10-06');
    const daily = recurringTask({
      id: 'd2',
      title: 'Vitamins',
      dueAt: '2026-10-05T08:30',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      completionHistory: [tsOct6],
    });

    expect(isCompletedOnDate(daily, '2026-10-05')).toBe(false);
    expect(isCompletedOnDate(daily, '2026-10-06')).toBe(true);
    expect(isCompletedOnDate(daily, '2026-10-07')).toBe(false);

    const oct6 = projectTaskForDate(daily, '2026-10-06');
    expect(oct6.dueAt).toBe('2026-10-06T08:30');
    expect(oct6.completedAt).toBe(tsOct6);
    expect(isCompleted(oct6)).toBe(true);

    const oct7 = projectTaskForDate(daily, '2026-10-07');
    expect(oct7.dueAt).toBe('2026-10-07T08:30');
    expect(oct7.completedAt).toBeNull();
    expect(isCompleted(oct7)).toBe(false);

    expect(getNextUncompletedOccurrenceDate(daily, new Date(2026, 9, 6, 10, 0))).toBe('2026-10-07');
  });

  it('respects endOnDate and endAfterCount', () => {
    const limited = recurringTask({
      id: 'lim',
      title: 'Course',
      dueAt: '2026-10-05',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'days',
        endOnDate: '2026-10-07',
        endAfterCount: 2,
      },
      completionHistory: [completionTimestampForDate('2026-10-05')],
    });
    expect(taskOccursOnDate(limited, '2026-10-05')).toBe(true);
    expect(taskOccursOnDate(limited, '2026-10-06')).toBe(true);
    expect(taskOccursOnDate(limited, '2026-10-07')).toBe(false);
  });
});
