import { describe, expect, it } from 'vitest';
import type { RecurrenceRule, Task } from '../../types/task';
import { completedTasksOnDate, tasksDueOnDate } from '../calendar';
import {
  analyzeRecurringDateMove,
  buildSeriesMoveRule,
  recurrenceRulesEqual,
} from '../moveRecurring';
import {
  completionTimestampForDate,
  getEarliestOccurrenceBound,
  getEffectiveEndOnDate,
  getNextUncompletedOccurrenceDate,
  getSkipOccurrenceDate,
  isRecurrenceFinished,
  parseDate,
  taskOccursOnDate,
} from '../recurrence';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Take out recycling',
    dueAt: '2026-11-21',
    startDate: '2026-11-07',
    recurrence: {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [6], // Sat
    },
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('recurrenceRulesEqual', () => {
  it('ignores weekday ordering and undefined vs null optional fields', () => {
    const a: RecurrenceRule = {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [5, 1, 3],
      endOnDate: null,
    };
    const b: RecurrenceRule = {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [1, 3, 5],
      endAfterCount: null,
      monthDay: undefined,
    };
    expect(recurrenceRulesEqual(a, b)).toBe(true);
    expect(recurrenceRulesEqual(a, { ...b, weekdays: [1, 4, 5] })).toBe(false);
    expect(recurrenceRulesEqual(a, null)).toBe(false);
    expect(recurrenceRulesEqual(null, undefined)).toBe(true);
  });
});

describe('buildSeriesMoveRule & analyzeRecurringDateMove', () => {
  it('moves single-weekday weekly task Sat -> Sun', () => {
    const task = makeTask();
    const analysis = analyzeRecurringDateMove(
      task,
      '2026-11-21',
      '2026-11-22',
      parseDate('2026-11-21')
    );
    expect(analysis.nextRule.weekdays).toEqual([0]);
    expect(analysis.currentScheduleLabel).toBe('Every Sat');
    expect(analysis.nextScheduleLabel).toBe('Every Sun');
    expect(analysis.hasCollisionOnTarget).toBe(false);
    expect(analysis.isCompletedOccurrence).toBe(false);
  });

  it('handles weekly task without explicit weekdays', () => {
    const task = makeTask({
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
    });
    const analysis = analyzeRecurringDateMove(
      task,
      '2026-11-21',
      '2026-11-22',
      parseDate('2026-11-21')
    );
    expect(analysis.nextRule.weekdays).toBeUndefined();
    expect(analysis.currentScheduleLabel).toBe('Every Sat');
    expect(analysis.nextScheduleLabel).toBe('Every Sun');
  });

  it('Decision C1: substitutes fromDow -> toDow on multi-weekday tasks, deduplicating collisions and preserving same-day moves', () => {
    const multiTask = makeTask({
      startDate: '2026-11-02',
      dueAt: '2026-11-25',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 3, 5], // Mon, Wed, Fri
      },
    });

    // Wed Nov 25 -> Thu Nov 26 => [1, 4, 5]
    const moveToThu = analyzeRecurringDateMove(
      multiTask,
      '2026-11-25',
      '2026-11-26',
      parseDate('2026-11-25')
    );
    expect(moveToThu.nextRule.weekdays).toEqual([1, 4, 5]);
    expect(moveToThu.nextScheduleLabel).toBe('Every Mon, Thu, Fri');
    expect(moveToThu.hasCollisionOnTarget).toBe(false);

    // Wed Nov 25 -> Fri Nov 27 => [1, 5] and collision flagged
    const moveToFri = analyzeRecurringDateMove(
      multiTask,
      '2026-11-25',
      '2026-11-27',
      parseDate('2026-11-25')
    );
    expect(moveToFri.nextRule.weekdays).toEqual([1, 5]);
    expect(moveToFri.nextScheduleLabel).toBe('Every Mon, Fri');
    expect(moveToFri.hasCollisionOnTarget).toBe(true);

    // Mon Nov 23 -> Mon Nov 30 => stays [1, 3, 5]
    const moveSameDow = analyzeRecurringDateMove(
      multiTask,
      '2026-11-23',
      '2026-11-30',
      parseDate('2026-11-23')
    );
    expect(moveSameDow.nextRule.weekdays).toEqual([1, 3, 5]);

    // Moving a previously rescheduled occurrence uses origFromDate's weekday (Wed, not Thu!)
    const rescheduledMulti = makeTask({
      ...multiTask,
      rescheduledDates: { '2026-11-25': '2026-11-26' },
    });
    const fromRescheduled = analyzeRecurringDateMove(
      rescheduledMulti,
      '2026-11-26',
      '2026-11-24', // Tue
      parseDate('2026-11-26')
    );
    expect(fromRescheduled.origFromDate).toBe('2026-11-25');
    expect(fromRescheduled.nextRule.weekdays).toEqual([1, 2, 5]);
  });

  it('updates monthDay for monthly tasks and extends endOnDate when moved past it', () => {
    const monthly = makeTask({
      startDate: '2026-11-15',
      dueAt: '2026-11-15',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 15,
        endOnDate: '2026-11-15',
      },
    });
    const res = buildSeriesMoveRule(monthly.recurrence!, '2026-11-15', '2026-11-18');
    expect(res.nextRule.monthDay).toBe(18);
    expect(res.nextRule.endOnDate).toBe('2026-11-18');
    expect(res.endDateExtendedTo).toBe('2026-11-18');

    const analysis = analyzeRecurringDateMove(
      monthly,
      '2026-11-15',
      '2026-11-18',
      parseDate('2026-11-15')
    );
    expect(analysis.isFinalOccurrence).toBe(true);
    expect(analysis.endDateExtendedTo).toBe('2026-11-18');
  });

  it('flags daily collision and Decision D1 completed-occurrence future restriction', () => {
    const daily = makeTask({
      startDate: '2026-11-20',
      dueAt: '2026-11-21',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      completionHistory: [completionTimestampForDate('2026-11-21', parseDate('2026-11-21').getTime())],
    });
    const toFuture = analyzeRecurringDateMove(
      daily,
      '2026-11-21',
      '2026-11-22',
      parseDate('2026-11-21')
    );
    expect(toFuture.isDaily).toBe(true);
    expect(toFuture.isCompletedOccurrence).toBe(true);
    expect(toFuture.canMoveCompletedOccurrence).toBe(false);

    const toPast = analyzeRecurringDateMove(
      daily,
      '2026-11-21',
      '2026-11-19',
      parseDate('2026-11-21')
    );
    expect(toPast.isCompletedOccurrence).toBe(true);
    expect(toPast.canMoveCompletedOccurrence).toBe(true);
  });
});

