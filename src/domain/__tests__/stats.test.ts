import { describe, it, expect } from 'vitest';
import { computeTempoStats } from '../stats';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('computeTempoStats', () => {
  const now = new Date(2026, 9, 5, 12, 0, 0); // Mon Oct 5 2026

  it('counts open, overdue, due today, week completions, streak', () => {
    const todayTs = new Date(2026, 9, 5, 9, 0, 0).getTime();
    const yesterdayTs = new Date(2026, 9, 4, 9, 0, 0).getTime();
    const tasks = [
      task({ id: '1', title: 'Overdue', dueAt: '2026-10-03' }),
      task({ id: '2', title: 'Today', dueAt: '2026-10-05T18:00' }),
      task({ id: '3', title: 'Done today', dueAt: '2026-10-04', completedAt: todayTs, completionHistory: [todayTs] }),
      task({
        id: '4',
        title: 'Done yesterday',
        completedAt: yesterdayTs,
        completionHistory: [yesterdayTs],
      }),
    ];
    const s = computeTempoStats(tasks, now);
    expect(s.openCount).toBe(2);
    expect(s.overdueCount).toBe(1);
    expect(s.dueTodayCount).toBe(1);
    expect(s.completedThisWeek).toBe(2);
    expect(s.completionStreakDays).toBe(2);
  });
});
