import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  completionTimestampForDate,
  formatAnnualWindowRange,
  formatRecurrenceLabel,
  formatRecurringDueSubtitle,
  getSeasonPresets,
  getWindowProgress,
  isAnnualWindow,
  isFixedRecurring,
  isWindowPeriodic,
  isWindowStopped,
  taskOccursOnDate,
} from '../recurrence';
import { completedTasksOnDate, tasksDueOnDate } from '../calendar';
import { sortWindowTasks } from '../sorting';
import { searchTasks } from '../search';
import { parseSyncPayload } from '../syncPayload';
import { completeTask, db, saveTask, uncompleteTask } from '../../db/db';
import type { AnnualWindow, RecurrenceRule, Task } from '../../types/task';

function makeAnnualTask(
  id: string,
  title: string,
  annualWindows: AnnualWindow[],
  completionHistory: number[] = [],
  overrides: Partial<Task> = {}
): Task {
  return {
    id,
    title,
    dueAt: null,
    startDate: null,
    recurrence: {
      type: 'annual_window',
      intervalValue: 1,
      intervalUnit: 'years',
      annualWindows,
      ...(overrides.recurrence ?? {}),
    },
    completionHistory,
    createdAt: new Date(2026, 0, 15, 10, 0).getTime(),
    updatedAt: new Date(2026, 0, 15, 10, 0).getTime(),
    ...overrides,
  };
}

