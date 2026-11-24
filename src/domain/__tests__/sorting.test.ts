import { describe, it, expect } from 'vitest';
import {
  computeTopSortOrder,
  sortRecurringByDueProximity,
  sortTasksForDailyView,
  sortUndatedOneTimeTasks,
  type RecurringSortEntry,
} from '../sorting';
import {
  formatRecurrenceLabel,
  formatRecurringDueSubtitle,
  getNextUncompletedOccurrenceDate,
  getWindowProgress,
} from '../recurrence';
import type { Task } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('Sorting & search', () => {
  it('sorts earlier due date first, then creation order, then title', () => {
    const tasks = [
      task({ id: 'a', title: 'Later A', dueAt: '2026-10-20' }),
      task({ id: 'b', title: 'Overdue', dueAt: '2026-10-01' }),
      task({ id: 'c', title: 'Later B', dueAt: '2026-10-20' }),
      task({ id: 'd', title: 'Today', dueAt: '2026-10-05' }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
  });

  it('keeps untimed same-day tasks in addition order (createdAt ascending)', () => {
    const tasks = [
      task({ id: '1', title: 'Zebra', dueAt: '2026-10-05', createdAt: 100 }),
      task({ id: '2', title: 'Apple', dueAt: '2026-10-05', createdAt: 200 }),
      task({ id: '3', title: 'Mango', dueAt: '2026-10-05', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['1', '2', '3']);
  });

  it('respects manual sortOrder within a day and places newly added items after ordered ones', () => {
    const tasks = [
      task({ id: 'a', title: 'First', dueAt: '2026-10-05', sortOrder: 2000, createdAt: 100 }),
      task({ id: 'b', title: 'Second', dueAt: '2026-10-05', sortOrder: 1000, createdAt: 200 }),
      task({ id: 'c', title: 'Third (new)', dueAt: '2026-10-05', createdAt: 300 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual(['b', 'a', 'c']);
  });

  it('preserves manual sortOrder across earlier-today overdue times', () => {
    const tasks = [
      task({ id: 'morning', title: 'Morning timed', dueAt: '2026-10-05T09:00', sortOrder: 3000 }),
      task({ id: 'untimed', title: 'Untimed today', dueAt: '2026-10-05', sortOrder: 1000 }),
      task({ id: 'afternoon', title: 'Afternoon moved down', dueAt: '2026-10-05T15:00', sortOrder: 2000 }),
    ];
    expect(sortTasksForDailyView(tasks).map((t) => t.id)).toEqual([
      'untimed',
      'afternoon',
      'morning',
    ]);
  });
});

describe('computeTopSortOrder', () => {
  it('returns 0 when empty or when no non-deleted task has a finite sortOrder', () => {
    expect(computeTopSortOrder([])).toBe(0);
    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'Unordered' }),
        task({ id: 'b', title: 'Deleted ordered', sortOrder: 500, deletedAt: 1000 }),
      ])
    ).toBe(0);
  });

  it('returns minSortOrder - 1000 across positive, zero, and negative values while ignoring deleted tasks', () => {
    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: 2000 }),
        task({ id: 'b', title: 'B', sortOrder: 1000 }),
        task({ id: 'deleted', title: 'Deleted', sortOrder: -50000, deletedAt: 999 }),
      ])
    ).toBe(0);

    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: 0 }),
        task({ id: 'b', title: 'B', sortOrder: 1000 }),
      ])
    ).toBe(-1000);

    expect(
      computeTopSortOrder([
        task({ id: 'a', title: 'A', sortOrder: -1000 }),
        task({ id: 'b', title: 'B', sortOrder: 0 }),
      ])
    ).toBe(-2000);
  });

  it('places sequentially top-inserted tasks ahead of both ordered and unordered tasks', () => {
    const existing = [
      task({ id: 'old-ordered', title: 'Old ordered', dueAt: '2026-10-05', sortOrder: 1000, createdAt: 100 }),
      task({ id: 'old-unordered', title: 'Old unordered', dueAt: '2026-10-05', createdAt: 200 }),
    ];
    const firstNew = task({
      id: 'new-1',
      title: 'New 1',
      dueAt: '2026-10-05',
      sortOrder: computeTopSortOrder(existing),
      createdAt: 300,
    });
    const secondNew = task({
      id: 'new-2',
      title: 'New 2',
      dueAt: '2026-10-05',
      sortOrder: computeTopSortOrder([...existing, firstNew]),
      createdAt: 400,
    });

    const all = [...existing, firstNew, secondNew];
    expect(sortTasksForDailyView(all).map((t) => t.id)).toEqual([
      'new-2',
      'new-1',
      'old-ordered',
      'old-unordered',
    ]);
    expect(sortUndatedOneTimeTasks(all).map((t) => t.id)).toEqual([
      'new-2',
      'new-1',
      'old-ordered',
      'old-unordered',
    ]);
  });
});

