import { describe, it, expect } from 'vitest';
import {
  taskOccursOnDate,
  isCompletedOnDate,
  completionTimestampForDate,
  formatDate,
} from '../recurrence';
import { buildMonthGrid } from '../calendar';
import type { Task } from '../../types/task';

function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'title' | 'dueAt'>): Task {
  return {
    createdAt: 1000,
    updatedAt: 1000,
    subtasks: [],
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

/**
 * Computes calendar due date dots using the existing brute-force pattern:
 * For every cell in the grid, iterates through all recurring tasks.
 */
function computeDueDatesBruteForce(tasks: Task[], gridDateStrs: string[]): Set<string> {
  const result = new Set<string>();
  const recurringTasks: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt) continue;
    if (t.recurrence) {
      recurringTasks.push(t);
    } else if (!t.completedAt && t.dueAt) {
      result.add(t.dueAt.slice(0, 10));
    }
  }

  for (const dateStr of gridDateStrs) {
    if (!result.has(dateStr) && recurringTasks.some((t) => taskOccursOnDate(t, dateStr) && !isCompletedOnDate(t, dateStr))) {
      result.add(dateStr);
    }
  }

  return result;
}

/**
 * Projected occurrence generator caching occurrence sets per task.
 * Models the Phase 4 optimization.
 */
function computeDueDatesCached(tasks: Task[], gridDateStrs: string[]): Set<string> {
  const result = new Set<string>();
  const recurringTasks: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt) continue;
    if (t.recurrence) {
      recurringTasks.push(t);
    } else if (!t.completedAt && t.dueAt) {
      result.add(t.dueAt.slice(0, 10));
    }
  }

  const maxDateStr = gridDateStrs[gridDateStrs.length - 1];

  for (const t of recurringTasks) {
    const anchor = t.dueAt ? t.dueAt.slice(0, 10) : formatDate(new Date(t.createdAt));
    if (anchor > maxDateStr) continue;

    for (const dateStr of gridDateStrs) {
      if (dateStr < anchor) continue;
      if (result.has(dateStr)) continue;
      if (taskOccursOnDate(t, dateStr) && !isCompletedOnDate(t, dateStr)) {
        result.add(dateStr);
      }
    }
  }

  return result;
}

describe('Calendar Recurrence Computation & Cache Equivalence', () => {
  // Test across 3 contiguous 42-day month grids (Oct, Nov, Dec 2026)
  const octGrid = buildMonthGrid(2026, 9, new Date(2026, 10, 17)).map((c) => c.dateStr);
  const novGrid = buildMonthGrid(2026, 10, new Date(2026, 10, 17)).map((c) => c.dateStr);
  const decGrid = buildMonthGrid(2026, 11, new Date(2026, 10, 17)).map((c) => c.dateStr);

  const sampleTasks: Task[] = [
    // 1. One-off task
    makeTask({
      id: 'oneoff-1',
      title: 'Dentist Appointment',
      dueAt: '2026-11-12',
    }),
    // 2. Completed one-off task (should not produce indicator)
    makeTask({
      id: 'oneoff-done',
      title: 'Past Doctor Visit',
      dueAt: '2026-11-05',
      completedAt: 1000,
    }),
    // 3. Daily routine
    makeTask({
      id: 'rec-daily',
      title: 'Morning Yoga',
      dueAt: '2026-11-01',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
    }),
    // 4. Daily routine with completions on Nov 3 and Nov 4
    makeTask({
      id: 'rec-daily-comp',
      title: 'Journaling',
      dueAt: '2026-11-01',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      completionHistory: [
        completionTimestampForDate('2026-11-03'),
        completionTimestampForDate('2026-11-04'),
      ],
    }),
    // 5. Weekly on Mon, Wed, Fri
    makeTask({
      id: 'rec-mwf',
      title: 'Gym Workout',
      dueAt: '2026-10-26',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 3, 5],
      },
    }),
    // 6. Bi-weekly routine (every 2 weeks)
    makeTask({
      id: 'rec-biweekly',
      title: 'Deep House Cleaning',
      dueAt: '2026-11-01',
      recurrence: { type: 'fixed_interval', intervalValue: 2, intervalUnit: 'weeks' },
    }),
    // 7. Monthly on 15th
    makeTask({
      id: 'rec-monthly',
      title: 'Pay Credit Card Bill',
      dueAt: '2026-10-15',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'months', monthDay: 15 },
    }),
    // 8. Recurring routine ending on Nov 18
    makeTask({
      id: 'rec-ending',
      title: 'Temporary Antibiotics',
      dueAt: '2026-11-08',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'days',
        endOnDate: '2026-11-18',
      },
    }),
    // 9. Soft-deleted routine (must never be included)
    makeTask({
      id: 'rec-deleted',
      title: 'Cancelled Routine',
      dueAt: '2026-11-01',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      deletedAt: 5000,
    }),
    // 10. Future routine starting in December 2026
    makeTask({
      id: 'rec-future',
      title: 'Winter Maintenance',
      dueAt: '2026-12-15',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
    }),
  ];

  it('produces identical due date sets between brute force and optimized caching for November 2026', () => {
    const brute = computeDueDatesBruteForce(sampleTasks, novGrid);
    const cached = computeDueDatesCached(sampleTasks, novGrid);

    expect(brute.size).toBeGreaterThan(0);
    expect(cached).toEqual(brute);
  });

  it('produces identical due date sets for October 2026', () => {
    const brute = computeDueDatesBruteForce(sampleTasks, octGrid);
    const cached = computeDueDatesCached(sampleTasks, octGrid);

    expect(cached).toEqual(brute);
  });

  it('produces identical due date sets for December 2026', () => {
    const brute = computeDueDatesBruteForce(sampleTasks, decGrid);
    const cached = computeDueDatesCached(sampleTasks, decGrid);

    expect(cached).toEqual(brute);
  });

  it('excludes soft-deleted tasks completely from both computations', () => {
    const onlyDeleted: Task[] = [
      makeTask({
        id: 'del-1',
        title: 'Only Deleted',
        dueAt: '2026-11-15',
        deletedAt: 1000,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      }),
    ];

    const brute = computeDueDatesBruteForce(onlyDeleted, novGrid);
    const cached = computeDueDatesCached(onlyDeleted, novGrid);

    expect(brute.size).toBe(0);
    expect(cached.size).toBe(0);
  });

  it('respects recurrence endOnDate limits in both computations', () => {
    const tasks: Task[] = [
      makeTask({
        id: 'rec-ends',
        title: 'Limited duration',
        dueAt: '2026-11-10',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'days',
          endOnDate: '2026-11-14',
        },
      }),
    ];

    const brute = computeDueDatesBruteForce(tasks, novGrid);
    const cached = computeDueDatesCached(tasks, novGrid);

    expect(brute.has('2026-11-14')).toBe(true);
    expect(brute.has('2026-11-15')).toBe(false); // Past endOnDate
    expect(cached).toEqual(brute);
  });
});
