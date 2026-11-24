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

  it('keeps multi-week Sat+Sun aligned with calculateNextDueDate and preserves single-weekday 2-week jumps (Item J)', () => {
    const start = new Date(2026, 9, 3); // Sat Oct 3 2026
    const sun1 = nextWeekdayAfter(start, [6, 0], 2, start);
    expect(sun1.getFullYear()).toBe(2026);
    expect(sun1.getMonth()).toBe(9);
    expect(sun1.getDate()).toBe(4); // Sun Oct 4

    const sat2 = nextWeekdayAfter(sun1, [6, 0], 2, start);
    expect(sat2.getMonth()).toBe(9);
    expect(sat2.getDate()).toBe(17); // Sat Oct 17

    const sun2 = nextWeekdayAfter(sat2, [6, 0], 2, start);
    expect(sun2.getMonth()).toBe(9);
    expect(sun2.getDate()).toBe(18); // Sun Oct 18

    const rule = {
      type: 'fixed_interval' as const,
      intervalValue: 2,
      intervalUnit: 'weeks' as const,
      weekdays: [6, 0] as const,
    };
    const r = { ...rule, weekdays: [...rule.weekdays] };
    expect(calculateNextDueDate({ recurrence: r, startDate: '2026-10-03', dueAt: '2026-10-03' }, start)).toBe('2026-10-04');
    expect(calculateNextDueDate({ recurrence: r, startDate: '2026-10-03', dueAt: '2026-10-04' }, sun1)).toBe('2026-10-17');
    expect(calculateNextDueDate({ recurrence: r, startDate: '2026-10-03', dueAt: '2026-10-17' }, sat2)).toBe('2026-10-18');

    // Single-weekday 2-week step
    const mon = new Date(2026, 9, 5); // Mon Oct 5 2026
    const nextMon = nextWeekdayAfter(mon, [1], 2);
    expect(nextMon.getMonth()).toBe(9);
    expect(nextMon.getDate()).toBe(19);
  });
});
