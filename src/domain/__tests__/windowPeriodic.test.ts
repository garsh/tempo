import { describe, expect, it } from 'vitest';
import {
  addInterval,
  formatDate,
  formatRecurringDueSubtitle,
  getNextUncompletedOccurrenceDate,
  getSkipOccurrenceDate,
  getWindowProgress,
  isWindowStopped,
  taskOccursOnDate,
} from '../recurrence';
import { completedTasksOnDate, tasksDueOnDate } from '../calendar';
import { sortUndatedOneTimeTasks, sortWindowTasks } from '../sorting';
import { searchTasks } from '../search';
import { parseSyncPayload } from '../syncPayload';
import { findMidpointReorderUpdate } from '../../db/db';
import type { RecurrenceRule, Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function makeWindowTask(
  id: string,
  title: string,
  recurrence: RecurrenceRule,
  completionHistory: number[] = [],
  overrides: Partial<Task> = {}
): Task {
  return {
    id,
    title,
    listId: INBOX_LIST_ID,
    dueAt: null,
    startDate: null,
    recurrence,
    completionHistory,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function makeUndatedOneTime(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    listId: INBOX_LIST_ID,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('Approximate Window Periodic & Undated One-Time Domain Logic', () => {
  describe('getWindowProgress', () => {
    const rule: RecurrenceRule = {
      type: 'after_completion',
      intervalValue: 3,
      maxIntervalValue: 5,
      intervalUnit: 'days',
    };

    it('treats never-completed routines as not_done_yet (visible in Tasks, 1.0 ring fill)', () => {
      const task = makeWindowTask('w-1', 'Clean filter', rule, []);
      const progress = getWindowProgress(task, new Date(2026, 4, 20, 12, 0));
      expect(progress).not.toBeNull();
      expect(progress!.stage).toBe('not_done_yet');
      expect(progress!.visibleInTasks).toBe(true);
      expect(progress!.ringFill).toBe(1);
      expect(progress!.lastDoneMs).toBeNull();
      expect(progress!.detailLabel).toBe('Not done yet · every 3–5 days');
    });

    it('hides before_min from Tasks while providing muted partial elapsed/min ringFill', () => {
      const lastDone = new Date(2026, 4, 18, 9, 0).getTime();
      const task = makeWindowTask('w-2', 'Wash sheets', rule, [lastDone]);
      const day0 = getWindowProgress(task, new Date(2026, 4, 18, 20, 0))!;
      expect(day0.stage).toBe('before_min');
      expect(day0.visibleInTasks).toBe(false);
      expect(day0.doneToday).toBe(true);
      expect(day0.ringFill).toBe(0);

      const day2 = getWindowProgress(task, new Date(2026, 4, 20, 10, 0))!;
      expect(day2.stage).toBe('before_min');
      expect(day2.visibleInTasks).toBe(false);
      expect(day2.ringFill).toBeCloseTo(2 / 3, 4);
    });

    it('shows in_window starting at min with 0.08 minimum ring floor and fills linearly toward max', () => {
      const lastDone = new Date(2026, 4, 10, 12, 0).getTime();
      const task = makeWindowTask('w-3', 'Water orchids', rule, [lastDone]);

      const onMin = getWindowProgress(task, new Date(2026, 4, 13, 12, 0))!;
      expect(onMin.stage).toBe('in_window');
      expect(onMin.visibleInTasks).toBe(true);
      expect(onMin.ringFill).toBe(0.08);
      expect(onMin.sortScore).toBe(0);

      const mid = getWindowProgress(task, new Date(2026, 4, 14, 12, 0))!;
      expect(mid.stage).toBe('in_window');
      expect(mid.ringFill).toBe(0.5);
      expect(mid.sortScore).toBe(0.5);
    });

    it('escalates past max with full ring and overdueIntensity > 0', () => {
      const lastDone = new Date(2026, 4, 10, 12, 0).getTime();
      const task = makeWindowTask('w-4', 'Clean coffee maker', rule, [lastDone]);

      const atMax = getWindowProgress(task, new Date(2026, 4, 15, 12, 0))!;
      expect(atMax.stage).toBe('at_or_past_max');
      expect(atMax.visibleInTasks).toBe(true);
      expect(atMax.ringFill).toBe(1);
      expect(atMax.overdueIntensity).toBe(0);

      const pastMax = getWindowProgress(task, new Date(2026, 4, 18, 12, 0))!;
      expect(pastMax.stage).toBe('at_or_past_max');
      expect(pastMax.ringFill).toBe(1);
      expect(pastMax.overdueIntensity).toBeCloseTo(3 / 5, 4);
      expect(pastMax.sortScore).toBeGreaterThan(atMax.sortScore);
    });

    it('supports tight [N, N] window and normalizes legacy after_completion without maxIntervalValue', () => {
      const lastDone = new Date(2026, 4, 1, 12, 0).getTime();
      const tight = makeWindowTask(
        'w-5',
        'Tight window',
        { type: 'after_completion', intervalValue: 14, maxIntervalValue: 14, intervalUnit: 'days' },
        [lastDone]
      );
      const day13 = getWindowProgress(tight, new Date(2026, 4, 14, 12, 0))!;
      expect(day13.stage).toBe('before_min');
      expect(day13.visibleInTasks).toBe(false);

      const day14 = getWindowProgress(tight, new Date(2026, 4, 15, 12, 0))!;
      expect(day14.stage).toBe('at_or_past_max');
      expect(day14.visibleInTasks).toBe(true);
      expect(day14.ringFill).toBe(1);

      const legacy = makeWindowTask(
        'w-legacy',
        'Legacy after completion',
        { type: 'after_completion', intervalValue: 14, intervalUnit: 'days' },
        [lastDone]
      );
      const legacyDay14 = getWindowProgress(legacy, new Date(2026, 4, 15, 12, 0))!;
      expect(legacyDay14.stage).toBe('at_or_past_max');
      expect(legacyDay14.minDays).toBe(14);
      expect(legacyDay14.maxDays).toBe(14);
    });

    it('formats expanded detailLabel text with full unit names and clear elapsed wording', () => {
      const now = new Date(2026, 4, 20, 12, 0);

      const neverMonths = makeWindowTask(
        'd-months',
        'Flush water heater',
        { type: 'after_completion', intervalValue: 11, maxIntervalValue: 13, intervalUnit: 'months' },
        []
      );
      expect(getWindowProgress(neverMonths, now)!.detailLabel).toBe(
        'Not done yet · every 11–13 months'
      );

      const day0 = makeWindowTask('d-0', 'Filter', rule, [new Date(2026, 4, 20, 8, 0).getTime()]);
      expect(getWindowProgress(day0, now)!.detailLabel).toBe('Done today · every 3–5 days');

      const day2 = makeWindowTask('d-2', 'Filter', rule, [new Date(2026, 4, 18, 8, 0).getTime()]);
      expect(getWindowProgress(day2, now)!.detailLabel).toBe('Last done 2 days ago · every 3–5 days');

      const inWin = makeWindowTask('d-4', 'Filter', rule, [new Date(2026, 4, 16, 8, 0).getTime()]);
      expect(getWindowProgress(inWin, now)!.detailLabel).toBe('Last done 4 days ago · every 3–5 days');

      const atMax = makeWindowTask('d-5', 'Filter', rule, [new Date(2026, 4, 15, 8, 0).getTime()]);
      expect(getWindowProgress(atMax, now)!.detailLabel).toBe('Last done 5 days ago · every 3–5 days');

      const overdue = makeWindowTask('d-8', 'Filter', rule, [new Date(2026, 4, 12, 8, 0).getTime()]);
      expect(getWindowProgress(overdue, now)!.detailLabel).toBe(
        'Last done 8 days ago · every 3–5 days (overdue)'
      );

      const stopped = makeWindowTask(
        'd-stop',
        'Mow',
        {
          type: 'after_completion',
          intervalValue: 7,
          maxIntervalValue: 10,
          intervalUnit: 'days',
          endOnDate: '2026-05-01',
        },
        [new Date(2026, 4, 1, 8, 0).getTime()]
      );
      expect(getWindowProgress(stopped, now)!.detailLabel).toBe('Stopped · every 7–10 days');
    });

    it('exposes daysUntilOpen, daysUntilMax, null nextOpenDateStr, and formats concise due subtitles', () => {
      const now = new Date(2026, 4, 20, 12, 0);

      const notDone = makeWindowTask('sub-never', 'Clean filter', rule, []);
      const pNotDone = getWindowProgress(notDone, now)!;
      expect(pNotDone.daysUntilOpen).toBeNull();
      expect(pNotDone.daysUntilMax).toBeNull();
      expect(pNotDone.nextOpenDateStr).toBeNull();
      expect(formatRecurringDueSubtitle(notDone, pNotDone, now)).toBe(
        'Not done yet · every 3–5 days'
      );

      const openIn1 = makeWindowTask('sub-open1', 'Filter', rule, [
        new Date(2026, 4, 18, 9, 0).getTime(),
      ]);
      const pOpen1 = getWindowProgress(openIn1, now)!;
      expect(pOpen1.daysUntilOpen).toBe(1);
      expect(pOpen1.daysUntilMax).toBe(3);
      expect(pOpen1.nextOpenDateStr).toBeNull();
      expect(formatRecurringDueSubtitle(openIn1, pOpen1, now)).toBe(
        'Opens in 1 day · every 3–5 days'
      );

      const openIn2 = makeWindowTask('sub-open2', 'Filter', rule, [
        new Date(2026, 4, 19, 9, 0).getTime(),
      ]);
      const pOpen2 = getWindowProgress(openIn2, now)!;
      expect(pOpen2.daysUntilOpen).toBe(2);
      expect(pOpen2.daysUntilMax).toBe(4);
      expect(formatRecurringDueSubtitle(openIn2, pOpen2, now)).toBe(
        'Opens in 2 days · every 3–5 days'
      );

      const longWait = makeWindowTask(
        'sub-months',
        'Flush water heater',
        { type: 'after_completion', intervalValue: 11, maxIntervalValue: 13, intervalUnit: 'months' },
        [new Date(2026, 4, 20, 8, 0).getTime()]
      );
      const pLong = getWindowProgress(longWait, now)!;
      expect(pLong.daysUntilOpen).toBeGreaterThanOrEqual(330);
      expect(formatRecurringDueSubtitle(longWait, pLong, now)).toBe(
        'Opens in 11 months · every 11–13 months'
      );

      const left2 = makeWindowTask('sub-left2', 'Filter', rule, [
        new Date(2026, 4, 17, 9, 0).getTime(),
      ]);
      const pLeft2 = getWindowProgress(left2, now)!;
      expect(pLeft2.daysUntilOpen).toBe(0);
      expect(pLeft2.daysUntilMax).toBe(2);
      expect(formatRecurringDueSubtitle(left2, pLeft2, now)).toBe('2 days left · every 3–5 days');

      const left1 = makeWindowTask('sub-left1', 'Filter', rule, [
        new Date(2026, 4, 16, 9, 0).getTime(),
      ]);
      const pLeft1 = getWindowProgress(left1, now)!;
      expect(pLeft1.daysUntilOpen).toBe(0);
      expect(pLeft1.daysUntilMax).toBe(1);
      expect(formatRecurringDueSubtitle(left1, pLeft1, now)).toBe('1 day left · every 3–5 days');

      const lastDayRange = makeWindowTask('sub-max', 'Filter', rule, [
        new Date(2026, 4, 15, 9, 0).getTime(),
      ]);
      const pMaxRange = getWindowProgress(lastDayRange, now)!;
      expect(pMaxRange.daysUntilOpen).toBe(0);
      expect(pMaxRange.daysUntilMax).toBe(0);
      expect(formatRecurringDueSubtitle(lastDayRange, pMaxRange, now)).toBe(
        'Last day of window · every 3–5 days'
      );

      const tightDue = makeWindowTask(
        'sub-tight',
        'Exact approx',
        { type: 'after_completion', intervalValue: 14, maxIntervalValue: 14, intervalUnit: 'days' },
        [new Date(2026, 4, 6, 9, 0).getTime()]
      );
      const pTight = getWindowProgress(tightDue, now)!;
      expect(pTight.daysUntilOpen).toBe(0);
      expect(pTight.daysUntilMax).toBe(0);
      expect(formatRecurringDueSubtitle(tightDue, pTight, now)).toBe(
        'Due today · every 14 days'
      );

      const overdue1 = makeWindowTask('sub-over1', 'Filter', rule, [
        new Date(2026, 4, 14, 9, 0).getTime(),
      ]);
      const pOver1 = getWindowProgress(overdue1, now)!;
      expect(pOver1.daysUntilOpen).toBe(0);
      expect(pOver1.daysUntilMax).toBe(-1);
      expect(formatRecurringDueSubtitle(overdue1, pOver1, now)).toBe(
        '1 day overdue · every 3–5 days'
      );

      const overdue3 = makeWindowTask('sub-over3', 'Filter', rule, [
        new Date(2026, 4, 12, 9, 0).getTime(),
      ]);
      const pOver3 = getWindowProgress(overdue3, now)!;
      expect(pOver3.daysUntilOpen).toBe(0);
      expect(pOver3.daysUntilMax).toBe(-3);
      expect(formatRecurringDueSubtitle(overdue3, pOver3, now)).toBe(
        '3 days overdue · every 3–5 days'
      );

      const stopped = makeWindowTask(
        'sub-stop',
        'Mow',
        {
          type: 'after_completion',
          intervalValue: 7,
          maxIntervalValue: 10,
          intervalUnit: 'days',
          endOnDate: '2026-05-01',
        },
        [new Date(2026, 4, 1, 8, 0).getTime()]
      );
      const pStopped = getWindowProgress(stopped, now)!;
      expect(pStopped.daysUntilOpen).toBeNull();
      expect(pStopped.daysUntilMax).toBeNull();
      expect(pStopped.nextOpenDateStr).toBeNull();
      expect(formatRecurringDueSubtitle(stopped, pStopped, now)).toBe(
        'Stopped · every 7–10 days'
      );
    });
  });

  describe('addInterval with years, unconstrained months, and month/leap clamping', () => {
    it('adds years and months > 12 while clamping shorter months and leap days', () => {
      expect(formatDate(addInterval(new Date(2026, 0, 15), 2, 'years'))).toBe('2028-01-15');
      expect(formatDate(addInterval(new Date(2026, 0, 15), 18, 'months'))).toBe('2027-07-15');
      expect(formatDate(addInterval(new Date(2026, 0, 31), 1, 'months'))).toBe('2026-02-28');
      expect(formatDate(addInterval(new Date(2024, 1, 29), 1, 'years'))).toBe('2025-02-28');
      expect(formatDate(addInterval(new Date(2024, 1, 29), 4, 'years'))).toBe('2028-02-29');
    });
  });

  describe('isWindowStopped with seasonal / explicit endOnDate', () => {
    const seasonalRule: RecurrenceRule = {
      type: 'after_completion',
      intervalValue: 7,
      maxIntervalValue: 10,
      intervalUnit: 'days',
      endOnDate: '2026-10-31',
    };

    it('remains active up to endOnDate until completed on endOnDate or date advances past endOnDate', () => {
      const doneOct10 = new Date(2026, 9, 10, 12, 0).getTime();
      const task = makeWindowTask('mow', 'Mow lawn', seasonalRule, [doneOct10]);

      expect(isWindowStopped(task, new Date(2026, 9, 30, 12, 0))).toBe(false);
      expect(isWindowStopped(task, new Date(2026, 9, 31, 12, 0))).toBe(false);

      const doneOnEnd = {
        ...task,
        completionHistory: [doneOct10, new Date(2026, 9, 31, 14, 0).getTime()],
      };
      expect(isWindowStopped(doneOnEnd, new Date(2026, 9, 31, 18, 0))).toBe(true);
      expect(isWindowStopped(task, new Date(2026, 10, 1, 9, 0))).toBe(true);
    });
  });

  describe('Zero calendar leakage & Calendar Completed projection', () => {
    it('keeps undated one-time and window tasks off due lists/occurrences while showing completions on calendar dates', () => {
      const doneMay12 = new Date(2026, 4, 12, 15, 0).getTime();
      const windowTask = makeWindowTask(
        'win-cal',
        'Descaler',
        { type: 'after_completion', intervalValue: 1, maxIntervalValue: 2, intervalUnit: 'months' },
        [doneMay12],
        { dueAt: '2026-05-20' } // Even if stale dueAt is present, it must not leak
      );
      const openUndated = makeUndatedOneTime('u-open', 'Organize cables');
      const doneUndated = makeUndatedOneTime('u-done', 'Replace batteries', {
        dueAt: '2026-05-12',
        completedAt: doneMay12,
        completionHistory: [doneMay12],
      });

      expect(taskOccursOnDate(windowTask, '2026-05-20')).toBe(false);
      expect(taskOccursOnDate(openUndated, '2026-05-20')).toBe(false);
      expect(getNextUncompletedOccurrenceDate(windowTask, new Date(2026, 4, 20))).toBeNull();
      expect(getNextUncompletedOccurrenceDate(openUndated, new Date(2026, 4, 20))).toBeNull();
      expect(getSkipOccurrenceDate(windowTask, '2026-05-20')).toBeNull();

      expect(tasksDueOnDate([windowTask, openUndated], '2026-05-20')).toEqual([]);

      const completedMay12 = completedTasksOnDate([windowTask, openUndated, doneUndated], '2026-05-12');
      expect(completedMay12.map((t) => t.id)).toEqual(['win-cal', 'u-done']);
      expect(completedMay12[0].dueAt).toBeNull();
      expect(completedMay12[0].completedAt).toBe(doneMay12);
    });
  });

  describe('Sorting & Search', () => {
    it('sortWindowTasks orders overdue/urgent first, then in_window/not_done_yet, then before_min', () => {
      const now = new Date(2026, 4, 20, 12, 0);
      const rule: RecurrenceRule = {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 5,
        intervalUnit: 'days',
      };
      const beforeMin = makeWindowTask('t-before', 'Fresh', rule, [new Date(2026, 4, 19, 12, 0).getTime()]);
      const inWin = makeWindowTask('t-win', 'In Window', rule, [new Date(2026, 4, 16, 12, 0).getTime()]);
      const notDone = makeWindowTask('t-never', 'Never Done', rule, []);
      const overdue = makeWindowTask('t-over', 'Overdue', rule, [new Date(2026, 4, 10, 12, 0).getTime()]);

      const sorted = sortWindowTasks([beforeMin, inWin, notDone, overdue], now);
      expect(sorted.map((t) => t.id)).toEqual(['t-over', 't-never', 't-win', 't-before']);
    });

    it('sortUndatedOneTimeTasks respects sortOrder ascending and falls back to createdAt with nulls last', () => {
      const u1 = makeUndatedOneTime('u1', 'Third unordered', { createdAt: 300 });
      const u2 = makeUndatedOneTime('u2', 'Second ordered', { sortOrder: 2000, createdAt: 50 });
      const u3 = makeUndatedOneTime('u3', 'First ordered', { sortOrder: 1000, createdAt: 500 });
      const u4 = makeUndatedOneTime('u4', 'First unordered', { createdAt: 100 });

      const sorted = sortUndatedOneTimeTasks([u1, u2, u3, u4]);
      expect(sorted.map((t) => t.id)).toEqual(['u3', 'u2', 'u4', 'u1']);
    });

    it('searchTasks finds active and stopped window tasks without phantom future dates', () => {
      const now = new Date(2026, 4, 20, 12, 0);
      const doneMay10 = new Date(2026, 4, 10, 12, 0).getTime();
      const activeWin = makeWindowTask(
        's-active',
        'Clean coffee grinder',
        { type: 'after_completion', intervalValue: 2, maxIntervalValue: 3, intervalUnit: 'weeks' },
        [doneMay10]
      );
      const stoppedWin = makeWindowTask(
        's-stopped',
        'Clean patio coffee table',
        {
          type: 'after_completion',
          intervalValue: 1,
          maxIntervalValue: 2,
          intervalUnit: 'weeks',
          endOnDate: '2026-05-10',
        },
        [doneMay10]
      );

      const res = searchTasks([activeWin, stoppedWin], 'coffee', now);
      expect(res.active.map((r) => r.id)).toEqual(['s-active']);
      expect(res.active[0].jumpDateStr).toBeNull();
      expect(res.active[0].task.dueAt).toBeNull();

      expect(res.completed.map((r) => r.id)).toEqual(['s-stopped']);
      expect(res.completed[0].completable).toBe(false);
      expect(res.completed[0].jumpDateStr).toBe('2026-05-10');
    });
  });

  describe('parseSyncPayload', () => {
    it('validates years unit, normalizes legacy after_completion, preserves removedCompletions, and clears dueAt/startDate', () => {
      const payload = JSON.stringify({
        version: 1,
        exportedAt: 5000,
        tasks: [
          {
            id: 'win-sync-1',
            title: 'Smoke detector battery',
            listId: 'inbox',
            dueAt: '2026-06-01',
            startDate: '2026-01-01',
            recurrence: {
              type: 'after_completion',
              intervalValue: 6,
              maxIntervalValue: 3, // smaller than min -> clamped to 6
              intervalUnit: 'months',
            },
            completionHistory: [1000, 2000],
            removedCompletions: [500],
            createdAt: 100,
            updatedAt: 200,
          },
          {
            id: 'legacy-after',
            title: 'Annual checkup',
            listId: 'inbox',
            recurrence: {
              type: 'after_completion',
              intervalValue: 1,
              intervalUnit: 'years',
            },
            completionHistory: [],
            createdAt: 100,
            updatedAt: 200,
          },
        ],
        lists: [],
        folders: [],
      });

      const parsed = parseSyncPayload(payload, { now: 6000 });
      expect(parsed.tasks).toHaveLength(2);

      const t1 = parsed.tasks[0];
      expect(t1.recurrence?.maxIntervalValue).toBe(6);
      expect(t1.dueAt).toBeNull();
      expect(t1.startDate).toBeNull();
      expect(t1.removedCompletions).toEqual([500]);

      const t2 = parsed.tasks[1];
      expect(t2.recurrence?.intervalUnit).toBe('years');
      expect(t2.recurrence?.maxIntervalValue).toBe(1);
    });
  });

  describe('findMidpointReorderUpdate', () => {
    it('updates only the single moved item across top, bottom, middle, and trailing-null cases', () => {
      const a = makeUndatedOneTime('a', 'A', { sortOrder: 1000 });
      const b = makeUndatedOneTime('b', 'B', { sortOrder: 2000 });
      const c = makeUndatedOneTime('c', 'C', { sortOrder: 3000 });
      const d = makeUndatedOneTime('d', 'D', { sortOrder: undefined });

      // Move C to top: [c, a, b] -> c gets 1000 - 1000 = 0
      const top = findMidpointReorderUpdate([c, a, b], ['c', 'a', 'b']);
      expect(top).toEqual({ task: c, nextOrder: 0 });

      // Move A to bottom: [b, c, a] -> a gets 3000 + 1000 = 4000
      const bottom = findMidpointReorderUpdate([b, c, a], ['b', 'c', 'a']);
      expect(bottom).toEqual({ task: a, nextOrder: 4000 });

      // Move C between A and B: [a, c, b] -> c gets floor((1000 + 2000)/2) = 1500
      const mid = findMidpointReorderUpdate([a, c, b], ['a', 'c', 'b']);
      expect(mid).toEqual({ task: c, nextOrder: 1500 });

      // Move unordered D between A and B: [a, d, b] -> d gets 1500
      const insertUnordered = findMidpointReorderUpdate([a, d, b], ['a', 'd', 'b']);
      expect(insertUnordered).toEqual({ task: d, nextOrder: 1500 });

      // Placing an item after unordered items triggers full rebalance (null)
      const d2 = makeUndatedOneTime('d2', 'D2', { sortOrder: undefined });
      const afterNull = findMidpointReorderUpdate([d, d2, a], ['d', 'd2', 'a']);
      expect(afterNull).toBeNull();

      // Gap < 2 between tightly packed neighbors triggers full rebalance (null)
      const tightA = makeUndatedOneTime('ta', 'TA', { sortOrder: 1000 });
      const tightB = makeUndatedOneTime('tb', 'TB', { sortOrder: 1001 });
      const tightD = makeUndatedOneTime('td', 'TD', { sortOrder: 1002 });
      const noRoom = findMidpointReorderUpdate([tightA, c, tightB, tightD], ['ta', 'c', 'tb', 'td']);
      expect(noRoom).toBeNull();
    });
  });
});
