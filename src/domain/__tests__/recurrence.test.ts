import { describe, it, expect } from 'vitest';
import {
  calculateNextDueDate,
  formatDate,
  formatRecurrenceLabel,
  getDaysDifference,
  getTaskUrgency,
  parseDate,
} from '../recurrence';

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

  describe('calculateNextDueDate', () => {
    it('calculates after_completion cadence from completion date', () => {
      const task = {
        recurrenceType: 'after_completion' as const,
        intervalValue: 3,
        intervalUnit: 'days' as const,
        dueDate: '2026-09-20',
      };
      // Completed on Sep 25, even though it was due Sep 20
      const completionDate = new Date(2026, 8, 25);
      const nextDue = calculateNextDueDate(task, completionDate);
      expect(nextDue).toBe('2026-09-28');
    });

    it('calculates after_completion with weeks and months', () => {
      const taskWeeks = {
        recurrenceType: 'after_completion' as const,
        intervalValue: 2,
        intervalUnit: 'weeks' as const,
        dueDate: '2026-09-01',
      };
      const completionDate = new Date(2026, 8, 10);
      expect(calculateNextDueDate(taskWeeks, completionDate)).toBe('2026-09-24');

      const taskMonths = {
        recurrenceType: 'after_completion' as const,
        intervalValue: 1,
        intervalUnit: 'months' as const,
        dueDate: '2026-09-01',
      };
      expect(calculateNextDueDate(taskMonths, completionDate)).toBe('2026-10-10');
    });

    it('advances fixed_interval from current due date', () => {
      const task = {
        recurrenceType: 'fixed_interval' as const,
        intervalValue: 7,
        intervalUnit: 'days' as const,
        dueDate: '2026-09-25',
      };
      const completionDate = new Date(2026, 8, 25);
      const nextDue = calculateNextDueDate(task, completionDate);
      expect(nextDue).toBe('2026-10-02');
    });

    it('catches up overdue fixed_interval tasks past completion date', () => {
      const task = {
        recurrenceType: 'fixed_interval' as const,
        intervalValue: 7,
        intervalUnit: 'days' as const,
        dueDate: '2026-09-01', // very overdue
      };
      // Completed on Sep 25
      const completionDate = new Date(2026, 8, 25);
      const nextDue = calculateNextDueDate(task, completionDate);
      // Sequence: Sep 1 -> Sep 8 -> Sep 15 -> Sep 22 -> Sep 29 (> Sep 25)
      expect(nextDue).toBe('2026-09-29');
    });
  });

  describe('Urgency & Labels', () => {
    const today = new Date(2026, 8, 25);

    it('computes days difference accurately', () => {
      expect(getDaysDifference('2026-09-23', today)).toBe(-2);
      expect(getDaysDifference('2026-09-25', today)).toBe(0);
      expect(getDaysDifference('2026-09-28', today)).toBe(3);
    });

    it('categorizes urgency buckets', () => {
      expect(getTaskUrgency('2026-09-24', today)).toBe('overdue');
      expect(getTaskUrgency('2026-09-25', today)).toBe('due_today');
      expect(getTaskUrgency('2026-09-27', today)).toBe('upcoming');
      expect(getTaskUrgency('2026-10-05', today)).toBe('later');
    });

    it('formats human friendly recurrence labels', () => {
      expect(formatRecurrenceLabel('fixed_interval', 1, 'days')).toBe('Every day');
      expect(formatRecurrenceLabel('fixed_interval', 3, 'days')).toBe('Every 3 days');
      expect(formatRecurrenceLabel('fixed_interval', 2, 'weeks')).toBe('Every 2 weeks');
      expect(formatRecurrenceLabel('after_completion', 1, 'days')).toBe('1 day after completion');
      expect(formatRecurrenceLabel('after_completion', 5, 'days')).toBe('5 days after completion');
    });
  });
});