describe('Recurrence engine with rescheduledDates (A2) and scheduleHistory (B3-single-task)', () => {
  it('moves only a single occurrence Sat Nov 21 -> Sun Nov 22 while keeping recurring identity', () => {
    const task = makeTask({
      completionHistory: [completionTimestampForDate('2026-11-07'), completionTimestampForDate('2026-11-14')],
      rescheduledDates: { '2026-11-21': '2026-11-22' },
    });

    expect(taskOccursOnDate(task, '2026-11-21')).toBe(false);
    expect(taskOccursOnDate(task, '2026-11-22')).toBe(true);
    expect(taskOccursOnDate(task, '2026-11-28')).toBe(true);
    expect(taskOccursOnDate(task, '2026-11-29')).toBe(false);

    expect(tasksDueOnDate([task], '2026-11-21')).toHaveLength(0);
    expect(tasksDueOnDate([task], '2026-11-22')).toHaveLength(1);
    expect(getNextUncompletedOccurrenceDate(task, parseDate('2026-11-21'))).toBe('2026-11-22');
    // On Mon Nov 23, the moved Sun Nov 22 occurrence is overdue
    expect(getNextUncompletedOccurrenceDate(task, parseDate('2026-11-23'))).toBe('2026-11-22');

    // Completing on Sun Nov 22 records completion on Nov 22, does NOT resurrect Nov 21, advances next to Nov 28
    const completedSun: Task = {
      ...task,
      completionHistory: [...task.completionHistory, completionTimestampForDate('2026-11-22')],
    };
    expect(completedTasksOnDate([completedSun], '2026-11-22')).toHaveLength(1);
    expect(tasksDueOnDate([completedSun], '2026-11-21')).toHaveLength(0);
    expect(getNextUncompletedOccurrenceDate(completedSun, parseDate('2026-11-22'))).toBe('2026-11-28');
  });

  it('keeps final rescheduled occurrence active even past endOnDate and handles endAfterCount accurately', () => {
    const endBoundTask = makeTask({
      startDate: '2026-11-07',
      dueAt: '2026-11-21',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [6],
        endOnDate: '2026-11-21',
      },
      completionHistory: [completionTimestampForDate('2026-11-07'), completionTimestampForDate('2026-11-14')],
      rescheduledDates: { '2026-11-21': '2026-11-24' },
    });

    expect(getEffectiveEndOnDate(endBoundTask)).toBe('2026-11-24');
    expect(taskOccursOnDate(endBoundTask, '2026-11-21')).toBe(false);
    expect(taskOccursOnDate(endBoundTask, '2026-11-24')).toBe(true);
    expect(isRecurrenceFinished(endBoundTask, parseDate('2026-11-21'))).toBe(false);
    expect(getSkipOccurrenceDate(endBoundTask, '2026-11-24')).toBeNull();

    const finishedAfterSun: Task = {
      ...endBoundTask,
      completionHistory: [...endBoundTask.completionHistory, completionTimestampForDate('2026-11-24')],
    };
    expect(isRecurrenceFinished(finishedAfterSun, parseDate('2026-11-24'))).toBe(true);

    // endAfterCount: 3 total occurrences (Nov 7 done, Nov 14 done, Nov 21 moved to Nov 24)
    const countTask = makeTask({
      startDate: '2026-11-07',
      dueAt: '2026-11-21',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [6],
        endAfterCount: 3,
      },
      completionHistory: [completionTimestampForDate('2026-11-07'), completionTimestampForDate('2026-11-14')],
      rescheduledDates: { '2026-11-21': '2026-11-24' },
    });
    expect(taskOccursOnDate(countTask, '2026-11-24')).toBe(true);
    expect(taskOccursOnDate(countTask, '2026-11-28')).toBe(false);
  });

  it('supports backward rescheduled occurrences in getNextUncompletedOccurrenceDate & bounds', () => {
    const task = makeTask({
      startDate: '2026-11-21',
      dueAt: '2026-11-21',
      rescheduledDates: { '2026-11-21': '2026-11-19' },
    });
    expect(getEarliestOccurrenceBound(task)).toBe('2026-11-19');
    expect(getNextUncompletedOccurrenceDate(task, parseDate('2026-11-18'))).toBe('2026-11-19');
    expect(getNextUncompletedOccurrenceDate(task, parseDate('2026-11-20'))).toBe('2026-11-19');
  });

  it('Decision B3-Single-Task: preserves historical schedule segments inside one task without phantom overdue', () => {
    // Task ran Saturdays from Nov 7..Nov 27, then moved from Sat Nov 28 -> Sun Nov 29
    // while Sat Nov 21 is STILL open/uncompleted!
    const splitSingleTask = makeTask({
      startDate: '2026-11-29',
      dueAt: '2026-11-29',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [0], // Sun
      },
      scheduleHistory: [
        {
          startDate: '2026-11-07',
          endDate: '2026-11-27',
          recurrence: {
            type: 'fixed_interval',
            intervalValue: 1,
            intervalUnit: 'weeks',
            weekdays: [6], // Sat
          },
        },
      ],
      completionHistory: [
        completionTimestampForDate('2026-11-07'),
        completionTimestampForDate('2026-11-14'),
      ],
    });

    // Historical completed Saturdays stay visible
    expect(completedTasksOnDate([splitSingleTask], '2026-11-07')).toHaveLength(1);
    expect(completedTasksOnDate([splitSingleTask], '2026-11-14')).toHaveLength(1);
    // Open Sat Nov 21 is STILL preserved!
    expect(tasksDueOnDate([splitSingleTask], '2026-11-21')).toHaveLength(1);
    expect(getNextUncompletedOccurrenceDate(splitSingleTask, parseDate('2026-11-21'))).toBe('2026-11-21');
    // Sat Nov 28 was replaced by Sun Nov 29
    expect(taskOccursOnDate(splitSingleTask, '2026-11-28')).toBe(false);
    expect(taskOccursOnDate(splitSingleTask, '2026-11-29')).toBe(true);
    expect(taskOccursOnDate(splitSingleTask, '2026-12-06')).toBe(true);
    // No phantom Sunday Nov 15 / Nov 22
    expect(taskOccursOnDate(splitSingleTask, '2026-11-15')).toBe(false);
    expect(taskOccursOnDate(splitSingleTask, '2026-11-22')).toBe(false);
  });
});
