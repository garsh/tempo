import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import {
  completeTask,
  db,
  moveRecurringOccurrenceOnly,
  moveRecurringSeries,
  restoreTaskSnapshot,
  saveTask,
  skipTaskOccurrence,
  uncompleteTask,
  unskipTaskOccurrence,
} from '../../db/db';
import { mergeTasks } from '../merge';
import {
  completionTimestampForDate,
  isCompletedOnDate,
  parseDate,
  taskOccursOnDate,
} from '../recurrence';

function makeSeriesTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'rec-1',
    title: 'Take out trash',
    notes: 'Curbside before 8am',
    listId: INBOX_LIST_ID,
    dueAt: '2026-11-21T08:00',
    startDate: '2026-11-07',
    recurrence: {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [6],
    },
    completionHistory: [
      completionTimestampForDate('2026-11-07'),
      completionTimestampForDate('2026-11-14'),
    ],
    sortOrder: 2000,
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('db recurring task move operations', () => {
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

  it('Decision A2: moveRecurringOccurrenceOnly keeps same task, handles chained moves and move-back, applies title/notes, and preserves sortOrder', async () => {
    const initial = makeSeriesTask();
    store.set(initial.id, structuredClone(initial));

    // Move Sat Nov 21 -> Sun Nov 22 with a title edit
    const res1 = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-21',
      toDate: '2026-11-22',
      title: 'Take out trash & recycling',
      notes: 'Updated notes',
    });
    expect(res1).not.toBeNull();
    expect(res1!.task.id).toBe(initial.id);
    expect(res1!.task.title).toBe('Take out trash & recycling');
    expect(res1!.task.notes).toBe('Updated notes');
    expect(res1!.task.sortOrder).toBe(2000);
    expect(res1!.task.rescheduledDates).toEqual({ '2026-11-21': '2026-11-22' });
    expect(store.size).toBe(1);

    // Chained move Sun Nov 22 -> Mon Nov 23 updates single key '2026-11-21'
    const res2 = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-22',
      toDate: '2026-11-23',
    });
    expect(res2!.task.rescheduledDates).toEqual({ '2026-11-21': '2026-11-23' });

    // Moving back Mon Nov 23 -> Sat Nov 21 removes override cleanly
    const res3 = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-23',
      toDate: '2026-11-21',
    });
    expect(res3!.task.rescheduledDates).toBeUndefined();
  });

  it('moveRecurringOccurrenceOnly skips origDate when moved onto an existing scheduled occurrence', async () => {
    const initial = makeSeriesTask({
      rescheduledDates: { '2026-11-21': '2026-11-22' },
    });
    store.set(initial.id, structuredClone(initial));

    const res = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-22',
      toDate: '2026-11-28', // already a Saturday occurrence
    });
    expect(res!.task.rescheduledDates).toBeUndefined();
    expect(res!.task.skippedDates).toEqual(['2026-11-21']);
  });

  it('Decision D1: moves an already-completed occurrence cleanly and rejects moving a completion to the future', async () => {
    const completedSat = makeSeriesTask({
      completionHistory: [
        completionTimestampForDate('2026-11-07'),
        completionTimestampForDate('2026-11-14'),
        completionTimestampForDate('2026-11-21'),
      ],
    });
    store.set(completedSat.id, structuredClone(completedSat));

    // Reject moving completion into the future
    const rejected = await moveRecurringOccurrenceOnly({
      id: completedSat.id,
      fromDate: '2026-11-21',
      toDate: '2026-11-22',
      today: parseDate('2026-11-21'),
    });
    expect(rejected).toBeNull();

    // Allow moving completion to Friday Nov 20
    const moved = await moveRecurringOccurrenceOnly({
      id: completedSat.id,
      fromDate: '2026-11-21',
      toDate: '2026-11-20',
      today: parseDate('2026-11-21'),
    });
    expect(moved).not.toBeNull();
    expect(isCompletedOnDate(moved!.task, '2026-11-21')).toBe(false);
    expect(isCompletedOnDate(moved!.task, '2026-11-20')).toBe(true);
    expect(moved!.task.removedCompletions?.length).toBeGreaterThan(0);
    // Sat Nov 21 must not reappear as open because origDate is mapped to Nov 20
    expect(taskOccursOnDate(moved!.task, '2026-11-21')).toBe(false);
  });

  it('Decision B3-Single-Task: moveRecurringSeries archives prior schedule segment, preserves past skips, prunes future skips into tombstones, and preserves time', async () => {
    const initial = makeSeriesTask({
      skippedDates: ['2026-11-07', '2026-11-28'],
      rescheduledDates: {
        '2026-11-14': '2026-11-15',
        '2026-12-05': '2026-12-06',
      },
      completionHistory: [completionTimestampForDate('2026-11-15')],
    });
    store.set(initial.id, structuredClone(initial));

    const res = await moveRecurringSeries({
      id: initial.id,
      fromDate: '2026-11-21',
      toDate: '2026-11-22',
    });
    expect(res).not.toBeNull();
    const updated = res!.task;
    expect(updated.id).toBe(initial.id);
    expect(updated.startDate).toBe('2026-11-22');
    expect(updated.dueAt).toBe('2026-11-22T08:00');
    expect(updated.recurrence?.weekdays).toEqual([0]);
    expect(updated.sortOrder).toBeUndefined();
    expect(updated.scheduleHistory).toEqual([
      {
        startDate: '2026-11-07',
        endDate: '2026-11-20',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [6],
        },
      },
    ]);
    // Past skip & past reschedule preserved; future skip/reschedule pruned & tombstoned
    expect(updated.skippedDates).toEqual(['2026-11-07']);
    expect(updated.removedSkippedDates).toEqual(['2026-11-28']);
    expect(updated.rescheduledDates).toEqual({ '2026-11-14': '2026-11-15' });

    // Second move forward: Sun Nov 29 -> Tue Dec 1 builds a second non-overlapping segment
    const res2 = await moveRecurringSeries({
      id: initial.id,
      fromDate: '2026-11-29',
      toDate: '2026-12-01',
    });
    expect(res2!.task.scheduleHistory).toHaveLength(2);
    expect(res2!.task.scheduleHistory![1]).toEqual({
      startDate: '2026-11-22',
      endDate: '2026-11-28',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [0],
      },
    });
    expect(res2!.task.startDate).toBe('2026-12-01');
    expect(res2!.task.recurrence?.weekdays).toEqual([2]);
  });

  it('restoreTaskSnapshot reverts move cleanly and tombstones any added skips or completions', async () => {
    const initial = makeSeriesTask();
    store.set(initial.id, structuredClone(initial));

    const moved = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-21',
      toDate: '2026-11-28', // skips '2026-11-21'
    });
    expect(moved!.task.skippedDates).toEqual(['2026-11-21']);

    const restored = await restoreTaskSnapshot(moved!.previousTask, moved!.task);
    expect(restored.skippedDates ?? []).toEqual([]);
    expect(restored.removedSkippedDates).toEqual(['2026-11-21']);
    expect(restored.rescheduledDates).toBeUndefined();
    expect(restored.sortOrder).toBe(2000);
  });

  it('skipTaskOccurrence on a rescheduled occurrence clears override and skips origDate', async () => {
    const initial = makeSeriesTask({
      dueAt: '2026-11-21',
      rescheduledDates: { '2026-11-21': '2026-11-22' },
    });
    store.set(initial.id, structuredClone(initial));

    const skipped = await skipTaskOccurrence(initial.id, '2026-11-22');
    expect(skipped!.skippedDates).toContain('2026-11-21');
    expect(skipped!.rescheduledDates).toBeUndefined();
  });

  it('saveTask preserves sortOrder, rescheduledDates, and scheduleHistory on title-only recurring edits, and completeTask tombstones unskipped dates', async () => {
    const initial = makeSeriesTask({
      dueAt: '2026-11-07',
      skippedDates: ['2026-11-21'],
      rescheduledDates: { '2026-11-28': '2026-11-29' },
      scheduleHistory: [
        {
          startDate: '2026-10-01',
          endDate: '2026-11-06',
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [5] },
        },
      ],
    });
    store.set(initial.id, structuredClone(initial));

    // Title-only edit passes projected today's dueAt (2026-11-21) while existing.dueAt was 2026-11-07
    const saved = await saveTask({
      id: initial.id,
      title: 'Take out kitchen trash',
      dueAt: '2026-11-21',
      recurrence: initial.recurrence,
    });
    expect(saved.sortOrder).toBe(2000);
    expect(saved.startDate).toBe('2026-11-07');
    expect(saved.rescheduledDates).toEqual({ '2026-11-28': '2026-11-29' });
    expect(saved.scheduleHistory).toHaveLength(1);

    // Completing previously skipped date records it in removedSkippedDates
    const completed = await completeTask(initial.id, '2026-11-21');
    expect(completed!.skippedDates).toEqual([]);
    expect(completed!.removedSkippedDates).toEqual(['2026-11-21']);
  });

  it('survives Drive merge when re-completing a past date or undoing a completed move after sync', async () => {
    const initial = makeSeriesTask({
      completionHistory: [
        completionTimestampForDate('2026-11-07'),
        completionTimestampForDate('2026-11-14'),
      ],
    });
    store.set(initial.id, structuredClone(initial));

    const moved = await moveRecurringOccurrenceOnly({
      id: initial.id,
      fromDate: '2026-11-14',
      toDate: '2026-11-13',
      today: parseDate('2026-11-24'),
    });
    // Simulate debounced sync uploading moved task (containing removedCompletions for 2026-11-14)
    const syncedRemote = structuredClone(moved!.task);

    // User clicks Undo -> restoreTaskSnapshot
    const restored = await restoreTaskSnapshot(moved!.previousTask, moved!.task);
    const mergedAfterUndo = mergeTasks([restored], [syncedRemote])[0]!;
    expect(isCompletedOnDate(mergedAfterUndo, '2026-11-14')).toBe(true);
    expect(isCompletedOnDate(mergedAfterUndo, '2026-11-13')).toBe(false);

    // Also test uncomplete -> sync -> re-complete same past date
    const uncompleted = await uncompleteTask(initial.id, '2026-11-07');
    const syncedAfterUncomplete = structuredClone(uncompleted!);
    const recompleted = await completeTask(initial.id, '2026-11-07');
    const mergedAfterRecomplete = mergeTasks([recompleted!], [syncedAfterUncomplete])[0]!;
    expect(isCompletedOnDate(mergedAfterRecomplete, '2026-11-07')).toBe(true);
  });

  it('clears all completionHistory when uncompleting an overdue one-off task and clears stale startDate when removing recurrence', async () => {
    const todayTs = new Date(2026, 10, 24, 10, 0, 0).getTime();
    const pastTs = completionTimestampForDate('2026-11-20');
    const oneOff: Task = {
      id: 'oneoff-overdue',
      title: 'Mail package',
      listId: INBOX_LIST_ID,
      dueAt: '2026-11-20',
      completedAt: todayTs,
      completionHistory: [pastTs, todayTs],
      recurrence: null,
      createdAt: 1000,
      updatedAt: todayTs,
    };
    store.set(oneOff.id, oneOff);

    const uncompleted = await uncompleteTask(oneOff.id, '2026-11-20');
    expect(uncompleted!.completedAt).toBeNull();
    expect(uncompleted!.completionHistory).toEqual([]);
    expect(uncompleted!.removedCompletions).toEqual([pastTs, todayTs].sort((a, b) => a - b));

    // Removing recurrence on a fixed recurring task clears startDate
    const series = makeSeriesTask();
    store.set(series.id, series);
    const turnedOneOff = await saveTask({
      id: series.id,
      title: series.title,
      dueAt: '2026-11-24',
      recurrence: null,
    });
    expect(turnedOneOff.startDate).toBeNull();
  });

  it('unskipTaskOccurrence removes only the requested skipped date and clears empty skippedDates (Item T)', async () => {
    const initial = makeSeriesTask({
      skippedDates: ['2026-11-21', '2026-11-28'],
    });
    store.set(initial.id, structuredClone(initial));

    const first = await unskipTaskOccurrence(initial.id, '2026-11-21');
    expect(first).not.toBeNull();
    expect(first!.skippedDates).toEqual(['2026-11-28']);
    expect(store.get(initial.id)!.skippedDates).toEqual(['2026-11-28']);

    const second = await unskipTaskOccurrence(initial.id, '2026-11-28');
    expect(second).not.toBeNull();
    expect(second!.skippedDates).toBeUndefined();
    expect(store.get(initial.id)!.skippedDates).toBeUndefined();

    const noop = await unskipTaskOccurrence(initial.id, '2026-12-05');
    expect(noop).not.toBeNull();
    expect(noop!.skippedDates).toBeUndefined();
  });
});
