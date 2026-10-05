import { describe, it, expect } from 'vitest';
import { getTasksNeedingNotification, msUntilNextDue, notificationKey } from '../notifications';
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

describe('Notifications helpers', () => {
  const now = new Date(2026, 9, 5, 12, 0, 0);

  it('selects due tasks not yet fired', () => {
    const tasks = [
      task({ id: '1', title: 'Past date', dueAt: '2026-10-04' }),
      task({ id: '2', title: 'Past time', dueAt: '2026-10-05T09:00' }),
      task({ id: '3', title: 'Future', dueAt: '2026-10-05T18:00' }),
      task({ id: '4', title: 'Done', dueAt: '2026-10-04', completedAt: 1 }),
    ];
    const needing = getTasksNeedingNotification(tasks, now, {});
    expect(needing.map((t) => t.id).sort()).toEqual(['1', '2']);

    const fired = { [notificationKey(tasks[0])]: Date.now() };
    expect(getTasksNeedingNotification(tasks, now, fired).map((t) => t.id)).toEqual(['2']);
  });

  it('computes ms until next due', () => {
    const tasks = [
      task({ id: '1', title: 'Soon', dueAt: '2026-10-05T12:30' }),
      task({ id: '2', title: 'Later', dueAt: '2026-10-06T09:00' }),
    ];
    const ms = msUntilNextDue(tasks, now);
    expect(ms).toBe(30 * 60 * 1000);
  });
});
