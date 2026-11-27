import { describe, it, expect } from 'vitest';
import {
  addDays,
  calculateNextDueDate,
  combineDueAt,
  completionTimestampForDate,
  formatDate,
  formatDateTime,
  formatRecurrenceLabel,
  getDaysDifference,
  getDueDeadline,
  getNextUncompletedOccurrenceDate,
  getRecurrenceAnchor,
  getSkipOccurrenceDate,
  getTaskUrgency,
  hasDueTime,
  isCompleted,
  isCompletedOnDate,
  isRecurrenceFinished,
  isRecurring,
  isSkippedOnDate,
  parseDate,
  parseDueAt,
  projectTaskForDate,
  splitDueAt,
  taskOccursOnDate,
} from '../recurrence';
import type { Task } from '../../types/task';

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
      expect(formatRecurrenceLabel('fixed_interval', 1, 'years')).toBe('Every year');
      expect(formatRecurrenceLabel('after_completion', 5, 'days')).toBe('Every 5 days (approx)');
      expect(
        formatRecurrenceLabel({
          type: 'after_completion',
          intervalValue: 2,
          intervalUnit: 'weeks',
        })
      ).toBe('Every 2 weeks (approx)');
      expect(
        formatRecurrenceLabel({
          type: 'after_completion',
          intervalValue: 2,
          maxIntervalValue: 3,
          intervalUnit: 'months',
        })
      ).toBe('Every 2–3 months');
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

  it('does not resurface uncompleted dates older than latest completion in completionHistory', () => {
    const daily = recurringTask({
      id: 'd-skip',
      title: 'Vitamins',
      dueAt: '2026-10-01T08:30',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      completionHistory: [completionTimestampForDate('2026-10-06')],
    });

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

  describe('getSkipOccurrenceDate', () => {
    it('returns null for non-recurring tasks', () => {
      const oneoff: Task = {
        id: 'oneoff',
        title: 'Single Task',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        dueAt: '2026-11-16',
        priority: 'none',
        pinned: false,
        tags: [],
        subtasks: [],
        completionHistory: [],
        recurrence: null,
      };
      expect(getSkipOccurrenceDate(oneoff)).toBeNull();
    });

    it('skips a daily recurring task to the next day while preserving time', () => {
      const daily = recurringTask({
        id: 'daily-bp',
        title: 'Blood Pressure',
        dueAt: '2026-11-16T08:00',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      });
      expect(getSkipOccurrenceDate(daily, '2026-11-16')).toBe('2026-11-17T08:00');
    });

    it('skips a weekly recurring task on Mon/Wed to the next scheduled weekday', () => {
      const mw = recurringTask({
        id: 'mw',
        title: 'Exercise',
        dueAt: '2026-11-16', // Mon Nov 16 2026
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [1, 3],
        },
      });
      // Skipping Monday Nov 16 should advance to Wednesday Nov 18
      expect(getSkipOccurrenceDate(mw, '2026-11-16')).toBe('2026-11-18');
    });

    it('returns null if the next occurrence exceeds endOnDate', () => {
      const ending = recurringTask({
        id: 'ending',
        title: 'Last Day',
        dueAt: '2026-11-16',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'days',
          endOnDate: '2026-11-16',
        },
      });
      expect(getSkipOccurrenceDate(ending, '2026-11-16')).toBeNull();
    });

    it('skips over dates present in skippedDates when finding next occurrence', () => {
      const daily = recurringTask({
        id: 'daily-skipped',
        title: 'Daily Task',
        dueAt: '2026-11-16',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        skippedDates: ['2026-11-17', '2026-11-18'],
      });
      // Skipping Nov 16 should skip over 17 and 18 and land on Nov 19
      expect(getSkipOccurrenceDate(daily, '2026-11-16')).toBe('2026-11-19');
    });
  });

  describe('Decoupling recurrence inception anchor from dueAt (Item B) and skippedDates (Item A)', () => {
    it('preserves task occurrence for dates prior to dueAt when startDate is earlier', () => {
      const task = recurringTask({
        id: 'ab-ex',
        title: 'Ab Exercises',
        startDate: '2026-06-05',
        dueAt: '2026-11-23', // Pushed into the future
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        completionHistory: [completionTimestampForDate('2026-11-16')],
      });

      // Recurrence anchor respects startDate
      expect(getRecurrenceAnchor(task)).toBe('2026-06-05');

      // Intermediate dates before dueAt (e.g. Nov 17, 18, 19, 20, 21, 22) must still occur
      expect(taskOccursOnDate(task, '2026-11-17')).toBe(true);
      expect(taskOccursOnDate(task, '2026-11-18')).toBe(true);
      expect(taskOccursOnDate(task, '2026-11-22')).toBe(true);
      expect(taskOccursOnDate(task, '2026-11-23')).toBe(true);

      // Date before startDate does not occur
      expect(taskOccursOnDate(task, '2026-06-04')).toBe(false);
    });

    it('derives recurrence anchor from earliest completionHistory when startDate is not set', () => {
      const task = recurringTask({
        id: 'ab-legacy',
        title: 'Ab Exercises Legacy',
        dueAt: '2026-11-23',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        completionHistory: [completionTimestampForDate('2026-11-16')],
      });

      expect(getRecurrenceAnchor(task)).toBe('2026-11-16');
      expect(taskOccursOnDate(task, '2026-11-17')).toBe(true);
      expect(taskOccursOnDate(task, '2026-11-18')).toBe(true);
    });

    it('suppresses occurrences on specific skippedDates while keeping earlier and later days active', () => {
      const task = recurringTask({
        id: 'daily-specific-skip',
        title: 'Morning Routine',
        startDate: '2026-11-01',
        dueAt: '2026-11-17',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
        skippedDates: ['2026-11-18', '2026-11-22'],
      });

      expect(isSkippedOnDate(task, '2026-11-17')).toBe(false);
      expect(isSkippedOnDate(task, '2026-11-18')).toBe(true);
      expect(isSkippedOnDate(task, '2026-11-19')).toBe(false);
      expect(isSkippedOnDate(task, '2026-11-22')).toBe(true);

      // getNextUncompletedOccurrenceDate skips Nov 18 if checking on Nov 18
      const nextFrom18 = getNextUncompletedOccurrenceDate(task, new Date(2026, 10, 18, 9, 0));
      expect(nextFrom18).toBe('2026-11-19');
    });
  });

  describe('Multi-year fixed schedules & edge cases (Items I & J)', () => {
    it('finds 5-year and 10-year next occurrences and checks endOnDate accurately (Item I)', () => {
      const fiveYear = recurringTask({
        id: '5y',
        title: 'Eye exam',
        startDate: '2026-06-15',
        dueAt: '2026-06-15',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 5,
          intervalUnit: 'years',
          endOnDate: '2040-01-01',
        },
        completionHistory: [completionTimestampForDate('2026-06-15')],
      });
      expect(getNextUncompletedOccurrenceDate(fiveYear, new Date(2026, 5, 15, 9, 0))).toBe('2031-06-15');
      expect(isRecurrenceFinished(fiveYear, new Date(2026, 5, 15, 9, 0))).toBe(false);
      expect(getSkipOccurrenceDate(fiveYear, '2026-06-15')).toBe('2031-06-15');

      const endedBeforeNext = {
        ...fiveYear,
        recurrence: { ...fiveYear.recurrence!, endOnDate: '2030-01-01' },
      };
      expect(getNextUncompletedOccurrenceDate(endedBeforeNext, new Date(2026, 5, 15, 9, 0))).toBeNull();
      expect(isRecurrenceFinished(endedBeforeNext, new Date(2026, 5, 15, 9, 0))).toBe(true);

      const tenYear = recurringTask({
        id: '10y',
        title: 'Renew passport',
        startDate: '2026-06-15',
        dueAt: '2026-06-15',
        recurrence: { type: 'fixed_interval', intervalValue: 10, intervalUnit: 'years' },
        completionHistory: [completionTimestampForDate('2026-06-15')],
      });
      expect(getNextUncompletedOccurrenceDate(tenYear, new Date(2026, 5, 15, 9, 0))).toBe('2036-06-15');
      expect(getSkipOccurrenceDate(tenYear, '2026-06-15')).toBe('2036-06-15');

      const leapFourYear = recurringTask({
        id: 'leap-4y',
        title: 'Leap day check',
        startDate: '2024-02-29',
        dueAt: '2024-02-29',
        recurrence: { type: 'fixed_interval', intervalValue: 4, intervalUnit: 'years' },
        completionHistory: [completionTimestampForDate('2024-02-29')],
      });
      expect(getNextUncompletedOccurrenceDate(leapFourYear, new Date(2024, 1, 29, 9, 0))).toBe('2028-02-29');

      const fortyEightMonths = recurringTask({
        id: '48m',
        title: 'Quadrennial filter',
        startDate: '2026-01-15',
        dueAt: '2026-01-15',
        recurrence: { type: 'fixed_interval', intervalValue: 48, intervalUnit: 'months' },
        completionHistory: [completionTimestampForDate('2026-01-15')],
      });
      expect(getNextUncompletedOccurrenceDate(fortyEightMonths, new Date(2026, 0, 15, 9, 0))).toBe('2030-01-15');

      const twoHundredWeeks = recurringTask({
        id: '200w',
        title: 'Long weekly cycle',
        startDate: '2026-01-05',
        dueAt: '2026-01-05',
        recurrence: { type: 'fixed_interval', intervalValue: 200, intervalUnit: 'weeks' },
        completionHistory: [completionTimestampForDate('2026-01-05')],
      });
      const expected200w = formatDate(addDays(parseDate('2026-01-05'), 200 * 7));
      expect(getNextUncompletedOccurrenceDate(twoHundredWeeks, new Date(2026, 0, 5, 9, 0))).toBe(expected200w);

      const rescheduledEarlier = recurringTask({
        ...tenYear,
        id: '10y-resched',
        completionHistory: [],
        rescheduledDates: { '2026-06-15': '2027-03-01' },
      });
      expect(getNextUncompletedOccurrenceDate(rescheduledEarlier, new Date(2026, 5, 16, 9, 0))).toBe('2027-03-01');
    });

    it('excludes skippedDates from endAfterCount budget, invalidates cache, and steps long queries fast (Item J)', () => {
      const series = recurringTask({
        id: 'count-with-skip',
        title: 'Five sessions',
        startDate: '2026-01-01',
        dueAt: '2026-01-01',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'days',
          endAfterCount: 5,
        },
        skippedDates: ['2026-01-02'],
      });

      // Jan 1 (#1), Jan 2 (skipped), Jan 3 (#2), Jan 4 (#3), Jan 5 (#4), Jan 6 (#5), Jan 7 (ended)
      expect(taskOccursOnDate(series, '2026-01-01')).toBe(true);
      expect(taskOccursOnDate(series, '2026-01-03')).toBe(true);
      expect(taskOccursOnDate(series, '2026-01-06')).toBe(true);
      expect(taskOccursOnDate(series, '2026-01-07')).toBe(false);

      // Skipping the 5th actionable date pushes the 5th slot to Jan 7
      expect(getSkipOccurrenceDate(series, '2026-01-06')).toBe('2026-01-07');

      // Mutating skippedDates in place and by replacement invalidates progressive cache
      series.skippedDates!.push('2026-01-03');
      expect(taskOccursOnDate(series, '2026-01-07')).toBe(true);
      expect(taskOccursOnDate(series, '2026-01-08')).toBe(false);

      const replaced = { ...series, skippedDates: ['2026-01-02', '2026-01-03', '2026-01-04'] };
      expect(taskOccursOnDate(replaced, '2026-01-08')).toBe(true);
      expect(taskOccursOnDate(replaced, '2026-01-09')).toBe(false);

      // Far-future query on monthly endAfterCount completes rapidly
      const monthly = recurringTask({
        id: 'monthly-count',
        title: 'Trimestral',
        startDate: '2026-01-01',
        dueAt: '2026-01-01',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'months',
          endAfterCount: 3,
        },
      });
      expect(taskOccursOnDate(monthly, '2036-01-01')).toBe(false);
    });

    it('keeps multi-week Sat+Sun occurrences paired in the same active week and honors monthly monthDay anchor (Item J)', () => {
      const biweeklyWeekend = recurringTask({
        id: 'weekend-2w',
        title: 'Biweekly weekend',
        startDate: '2026-10-03', // Saturday
        dueAt: '2026-10-03',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 2,
          intervalUnit: 'weeks',
          weekdays: [6, 0], // Sat, Sun
        },
      });
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-03')).toBe(true);
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-04')).toBe(true);
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-10')).toBe(false);
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-11')).toBe(false);
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-17')).toBe(true);
      expect(taskOccursOnDate(biweeklyWeekend, '2026-10-18')).toBe(true);

      const monthlyDay1 = recurringTask({
        id: 'monthly-d1',
        title: 'Pay rent',
        startDate: '2026-11-23',
        dueAt: '2026-12-01',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'months',
          monthDay: 1,
        },
      });
      expect(taskOccursOnDate(monthlyDay1, '2026-11-23')).toBe(false);
      expect(taskOccursOnDate(monthlyDay1, '2026-12-01')).toBe(true);
      expect(getNextUncompletedOccurrenceDate(monthlyDay1, new Date(2026, 10, 23, 9, 0))).toBe('2026-12-01');
    });

    it('handles extreme far-past or invalid dueAt without hanging on catch-up loops', () => {
      const completionDate = new Date(2026, 10, 27, 10, 0);

      expect(
        calculateNextDueDate(
          {
            dueAt: '0100-01-01',
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
          },
          completionDate
        )
      ).toBe('2026-11-28');

      expect(
        calculateNextDueDate(
          {
            dueAt: '-200000-01-01T09:15',
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
          },
          completionDate
        )
      ).toBe('2026-11-28T09:15');

      expect(
        calculateNextDueDate(
          {
            dueAt: '0100-01-01',
            startDate: '0100-01-01',
            recurrence: {
              type: 'fixed_interval',
              intervalValue: 2,
              intervalUnit: 'weeks',
              weekdays: [5],
            },
          },
          completionDate
        )
      ).toMatch(/^\d{4}-\d{2}-\d{2}$/);

      expect(
        calculateNextDueDate(
          {
            dueAt: '0100-01-15',
            recurrence: {
              type: 'fixed_interval',
              intervalValue: 1,
              intervalUnit: 'months',
              monthDay: 15,
            },
          },
          completionDate
        )
      ).toBe('2026-12-15');

      expect(
        calculateNextDueDate(
          {
            dueAt: '1950-01-15',
            recurrence: {
              type: 'fixed_interval',
              intervalValue: 1,
              intervalUnit: 'months',
              monthDay: 15,
            },
          },
          completionDate
        )
      ).toBe('2026-12-15');

      expect(
        calculateNextDueDate(
          {
            dueAt: '1950-01-01',
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'months' },
          },
          completionDate
        )
      ).toBe('2026-12-01');

      expect(
        calculateNextDueDate(
          {
            dueAt: '0100-01-01',
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'months' },
          },
          completionDate
        )
      ).toBe('2026-12-27');

      expect(
        calculateNextDueDate(
          {
            dueAt: 'not-a-date',
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
          },
          completionDate
        )
      ).toBe('2026-11-28');
    });
  });
});

