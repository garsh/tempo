import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';
import { db, findMidpointReorderUpdate, saveTask } from '../db';
import { sortTasksForDailyView, sortUndatedOneTimeTasks } from '../../domain/sorting';

function makeStoredTask(id: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title: `Task ${id}`,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

describe('saveTask newTaskPosition placement', () => {
  let store: Map<string, Task>;

  beforeEach(() => {
    store = new Map();
    vi.spyOn(db.tasks, 'get').mockImplementation(((id: string) =>
      Promise.resolve(store.get(id))) as never);
    vi.spyOn(db.tasks, 'put').mockImplementation(((t: Task) => {
      store.set(t.id, structuredClone(t));
      return Promise.resolve(t.id);
    }) as never);
    vi.spyOn(db.tasks, 'toArray').mockImplementation((() =>
      Promise.resolve(Array.from(store.values()))) as never);
    vi.spyOn(db, 'transaction').mockImplementation(((_mode: unknown, _table: unknown, cb: () => Promise<unknown>) =>
      cb()) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('defaults to bottom (leaves sortOrder undefined so new tasks appear after existing ones)', async () => {
    const existing1 = makeStoredTask('e1', { createdAt: 100 });
    const existing2 = makeStoredTask('e2', { createdAt: 200 });
    store.set(existing1.id, existing1);
    store.set(existing2.id, existing2);

    vi.spyOn(Date, 'now').mockReturnValueOnce(1000).mockReturnValueOnce(2000);
    const created = await saveTask({ title: 'New bottom task' });
    expect(created.sortOrder).toBeUndefined();

    const createdExplicitBottom = await saveTask(
      { title: 'Explicit bottom task' },
      { newTaskPosition: 'bottom' }
    );
    expect(createdExplicitBottom.sortOrder).toBeUndefined();

    const sortedUndated = sortUndatedOneTimeTasks([createdExplicitBottom, created, existing2, existing1]);
    expect(sortedUndated.slice(0, 2).map((t) => t.id)).toEqual(['e1', 'e2']);
    expect(sortedUndated.slice(2).map((t) => t.title)).toEqual([
      'New bottom task',
      'Explicit bottom task',
    ]);
  });

  it('assigns decreasing sortOrder values when newTaskPosition is "top" so consecutive new tasks stack at top', async () => {
    const oldUndated = makeStoredTask('old-u', { title: 'Old undated', createdAt: 100 });
    const oldDated = makeStoredTask('old-d', {
      title: 'Old dated',
      dueAt: '2026-11-21',
      createdAt: 100,
    });
    store.set(oldUndated.id, oldUndated);
    store.set(oldDated.id, oldDated);

    const firstTop = await saveTask(
      { title: 'First top', dueAt: null },
      { newTaskPosition: 'top' }
    );
    expect(firstTop.sortOrder).toBe(0);

    const secondTop = await saveTask(
      { title: 'Second top', dueAt: null },
      { newTaskPosition: 'top' }
    );
    expect(secondTop.sortOrder).toBe(-1000);

    const thirdTopDated = await saveTask(
      { title: 'Third top dated', dueAt: '2026-11-21' },
      { newTaskPosition: 'top' }
    );
    expect(thirdTopDated.sortOrder).toBe(-2000);

    const undatedList = sortUndatedOneTimeTasks([oldUndated, firstTop, secondTop]);
    expect(undatedList.map((t) => t.title)).toEqual([
      'Second top',
      'First top',
      'Old undated',
    ]);

    const dailyList = sortTasksForDailyView([oldDated, thirdTopDated]);
    expect(dailyList.map((t) => t.title)).toEqual(['Third top dated', 'Old dated']);
  });

  it('places above existing ordered tasks while ignoring soft-deleted tasks and supports midpoint reordering', async () => {
    const ordered1 = makeStoredTask('o1', { sortOrder: 1000 });
    const ordered2 = makeStoredTask('o2', { sortOrder: 2000 });
    const deletedLow = makeStoredTask('del', { sortOrder: -99999, deletedAt: 500 });
    store.set(ordered1.id, ordered1);
    store.set(ordered2.id, ordered2);
    store.set(deletedLow.id, deletedLow);

    const added = await saveTask({ title: 'Top above ordered' }, { newTaskPosition: 'top' });
    expect(added.sortOrder).toBe(0);

    const sorted = sortUndatedOneTimeTasks([ordered2, ordered1, added]);
    expect(sorted.map((t) => t.id)).toEqual([added.id, 'o1', 'o2']);

    // Dragging ordered2 between added (0) and ordered1 (1000) yields a midpoint of 500
    const reordered = [added, ordered2, ordered1];
    const midpoint = findMidpointReorderUpdate(
      reordered,
      reordered.map((t) => t.id)
    );
    expect(midpoint).toEqual({ task: ordered2, nextOrder: 500 });
  });

  it('preserves an explicit task.sortOrder on creation even when newTaskPosition is "top"', async () => {
    const existing = makeStoredTask('o1', { sortOrder: 1000 });
    store.set(existing.id, existing);

    const created = await saveTask(
      { title: 'Explicit order', sortOrder: 2500 },
      { newTaskPosition: 'top' }
    );
    expect(created.sortOrder).toBe(2500);
  });

  it('does not assign sortOrder to approximate window periodic tasks', async () => {
    const existing = makeStoredTask('o1', { sortOrder: 1000 });
    store.set(existing.id, existing);

    const periodic = await saveTask(
      {
        title: 'Water plants',
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
      },
      { newTaskPosition: 'top' }
    );
    expect(periodic.sortOrder).toBeUndefined();
  });

  it('preserves existing sortOrder when updating an existing task even with newTaskPosition "top"', async () => {
    const existing = makeStoredTask('existing-1', {
      title: 'Existing',
      dueAt: '2026-11-21',
      sortOrder: 2000,
    });
    store.set(existing.id, existing);

    const updated = await saveTask(
      {
        id: 'existing-1',
        title: 'Existing renamed',
        dueAt: '2026-11-21',
      },
      { newTaskPosition: 'top' }
    );
    expect(updated.sortOrder).toBe(2000);
  });
});
