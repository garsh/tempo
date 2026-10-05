import { describe, it, expect } from 'vitest';
import {
  calculateNextDueDate,
  formatRecurrenceLabel,
  nextMonthDayAfter,
  nextWeekdayAfter,
  willEndRecurrence,
} from '../recurrence';

describe('Phase 2 richer recurrence', () => {
  it('advances to next weekday (Mon–Fri)', () => {
    // Friday Oct 2, 2026
    const fri = new Date(2026, 9, 2);
    const next = nextWeekdayAfter(fri, [1, 2, 3, 4, 5], 1);
    // Next is Monday Oct 5
    expect(next.getFullYear()).toBe(2026);
    expect(next.getMonth()).toBe(9);
    expect(next.getDate()).toBe(5);
    expect(next.getDay()).toBe(1);
  });

  it('monthly-by-date clamps to end of short months', () => {
    // Jan 31 -> next month day 31 clamps to Feb 28 2026
    const jan31 = new Date(2026, 0, 31);
    const next = nextMonthDayAfter(jan31, 31, 1);
    expect(next.getMonth()).toBe(1);
    expect(next.getDate()).toBe(28);
  });

  it('calculateNextDueDate with weekdays (fixed)', () => {
    const next = calculateNextDueDate(
      {
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [1, 3, 5], // Mon Wed Fri
        },
        dueAt: '2026-10-05', // Monday
        completionHistory: [],
      },
      new Date(2026, 9, 5)
    );
    expect(next).toBe('2026-10-07'); // Wednesday
  });

  it('calculateNextDueDate with monthDay after completion', () => {
    const next = calculateNextDueDate(
      {
        recurrence: {
          type: 'after_completion',
          intervalValue: 1,
          intervalUnit: 'months',
          monthDay: 15,
        },
        dueAt: '2026-10-01',
        completionHistory: [],
      },
      new Date(2026, 9, 5)
    );
    expect(next).toBe('2026-10-15');
  });

  it('ends recurrence after count', () => {
    const rule = {
      type: 'after_completion' as const,
      intervalValue: 1,
      intervalUnit: 'days' as const,
      endAfterCount: 2,
    };
    expect(
      willEndRecurrence({ recurrence: rule, completionHistory: [1] }, '2026-10-10', 2)
    ).toBe(true);
    expect(
      willEndRecurrence({ recurrence: rule, completionHistory: [] }, '2026-10-10', 1)
    ).toBe(false);
  });

  it('ends recurrence when next due is after endOnDate', () => {
    const rule = {
      type: 'after_completion' as const,
      intervalValue: 1,
      intervalUnit: 'days' as const,
      endOnDate: '2026-10-06',
    };
    expect(
      willEndRecurrence({ recurrence: rule, completionHistory: [] }, '2026-10-07', 1)
    ).toBe(true);
  });

  it('returns null from calculateNextDueDate when ended', () => {
    const next = calculateNextDueDate(
      {
        recurrence: {
          type: 'after_completion',
          intervalValue: 1,
          intervalUnit: 'days',
          endAfterCount: 1,
        },
        dueAt: '2026-10-05',
        completionHistory: [],
      },
      new Date(2026, 9, 5)
    );
    expect(next).toBeNull();
  });

  it('formats weekday and monthDay labels', () => {
    expect(
      formatRecurrenceLabel({
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 2, 3, 4, 5],
      })
    ).toContain('Mon');
    expect(
      formatRecurrenceLabel({
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 1,
      })
    ).toContain('day 1');
  });
});
