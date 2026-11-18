import { describe, it, expect } from 'vitest';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import {
  isCompletedOnDate,
  isCompleted,
  isRecurring,
  completionTimestampForDate,
  formatDate,
} from '../recurrence';

/**
 * Pure transition functions mirroring db.ts task mutations,
 * allowing interaction verification independently of IndexedDB lifecycle.
 */
function applyCompleteTask(task: Task, dateStr?: string, now: number = Date.now()): Task {
  if (isRecurring(task) && task.recurrence) {
    const targetDateStr = dateStr || (task.dueAt ? task.dueAt.slice(0, 10) : formatDate(new Date(now)));
    const ts = completionTimestampForDate(targetDateStr, now);
    const alreadyDone = isCompletedOnDate(task, targetDateStr);
    const history = alreadyDone
      ? [...(task.completionHistory || [])]
      : [...(task.completionHistory || []), ts];

    return {
      ...task,
      dueAt: task.dueAt ?? targetDateStr,
      completedAt: null,
      completionHistory: history,
      updatedAt: now,
      subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: false })),
    };
  } else {
    const compTs = dateStr ? completionTimestampForDate(dateStr, now) : now;
    const prevHistory = task.completionHistory || [];
    const history = prevHistory.includes(now)
      ? prevHistory
      : dateStr && compTs !== now && !prevHistory.includes(compTs)
        ? [...prevHistory, compTs, now]
        : [...prevHistory, now];

    return {
      ...task,
      completedAt: now,
      completionHistory: history,
      updatedAt: now,
    };
  }
}

function applyUncompleteTask(task: Task, dateStr?: string, now: number = Date.now()): Task {
  let history = task.completionHistory || [];

  if (isRecurring(task) && task.recurrence) {
    const targetDateStr = dateStr || (task.dueAt ? task.dueAt.slice(0, 10) : formatDate(new Date(now)));
    history = history.filter((ts) => formatDate(new Date(ts)) !== targetDateStr);
  } else if (dateStr) {
    history = history.filter((ts) => formatDate(new Date(ts)) !== dateStr);
  } else {
    history = [];
  }

  return {
    ...task,
    completedAt: null,
    completionHistory: history,
    updatedAt: now,
  };
}

function applyDeleteTask(task: Task, now: number = Date.now()): Task {
  return {
    ...task,
    deletedAt: now,
    updatedAt: now,
  };
}

describe('Task Completion, Uncompletion & Tombstone Interaction Lifecycle', () => {
  const baseTask: Task = {
    id: 'chore-1',
    title: 'Clean Kitchen Counters',
    listId: INBOX_LIST_ID,
    createdAt: 1000,
    updatedAt: 1000,
    dueAt: '2026-11-17',
    subtasks: [
      { id: 'sub-1', title: 'Wipe surface', completed: true },
      { id: 'sub-2', title: 'Dry counters', completed: false },
    ],
    completionHistory: [],
    recurrence: null,
  };

  describe('One-off Task Completion Cycle', () => {
    it('completing a one-off task sets completedAt and appends timestamp', () => {
      const now = 2000;
      const completed = applyCompleteTask(baseTask, undefined, now);

      expect(completed.completedAt).toBe(now);
      expect(completed.completionHistory).toContain(now);
      expect(isCompleted(completed)).toBe(true);
      expect(isCompletedOnDate(completed, '2026-11-17')).toBe(true);
    });

    it('uncompleting a one-off task resets completedAt to null and clears date timestamp', () => {
      const now = 2000;
      const completed = applyCompleteTask(baseTask, undefined, now);
      const uncompleted = applyUncompleteTask(completed, undefined, 3000);

      expect(uncompleted.completedAt).toBeNull();
      expect(uncompleted.completionHistory).toHaveLength(0);
      expect(isCompleted(uncompleted)).toBe(false);
      expect(isCompletedOnDate(uncompleted, '2026-11-17')).toBe(false);
    });
  });

  describe('Recurring Task Completion Cycle', () => {
    const dailyRoutine: Task = {
      ...baseTask,
      id: 'routine-1',
      title: 'Vitamins & Water',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
    };

    it('completing recurring task maintains completedAt as null and resets subtasks', () => {
      const completed = applyCompleteTask(dailyRoutine, '2026-11-17', 2000);

      expect(completed.completedAt).toBeNull();
      expect(completed.completionHistory).toHaveLength(1);
      expect(isCompletedOnDate(completed, '2026-11-17')).toBe(true);
      expect(isCompletedOnDate(completed, '2026-11-18')).toBe(false);

      // Check items reset for the next occurrence
      expect((completed.subtasks ?? []).every((s) => !s.completed)).toBe(true);
    });

    it('idempotency: completing the same occurrence date twice does not duplicate timestamps', () => {
      const completedOnce = applyCompleteTask(dailyRoutine, '2026-11-17', 2000);
      const completedTwice = applyCompleteTask(completedOnce, '2026-11-17', 2500);

      expect(completedTwice.completionHistory).toHaveLength(1);
    });

    it('multi-day completion progression registers each day independently', () => {
      const day1 = applyCompleteTask(dailyRoutine, '2026-11-17', 1000);
      const day2 = applyCompleteTask(day1, '2026-11-18', 2000);
      const day3 = applyCompleteTask(day2, '2026-11-19', 3000);

      expect(day3.completionHistory).toHaveLength(3);
      expect(isCompletedOnDate(day3, '2026-11-17')).toBe(true);
      expect(isCompletedOnDate(day3, '2026-11-18')).toBe(true);
      expect(isCompletedOnDate(day3, '2026-11-19')).toBe(true);
      expect(isCompletedOnDate(day3, '2026-11-20')).toBe(false);
    });

    it('uncompleting a specific date removes ONLY that date and preserves others', () => {
      const day1 = applyCompleteTask(dailyRoutine, '2026-11-17', 1000);
      const day2 = applyCompleteTask(day1, '2026-11-18', 2000);
      const day3 = applyCompleteTask(day2, '2026-11-19', 3000);

      // Uncomplete Day 2 only
      const uncompletedDay2 = applyUncompleteTask(day3, '2026-11-18', 4000);

      expect(uncompletedDay2.completionHistory).toHaveLength(2);
      expect(isCompletedOnDate(uncompletedDay2, '2026-11-17')).toBe(true);
      expect(isCompletedOnDate(uncompletedDay2, '2026-11-18')).toBe(false); // Removed!
      expect(isCompletedOnDate(uncompletedDay2, '2026-11-19')).toBe(true);
    });
  });

  describe('Soft Delete Tombstone Lifecycle', () => {
    it('deleting a task sets deletedAt timestamp and preserves existing task properties', () => {
      const now = 5000;
      const deleted = applyDeleteTask(baseTask, now);

      expect(deleted.deletedAt).toBe(now);
      expect(deleted.id).toBe(baseTask.id);
      expect(deleted.title).toBe(baseTask.title);
    });

    it('filters out deleted tasks from active queries', () => {
      const active = baseTask;
      const deleted = applyDeleteTask({ ...baseTask, id: 'deleted-1' }, 2000);

      const all = [active, deleted];
      const filteredActive = all.filter((t) => !t.deletedAt);

      expect(filteredActive).toHaveLength(1);
      expect(filteredActive[0].id).toBe('chore-1');
    });
  });
});