function localDay(y: number, m: number, d: number): Date {
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function tsOn(y: number, m: number, d: number): number {
  return new Date(y, m - 1, d, 14, 0, 0, 0).getTime();
}

describe('Annual time-of-year recurring tasks (domain)', () => {
  it('classifies annual_window as window-periodic and never fixed-recurring', () => {
    const task = makeAnnualTask('a1', 'Winterize faucets', [
      { startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 },
    ]);
    expect(isAnnualWindow(task)).toBe(true);
    expect(isWindowPeriodic(task)).toBe(true);
    expect(isFixedRecurring(task)).toBe(false);

    // Even malformed empty annualWindows is never classified as fixed_interval
    const malformed = makeAnnualTask('a2', 'Malformed', []);
    expect(isAnnualWindow(malformed)).toBe(false);
    expect(isFixedRecurring(malformed)).toBe(false);
  });

  it('formats single-month, multi-month, custom-range, single-day, multi-window, and endOnDate labels', () => {
    expect(
      formatAnnualWindowRange({ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 })
    ).toBe('October');
    expect(
      formatAnnualWindowRange({ startMonth: 10, startDay: 1, endMonth: 11, endDay: 30 })
    ).toBe('Oct–Nov');
    expect(
      formatAnnualWindowRange({ startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 })
    ).toBe('Dec–Feb');
    expect(
      formatAnnualWindowRange({ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 })
    ).toBe('Oct 15 – Nov 15');
    expect(
      formatAnnualWindowRange({ startMonth: 10, startDay: 15, endMonth: 10, endDay: 15 })
    ).toBe('Oct 15');

    expect(
      formatRecurrenceLabel({
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [
          { startMonth: 4, startDay: 1, endMonth: 5, endDay: 31 },
          { startMonth: 10, startDay: 1, endMonth: 11, endDay: 30 },
        ],
      })
    ).toBe('Every Apr–May, Oct–Nov');

    expect(
      formatRecurrenceLabel({
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
        endOnDate: '2028-11-01',
      })
    ).toBe('Every October (until 2028-11-01)');
  });

  it('provides meteorological season presets for both hemispheres', () => {
    const north = getSeasonPresets('north');
    expect(north.map((p) => p.label)).toEqual(['Spring', 'Summer', 'Fall', 'Winter']);
    expect(north[0].window).toEqual({ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 });
    expect(north[3].window).toEqual({ startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 });

    const south = getSeasonPresets('south');
    expect(south.map((p) => p.label)).toEqual(['Spring', 'Summer', 'Autumn', 'Winter']);
    expect(south[0].window).toEqual({ startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 });
    expect(south[1].window).toEqual({ startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 });
  });

  it('handles brand-new creation before, inside, and after window without starting overdue', () => {
    // Created Jan 15 for Oct 15 - Nov 15 -> before window
    const beforeTask = makeAnnualTask(
      'before',
      'Swap winter tires',
      [{ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 }],
      [],
      { createdAt: tsOn(2026, 1, 15) }
    );
    const pBefore = getWindowProgress(beforeTask, localDay(2026, 6, 1))!;
    expect(pBefore.stage).toBe('before_min');
    expect(pBefore.visibleInTasks).toBe(false);
    expect(pBefore.overdueIntensity).toBe(0);
    expect(pBefore.detailLabel).toContain('Starts Oct 15');

    // Created Nov 22 (after Oct 1 - Oct 31 already ended) -> never starts overdue; waits for 2027
    const afterTask = makeAnnualTask(
      'after',
      'Winterize faucets',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
      [],
      { createdAt: tsOn(2026, 11, 22) }
    );
    const pAfter = getWindowProgress(afterTask, localDay(2026, 11, 22))!;
    expect(pAfter.stage).toBe('before_min');
    expect(pAfter.visibleInTasks).toBe(false);
    expect(pAfter.detailLabel).toContain('Starts Oct 1, 2027');

    // Created Oct 15 inside Oct 15 - Nov 15 -> immediately in_window with >= 0.08 ring floor
    const insideTask = makeAnnualTask(
      'inside',
      'Swap winter tires',
      [{ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 }],
      [],
      { createdAt: tsOn(2026, 10, 15) }
    );
    const pInsideStart = getWindowProgress(insideTask, localDay(2026, 10, 15))!;
    expect(pInsideStart.stage).toBe('in_window');
    expect(pInsideStart.visibleInTasks).toBe(true);
    expect(pInsideStart.ringFill).toBeCloseTo(0.08, 4);
    expect(pInsideStart.detailLabel).toContain('31 days left');
  });

  it('progresses through in_window, final-day amber, overdue orange/red, and completion reset', () => {
    const task = makeAnnualTask(
      'tires',
      'Swap winter tires',
      [{ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 }],
      [],
      { createdAt: tsOn(2026, 1, 10) }
    );

    // Midpoint (approx Oct 30 -> 15/31)
    const pMid = getWindowProgress(task, localDay(2026, 10, 30))!;
    expect(pMid.stage).toBe('in_window');
    expect(pMid.ringFill).toBeCloseTo(15 / 31, 3);
    expect(pMid.overdueIntensity).toBe(0);

    // Final day (Nov 15) -> amber, full ring, overdueIntensity = 0
    const pLastDay = getWindowProgress(task, localDay(2026, 11, 15))!;
    expect(pLastDay.stage).toBe('at_or_past_max');
    expect(pLastDay.visibleInTasks).toBe(true);
    expect(pLastDay.ringFill).toBe(1);
    expect(pLastDay.overdueIntensity).toBe(0);
    expect(pLastDay.detailLabel).toContain('Last day of window');

    // 7 days overdue (Nov 22) -> 7 / 31 overdueIntensity
    const pOverdue = getWindowProgress(task, localDay(2026, 11, 22))!;
    expect(pOverdue.stage).toBe('at_or_past_max');
    expect(pOverdue.visibleInTasks).toBe(true);
    expect(pOverdue.overdueIntensity).toBeCloseTo(7 / 31, 4);
    expect(pOverdue.detailLabel).toContain('7 days overdue');

    // Narrow 3-day window scales overdue over at least 7 days (not instant dark red on day +1)
    const narrow = makeAnnualTask(
      'narrow',
      'Check furnace',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 3 }],
      [],
      { createdAt: tsOn(2026, 1, 1) }
    );
    const pNarrowDay1 = getWindowProgress(narrow, localDay(2026, 10, 4))!;
    expect(pNarrowDay1.overdueIntensity).toBeCloseTo(1 / 7, 4);

    // Completed inside window -> hides until next year, ringFill = 0 on completion day
    const completedOnOct20: Task = {
      ...task,
      completionHistory: [tsOn(2026, 10, 20)],
    };
    const pDoneToday = getWindowProgress(completedOnOct20, localDay(2026, 10, 20))!;
    expect(pDoneToday.stage).toBe('before_min');
    expect(pDoneToday.visibleInTasks).toBe(false);
    expect(pDoneToday.doneToday).toBe(true);
    expect(pDoneToday.ringFill).toBe(0);
    expect(pDoneToday.detailLabel).toContain('Done today · next Oct 15, 2027');
  });

  it('handles late completions, early completions via off-season midpoint, and accidental double-logs', () => {
    const baseWindow = [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }];

    // 1. Late completion on Nov 10, 2026 satisfies 2026 cycle and waits until Oct 1, 2027
    const doneLate = makeAnnualTask('late', 'Faucets', baseWindow, [tsOn(2026, 11, 10)], {
      createdAt: tsOn(2025, 9, 1),
    });
    expect(getWindowProgress(doneLate, localDay(2026, 11, 12))!.stage).toBe('before_min');
    expect(getWindowProgress(doneLate, localDay(2027, 9, 20))!.stage).toBe('before_min');
    expect(getWindowProgress(doneLate, localDay(2027, 10, 1))!.stage).toBe('in_window');

    // 2. Early completion on Sep 24, 2026 (after midpoint ~Apr 18) satisfies 2026 cycle early
    const doneEarly = makeAnnualTask(
      'early',
      'Faucets',
      baseWindow,
      [tsOn(2025, 10, 15), tsOn(2026, 9, 24)],
      { createdAt: tsOn(2025, 9, 1) }
    );
    expect(getWindowProgress(doneEarly, localDay(2026, 9, 25))!.detailLabel).toContain('next Oct 1, 2027');
    expect(getWindowProgress(doneEarly, localDay(2026, 10, 5))!.stage).toBe('before_min');
    expect(getWindowProgress(doneEarly, localDay(2026, 10, 5))!.visibleInTasks).toBe(false);

    // 3. Accidental double-log on Nov 2, 2025 (before Apr 18 midpoint) does NOT eat 2026!
    const doubleLogged = makeAnnualTask(
      'double',
      'Faucets',
      baseWindow,
      [tsOn(2025, 10, 15), tsOn(2025, 11, 2)],
      { createdAt: tsOn(2025, 9, 1) }
    );
    expect(getWindowProgress(doubleLogged, localDay(2026, 10, 1))!.stage).toBe('in_window');

    // 4. Clean rollover when an entire year (2026) is missed and Oct 1, 2027 arrives
    const missedYear = makeAnnualTask('missed', 'Faucets', baseWindow, [tsOn(2025, 10, 15)], {
      createdAt: tsOn(2025, 9, 1),
    });
    expect(getWindowProgress(missedYear, localDay(2027, 9, 30))!.stage).toBe('at_or_past_max');
    const pRolled = getWindowProgress(missedYear, localDay(2027, 10, 1))!;
    expect(pRolled.stage).toBe('in_window');
    expect(pRolled.detailLabel).toContain('30 days left');
  });

  it('handles year-wrap windows (Dec 1 – Feb 29) across non-leap and leap years', () => {
    const task = makeAnnualTask(
      'prune',
      'Prune dormant trees',
      [{ startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 }],
      [],
      { createdAt: tsOn(2026, 6, 1) }
    );

    // Active in Dec 2026
    expect(getWindowProgress(task, localDay(2026, 12, 15))!.stage).toBe('in_window');
    // Active in Jan 2027 (part of Dec 2026 - Feb 2027 cycle)
    expect(getWindowProgress(task, localDay(2027, 1, 20))!.stage).toBe('in_window');
    // 2027 is non-leap -> final day is Feb 28, 2027
    const pNonLeapEnd = getWindowProgress(task, localDay(2027, 2, 28))!;
    expect(pNonLeapEnd.stage).toBe('at_or_past_max');
    expect(pNonLeapEnd.overdueIntensity).toBe(0);
    // Mar 1, 2027 -> 1 day overdue
    const pMar1 = getWindowProgress(task, localDay(2027, 3, 1))!;
    expect(pMar1.stage).toBe('at_or_past_max');
    expect(pMar1.detailLabel).toContain('1 day overdue');

    // Leap year cycle (Dec 2027 - Feb 2028): Feb 28 is still in_window (1 day left), Feb 29 is last day
    const completed2026 = { ...task, completionHistory: [tsOn(2027, 1, 5)] };
    const pFeb28Leap = getWindowProgress(completed2026, localDay(2028, 2, 28))!;
    expect(pFeb28Leap.stage).toBe('in_window');
    expect(pFeb28Leap.detailLabel).toContain('1 day left');
    const pFeb29Leap = getWindowProgress(completed2026, localDay(2028, 2, 29))!;
    expect(pFeb29Leap.stage).toBe('at_or_past_max');
    expect(pFeb29Leap.overdueIntensity).toBe(0);
  });

  it('respects endOnDate and marks task stopped when window ends or next cycle exceeds endOnDate', () => {
    const task = makeAnnualTask(
      'end-test',
      'Temporary seasonal check',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
      [],
      {
        createdAt: tsOn(2026, 9, 1),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
          endOnDate: '2026-10-15',
        },
      }
    );

    expect(isWindowStopped(task, localDay(2026, 10, 10))).toBe(false);
    expect(getWindowProgress(task, localDay(2026, 10, 10))!.stage).toBe('in_window');

    // Completed on Oct 10 -> next cycle is 2027-10-01 (> endOnDate 2026-10-15) -> stopped immediately
    const doneOct10 = { ...task, completionHistory: [tsOn(2026, 10, 10)] };
    expect(isWindowStopped(doneOct10, localDay(2026, 10, 10))).toBe(true);
    expect(getWindowProgress(doneOct10, localDay(2026, 10, 10))!.stage).toBe('stopped');

    // Past endOnDate without completion -> stopped
    expect(isWindowStopped(task, localDay(2026, 10, 16))).toBe(true);
    expect(getWindowProgress(task, localDay(2026, 10, 16))!.stage).toBe('stopped');
  });

  it('exposes daysUntilOpen, daysUntilMax, nextOpenDateStr, and formats concise due subtitles', () => {
    const task = makeAnnualTask(
      'sub-ann',
      'Swap winter tires',
      [{ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 }],
      [],
      { createdAt: tsOn(2026, 1, 10) }
    );

    const jun1 = localDay(2026, 6, 1);
    const pBefore = getWindowProgress(task, jun1)!;
    expect(pBefore.daysUntilOpen).toBe(136);
    expect(pBefore.daysUntilMax).toBe(167);
    expect(pBefore.nextOpenDateStr).toBe('2026-10-15');
    expect(formatRecurringDueSubtitle(task, pBefore, jun1)).toBe(
      'Starts Oct 15 (in 4 months) · Oct 15 – Nov 15'
    );

    const earlyDone = makeAnnualTask(
      'sub-early',
      'Winterize faucets',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
      [tsOn(2025, 10, 15), tsOn(2026, 9, 24)],
      { createdAt: tsOn(2025, 9, 1) }
    );
    const sep25 = localDay(2026, 9, 25);
    const pEarly = getWindowProgress(earlyDone, sep25)!;
    expect(pEarly.stage).toBe('before_min');
    expect(pEarly.daysUntilOpen).toBe(371);
    expect(pEarly.daysUntilMax).toBe(401);
    expect(pEarly.nextOpenDateStr).toBe('2027-10-01');
    expect(formatRecurringDueSubtitle(earlyDone, pEarly, sep25)).toBe(
      'Starts Oct 1, 2027 (in 1 year) · October'
    );

    const oct30 = localDay(2026, 10, 30);
    const pInWin = getWindowProgress(task, oct30)!;
    expect(pInWin.daysUntilOpen).toBe(0);
    expect(pInWin.daysUntilMax).toBe(16);
    expect(pInWin.nextOpenDateStr).toBeNull();
    expect(formatRecurringDueSubtitle(task, pInWin, oct30)).toBe(
      '16 days left · Oct 15 – Nov 15'
    );

    const nov14 = localDay(2026, 11, 14);
    const pLeft1 = getWindowProgress(task, nov14)!;
    expect(pLeft1.daysUntilMax).toBe(1);
    expect(formatRecurringDueSubtitle(task, pLeft1, nov14)).toBe('1 day left · Oct 15 – Nov 15');

    const nov15 = localDay(2026, 11, 15);
    const pLastDay = getWindowProgress(task, nov15)!;
    expect(pLastDay.daysUntilOpen).toBe(0);
    expect(pLastDay.daysUntilMax).toBe(0);
    expect(pLastDay.nextOpenDateStr).toBeNull();
    expect(formatRecurringDueSubtitle(task, pLastDay, nov15)).toBe(
      'Last day of window · Oct 15 – Nov 15'
    );

    const nov16 = localDay(2026, 11, 16);
    const pOver1 = getWindowProgress(task, nov16)!;
    expect(pOver1.daysUntilOpen).toBe(0);
    expect(pOver1.daysUntilMax).toBe(-1);
    expect(formatRecurringDueSubtitle(task, pOver1, nov16)).toBe(
      '1 day overdue · Oct 15 – Nov 15'
    );

    const nov22 = localDay(2026, 11, 22);
    const pOver7 = getWindowProgress(task, nov22)!;
    expect(pOver7.daysUntilMax).toBe(-7);
    expect(formatRecurringDueSubtitle(task, pOver7, nov22)).toBe(
      '7 days overdue · Oct 15 – Nov 15'
    );

    const stopped = makeAnnualTask(
      'sub-stop',
      'Retired spring task',
      [{ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 }],
      [],
      {
        createdAt: tsOn(2026, 1, 1),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 }],
          endOnDate: '2026-06-01',
        },
      }
    );
    const pStopped = getWindowProgress(stopped, nov22)!;
    expect(pStopped.daysUntilOpen).toBeNull();
    expect(pStopped.daysUntilMax).toBeNull();
    expect(pStopped.nextOpenDateStr).toBeNull();
    expect(formatRecurringDueSubtitle(stopped, pStopped, nov22)).toBe('Stopped · Mar–May');
  });

  it('stays off Calendar due dates, appears on Calendar Completed, sorts via sortWindowTasks, and indexes in searchTasks', () => {
    const annualActive = makeAnnualTask(
      'ann-act',
      'Clean gutters',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
      [tsOn(2026, 10, 12)],
      { createdAt: tsOn(2026, 1, 1) }
    );
    const annualOverdue = makeAnnualTask(
      'ann-over',
      'Check smoke alarms',
      [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 10 }],
      [],
      { createdAt: tsOn(2026, 1, 1) }
    );
    const approxMid = makeAnnualTask('approx-mid', 'Water plants', [], [tsOn(2026, 10, 16)], {
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 7,
        intervalUnit: 'days',
      },
    });
    const annualStopped = makeAnnualTask(
      'ann-stop',
      'Old seasonal task',
      [{ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 }],
      [],
      {
        createdAt: tsOn(2026, 1, 1),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 }],
          endOnDate: '2026-06-01',
        },
      }
    );

    const refNow = localDay(2026, 10, 20);
    expect(taskOccursOnDate(annualOverdue, '2026-10-05')).toBe(false);
    expect(tasksDueOnDate([annualOverdue], '2026-10-05')).toHaveLength(0);
    expect(completedTasksOnDate([annualActive], '2026-10-12').map((t) => t.id)).toEqual(['ann-act']);

    const sorted = sortWindowTasks([annualActive, approxMid, annualOverdue], refNow);
    expect(sorted.map((t) => t.id)).toEqual(['ann-over', 'approx-mid', 'ann-act']);

    const searchRes = searchTasks([annualOverdue, annualStopped], 'check', refNow);
    expect(searchRes.active.map((r) => r.id)).toEqual(['ann-over']);
    expect(searchRes.active[0].jumpDateStr).toBeNull();

    const searchStopped = searchTasks([annualStopped], 'old seasonal', refNow);
    expect(searchStopped.completed.map((r) => r.id)).toEqual(['ann-stop']);
  });

  it('validates, clamps, and sanitizes annual_window payloads in parseSyncPayload', () => {
    const rawPayload = JSON.stringify({
      version: 1,
      exportedAt: Date.now(),
      tasks: [
        {
          id: 'valid-annual',
          title: 'Prune trees',
          dueAt: '2026-12-01',
          startDate: '2026-12-01',
          recurrence: {
            type: 'annual_window',
            intervalValue: 1,
            intervalUnit: 'years',
            annualWindows: [{ startMonth: 12, startDay: 1, endMonth: 2, endDay: 31 }],
            endOnDate: '2030-03-01',
          },
          completionHistory: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'invalid-empty',
          title: 'Bad annual',
          recurrence: {
            type: 'annual_window',
            intervalValue: 1,
            intervalUnit: 'years',
            annualWindows: [],
          },
          completionHistory: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
        {
          id: 'invalid-month',
          title: 'Bad month',
          recurrence: {
            type: 'annual_window',
            intervalValue: 1,
            intervalUnit: 'years',
            annualWindows: [{ startMonth: 13, startDay: 1, endMonth: 2, endDay: 10 }],
          },
          completionHistory: [],
          createdAt: 1000,
          updatedAt: 1000,
        },
      ],
    });

    const parsed = parseSyncPayload(rawPayload);
    const valid = parsed.tasks.find((t) => t.id === 'valid-annual')!;
    expect(valid.dueAt).toBeNull();
    expect(valid.startDate).toBeNull();
    expect(valid.recurrence).toEqual({
      type: 'annual_window',
      intervalValue: 1,
      intervalUnit: 'years',
      annualWindows: [{ startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 }],
      endOnDate: '2030-03-01',
    });

    expect(parsed.tasks.find((t) => t.id === 'invalid-empty')!.recurrence).toBeUndefined();
    expect(parsed.tasks.find((t) => t.id === 'invalid-month')!.recurrence).toBeUndefined();
  });
});

