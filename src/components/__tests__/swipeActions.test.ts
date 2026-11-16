import { describe, it, expect } from 'vitest';
import {
  getSkipOccurrenceDate,
  combineDueAt,
  splitDueAt,
  formatDate,
  addDays,
} from '../../domain/recurrence';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

describe('Swipe Actions & Dialogs logic', () => {
  const baseTask: Task = {
    id: 'test-1',
    title: 'Blood Pressure',
    listId: INBOX_LIST_ID,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    dueAt: '2026-11-16T08:30',
    priority: 'high',
    pinned: false,
    tags: ['health'],
    subtasks: [],
    completionHistory: [],
    recurrence: {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'days',
    },
  };

  describe('Change Date calculation', () => {
    it('correctly computes presets for today, tomorrow, and +1 week', () => {
      const today = new Date(2026, 10, 16); // Nov 16, 2026
      const todayStr = formatDate(today);
      const tomorrowStr = formatDate(addDays(today, 1));
      const nextWeekStr = formatDate(addDays(today, 7));

      expect(todayStr).toBe('2026-11-16');
      expect(tomorrowStr).toBe('2026-11-17');
      expect(nextWeekStr).toBe('2026-11-23');
    });

    it('combines new date with existing time or removes time when requested', () => {
      const existingDue = '2026-11-16T08:30';
      const parts = splitDueAt(existingDue);
      expect(parts.time).toBe('08:30');

      // Preserve time on new date
      const withTime = combineDueAt('2026-11-20', parts.time);
      expect(withTime).toBe('2026-11-20T08:30');

      // Clear time on new date
      const withoutTime = combineDueAt('2026-11-20', null);
      expect(withoutTime).toBe('2026-11-20');
    });
  });

  describe('Skip Occurrence calculation', () => {
    it('skips a daily recurring task to the next day and preserves time', () => {
      const next = getSkipOccurrenceDate(baseTask, '2026-11-16');
      expect(next).toBe('2026-11-17T08:30');
    });

    it('skips a weekly recurring task on Mon/Wed to Wed and then next Mon', () => {
      const weeklyTask: Task = {
        ...baseTask,
        title: 'Exercise',
        dueAt: '2026-11-16', // Mon Nov 16
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [1, 3], // Mon (1), Wed (3)
        },
      };

      // Skipping Mon Nov 16 moves to Wed Nov 18
      const next1 = getSkipOccurrenceDate(weeklyTask, '2026-11-16');
      expect(next1).toBe('2026-11-18');

      // Skipping Wed Nov 18 moves to Mon Nov 23
      const next2 = getSkipOccurrenceDate(weeklyTask, '2026-11-18');
      expect(next2).toBe('2026-11-23');
    });

    it('returns null for non-recurring task', () => {
      const nonRecurring: Task = {
        ...baseTask,
        recurrence: null,
      };
      expect(getSkipOccurrenceDate(nonRecurring)).toBeNull();
    });

    it('returns null when skipping reaches the recurrence endOnDate', () => {
      const endingTask: Task = {
        ...baseTask,
        dueAt: '2026-11-16',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'days',
          endOnDate: '2026-11-16',
        },
      };
      expect(getSkipOccurrenceDate(endingTask, '2026-11-16')).toBeNull();
    });
  });

  describe('Swipe Drawer Snap Thresholds', () => {
    const DRAWER_WIDTH = 160;
    const SNAP_RATIO = 0.35;

    const shouldSnapOpen = (offset: number): boolean => {
      return offset < -DRAWER_WIDTH * SNAP_RATIO;
    };

    it('snaps open if swiped past threshold (-56px)', () => {
      expect(shouldSnapOpen(-60)).toBe(true);
      expect(shouldSnapOpen(-100)).toBe(true);
      expect(shouldSnapOpen(-160)).toBe(true);
    });

    it('snaps closed if swiped less than threshold', () => {
      expect(shouldSnapOpen(-30)).toBe(false);
      expect(shouldSnapOpen(-10)).toBe(false);
      expect(shouldSnapOpen(0)).toBe(false);
    });

    it('clamps right swipe so cards cannot be dragged right past 0', () => {
      const clampOffset = (offset: number) => Math.min(0, Math.max(-DRAWER_WIDTH - 25, offset));
      expect(clampOffset(50)).toBe(0);
      expect(clampOffset(-80)).toBe(-80);
      expect(clampOffset(-250)).toBe(-185);
    });
  });

  describe('Delete confirmation dialog text logic', () => {
    it('differentiates recurring tasks to warn that all occurrences will be deleted', () => {
      const recurring = true;
      const getWarningText = (isRec: boolean, title: string) => {
        return isRec
          ? `This is a recurring task. Deleting it will remove all scheduled occurrences.`
          : `Are you sure you want to delete "${title}"? This task will be removed from your list.`;
      };

      expect(getWarningText(recurring, 'Blood Pressure')).toContain(
        'This is a recurring task. Deleting it will remove all scheduled occurrences.'
      );
      expect(getWarningText(false, 'Buy milk')).toContain(
        'This task will be removed from your list.'
      );
    });
  });
});