describe('sortRecurringByDueProximity', () => {
  function windowEntry(raw: Task, now: Date): RecurringSortEntry {
    const progress = getWindowProgress(raw, now)!;
    return {
      kind: 'window',
      raw,
      progress,
      subtitle: formatRecurringDueSubtitle(raw, progress, now),
    };
  }

  function fixedEntry(raw: Task, nextDate: string | null): RecurringSortEntry {
    return {
      kind: 'fixed',
      raw,
      projected: nextDate ? { ...raw, dueAt: nextDate, completedAt: null } : { ...raw, completedAt: null },
      nextDate,
      subtitle: formatRecurrenceLabel(raw.recurrence!),
    };
  }

  it('orders overdue (relative), due today/last day, in-window (relative), not_done_yet, upcoming (absolute days), and null fallback', () => {
    const now = new Date(2026, 10, 22, 12, 0); // 2026-11-22

    // Tier 0: Overdue
    // Daily fixed 2d overdue -> score = 1.01 + 2/1 = 3.01
    const fixedDailyOver = fixedEntry(
      task({
        id: 't0-fixed-daily',
        title: 'Daily meds',
        dueAt: '2026-11-20',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      }),
      '2026-11-20'
    );
    // Approx 3-5d done Nov 14 (8d ago -> 3d overdue) -> score = 1.01 + 3/5 = 1.61
    const approxOver = windowEntry(
      task({
        id: 't0-approx',
        title: 'Water plants',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 14, 10, 0).getTime()],
      }),
      now
    );
    // Annual Oct 1 - Oct 31 (22d overdue) -> score = 1.01 + 22/30 = 1.743
    const annualOver = windowEntry(
      task({
        id: 't0-annual',
        title: 'Clean gutters',
        createdAt: new Date(2026, 0, 1).getTime(),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
        },
      }),
      now
    );

    // Tier 1: Due today / exact max day / last day of window (daysUntilMax === 0)
    const t1Created = new Date(2026, 0, 1).getTime();
    const approxExactMax = windowEntry(
      task({
        id: 't1-approx-max',
        title: 'B At max approx',
        createdAt: t1Created,
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 17, 10, 0).getTime()],
      }),
      now
    );
    const annualLastDay = windowEntry(
      task({
        id: 't1-annual-last',
        title: 'A Annual last day',
        createdAt: t1Created,
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 11, startDay: 1, endMonth: 11, endDay: 22 }],
        },
      }),
      now
    );
    const fixedDueToday = fixedEntry(
      task({
        id: 't1-fixed-today',
        title: 'C Fixed today',
        dueAt: '2026-11-22',
        createdAt: t1Created,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      '2026-11-22'
    );

    // Tier 2: In window (relative sortScore descending)
    // Done Nov 18 for 3-5d -> elapsed 4 -> sortScore = 0.5
    const approxInWinHigh = windowEntry(
      task({
        id: 't2-inwin-high',
        title: 'In window high',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 18, 10, 0).getTime()],
      }),
      now
    );
    // Annual Nov 20 - Nov 30 -> 2/10 -> sortScore = 0.2
    const annualInWinLow = windowEntry(
      task({
        id: 't2-inwin-low',
        title: 'In window low',
        createdAt: new Date(2026, 0, 1).getTime(),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 11, startDay: 20, endMonth: 11, endDay: 30 }],
        },
      }),
      now
    );

    // Tier 3: Not done yet (bottom of Due Now, below in_window and above upcoming)
    const notDone = windowEntry(
      task({
        id: 't3-not-done',
        title: 'Brand new routine',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
      }),
      now
    );

    // Tier 4: Upcoming (absolute days ascending)
    const fixedTomorrow = fixedEntry(
      task({
        id: 't4-fixed-1d',
        title: 'Fixed tomorrow',
        dueAt: '2026-11-23',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      }),
      '2026-11-23'
    );
    const approxIn2d = windowEntry(
      task({
        id: 't4-approx-2d',
        title: 'Approx in 2d',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 21, 10, 0).getTime()],
      }),
      now
    );
    const annualIn60d = windowEntry(
      task({
        id: 't4-annual-60d',
        title: 'Annual in 60d',
        createdAt: new Date(2026, 0, 1).getTime(),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 1, startDay: 21, endMonth: 2, endDay: 20 }],
        },
        completionHistory: [new Date(2026, 1, 1, 10, 0).getTime()],
      }),
      now
    );

    // Tier 5: Null nextDate fallback
    const fixedNull = fixedEntry(
      task({
        id: 't5-null',
        title: 'No next date',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      null
    );

    const shuffled: RecurringSortEntry[] = [
      fixedNull,
      annualIn60d,
      notDone,
      fixedDueToday,
      approxOver,
      annualInWinLow,
      fixedTomorrow,
      approxExactMax,
      fixedDailyOver,
      approxIn2d,
      annualOver,
      approxInWinHigh,
      annualLastDay,
    ];

    const sorted = sortRecurringByDueProximity(shuffled, now);
    expect(sorted.map((e) => e.raw.id)).toEqual([
      't0-fixed-daily',
      't0-annual',
      't0-approx',
      't1-annual-last',
      't1-approx-max',
      't1-fixed-today',
      't2-inwin-high',
      't2-inwin-low',
      't3-not-done',
      't4-fixed-1d',
      't4-approx-2d',
      't4-annual-60d',
      't5-null',
    ]);
  });

  it('uses absolute calendar days for upcoming items even when a far annual task has higher ring progress (C3)', () => {
    const now = new Date(2026, 10, 22, 12, 0); // 2026-11-22

    // Fixed daily due tomorrow (1 day away, 0% elapsed)
    const dailyTomorrow = fixedEntry(
      task({
        id: 'daily-1d',
        title: 'Take vitamins',
        dueAt: '2026-11-23',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      }),
      '2026-11-23'
    );

    // 3-5 day approx done yesterday (opens in 2 days, ringFill = 1/3 = 33%)
    const approx2d = windowEntry(
      task({
        id: 'approx-2d',
        title: 'Water plants',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 21, 10, 0).getTime()],
      }),
      now
    );

    // Annual task done 10 months ago opening Jan 21 (60 days away, ringFill ~ 83%)
    const annual60d = windowEntry(
      task({
        id: 'annual-60d',
        title: 'Flush water heater',
        createdAt: new Date(2025, 11, 1).getTime(),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 1, startDay: 21, endMonth: 2, endDay: 20 }],
        },
        completionHistory: [new Date(2026, 1, 1, 10, 0).getTime()],
      }),
      now
    );

    expect(annual60d.kind === 'window' && approx2d.kind === 'window').toBe(true);
    if (annual60d.kind === 'window' && approx2d.kind === 'window') {
      expect(annual60d.progress.sortScore).toBeGreaterThan(approx2d.progress.sortScore);
    }

    const sorted = sortRecurringByDueProximity([annual60d, approx2d, dailyTomorrow], now);
    expect(sorted.map((e) => e.raw.id)).toEqual(['daily-1d', 'approx-2d', 'annual-60d']);
  });

  it('breaks ties deterministically for same upcoming day and equal overdue ratios', () => {
    const now = new Date(2026, 10, 22, 12, 0);

    // Same upcoming open/due day (2 days out): fixed exact due date vs tight [3,3] vs wide [3,10]
    const fixed2d = fixedEntry(
      task({
        id: 'fixed-2d',
        title: 'Fixed in 2d',
        dueAt: '2026-11-24',
        createdAt: 100,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      '2026-11-24'
    );
    const tight2d = windowEntry(
      task({
        id: 'tight-2d',
        title: 'Tight in 2d',
        createdAt: 10,
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 3,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 21, 10, 0).getTime()],
      }),
      now
    );
    const wide2d = windowEntry(
      task({
        id: 'wide-2d',
        title: 'Wide in 2d',
        createdAt: 1,
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 10,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 21, 10, 0).getTime()],
      }),
      now
    );

    expect(
      sortRecurringByDueProximity([wide2d, tight2d, fixed2d], now).map((e) => e.raw.id)
    ).toEqual(['fixed-2d', 'tight-2d', 'wide-2d']);

    // Equal overdue ratio: daily 1d overdue (score = 2.01) vs weekly 7d overdue (score = 2.01)
    // Weekly has more overdue days (-7 < -1) so it ranks ahead.
    const dailyOver1 = fixedEntry(
      task({
        id: 'daily-over-1',
        title: 'Daily',
        dueAt: '2026-11-21',
        createdAt: 1,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      }),
      '2026-11-21'
    );
    const weeklyOver7 = fixedEntry(
      task({
        id: 'weekly-over-7',
        title: 'Weekly',
        dueAt: '2026-11-15',
        createdAt: 2,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      '2026-11-15'
    );

    expect(
      sortRecurringByDueProximity([dailyOver1, weeklyOver7], now).map((e) => e.raw.id)
    ).toEqual(['weekly-over-7', 'daily-over-1']);
  });

  it('keeps multi-year (>3y) recurring tasks sorted ahead of undated fallbacks (Item I)', () => {
    const now = new Date(2026, 5, 15, 12, 0);
    const passport = task({
      id: 'passport-10y',
      title: 'Renew passport',
      startDate: '2026-06-15',
      dueAt: '2036-06-15',
      createdAt: 1,
      recurrence: { type: 'fixed_interval', intervalValue: 10, intervalUnit: 'years' },
      completionHistory: [new Date(2026, 5, 15, 9, 0).getTime()],
    });
    const nextDate = getNextUncompletedOccurrenceDate(passport, now);
    expect(nextDate).toBe('2036-06-15');

    const tenYearEntry = fixedEntry(passport, nextDate);
    const undatedFallback = fixedEntry(
      task({
        id: 'ended-null',
        title: 'Undated fallback',
        createdAt: 2,
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      }),
      null
    );

    expect(
      sortRecurringByDueProximity([undatedFallback, tenYearEntry], now).map((e) => e.raw.id)
    ).toEqual(['passport-10y', 'ended-null']);
  });
});