describe('Annual time-of-year db persistence', () => {
  let store: Map<string, Task>;

  beforeEach(() => {
    store = new Map();
    vi.spyOn(db, 'transaction').mockImplementation((async (...args: unknown[]) => {
      const cb = args[args.length - 1] as () => Promise<unknown>;
      return cb();
    }) as never);
    vi.spyOn(db.tasks, 'get').mockImplementation(((id: string) =>
      Promise.resolve(store.get(id))) as never);
    vi.spyOn(db.tasks, 'put').mockImplementation(((t: Task) => {
      store.set(t.id, structuredClone(t));
      return Promise.resolve(t.id);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveTask, completeTask, and uncompleteTask preserve annual_window without downgrading to after_completion', async () => {
    const rule: RecurrenceRule = {
      type: 'annual_window',
      intervalValue: 1,
      intervalUnit: 'years',
      annualWindows: [{ startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 }],
      endOnDate: null,
    };

    const saved = await saveTask({
      title: 'Clean gutters',
      dueAt: '2026-10-01',
      recurrence: rule,
    });
    expect(saved.dueAt).toBeNull();
    expect(saved.startDate).toBeNull();
    expect(saved.recurrence).toEqual(rule);

    const completed = await completeTask(saved.id, '2026-10-15');
    expect(completed?.dueAt).toBeNull();
    expect(completed?.completedAt).toBeNull();
    expect(completed?.recurrence).toEqual(rule);
    expect(completed?.completionHistory).toEqual([completionTimestampForDate('2026-10-15')]);

    const uncompleted = await uncompleteTask(saved.id, '2026-10-15');
    expect(uncompleted?.completionHistory).toEqual([]);
    expect(uncompleted?.recurrence).toEqual(rule);
  });

  it('keeps an approximate firstOpenDate across save, complete, and uncomplete', async () => {
    const saved = await saveTask({
      title: 'Replace filter',
      dueAt: '2026-01-01',
      firstOpenDate: '2026-06-01',
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 6,
        intervalUnit: 'months',
      },
    });
    expect(saved.dueAt).toBeNull();
    expect(saved.startDate).toBeNull();
    expect(saved.firstOpenDate).toBe('2026-06-01');

    const completed = await completeTask(saved.id, '2026-06-20');
    expect(completed?.firstOpenDate).toBe('2026-06-01');
    expect(completed?.completionHistory).toHaveLength(1);

    const undone = await uncompleteTask(saved.id, '2026-06-20');
    expect(undone?.completionHistory).toEqual([]);
    expect(undone?.firstOpenDate).toBe('2026-06-01');

    const fixed = await saveTask({
      id: saved.id,
      title: 'Replace filter',
      dueAt: '2026-06-01',
      recurrence: { type: 'fixed_interval', intervalValue: 3, intervalUnit: 'months' },
    });
    expect(fixed.firstOpenDate).toBeNull();
    expect(fixed.dueAt).toBe('2026-06-01');

    const restored = await saveTask({
      id: saved.id,
      title: 'Replace filter',
      firstOpenDate: '2026-08-01',
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 6,
        intervalUnit: 'months',
      },
    });
    expect(restored.firstOpenDate).toBe('2026-08-01');
    expect(restored.dueAt).toBeNull();

    const cleared = await saveTask({
      id: saved.id,
      title: 'Replace filter',
      firstOpenDate: null,
      recurrence: restored.recurrence,
    });
    expect(cleared.firstOpenDate).toBeNull();
  });
});
