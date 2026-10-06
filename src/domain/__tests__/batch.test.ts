import { describe, it, expect } from 'vitest';
import { dueAtOnDate, planBatch, toggleSelected } from '../batch';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

const t = (p: Partial<Task> & Pick<Task, 'id'>): Task => ({
  title: p.id,
  listId: INBOX_LIST_ID,
  createdAt: 1,
  updatedAt: 1,
  completionHistory: [],
  recurrence: null,
  ...p,
});

const tasks = [
  t({ id: 'a', dueAt: '2026-10-01T09:30' }),
  t({ id: 'b', listId: 'work', dueAt: '2026-10-02' }),
  t({ id: 'c' }),
  t({ id: 'gone', deletedAt: 5 }),
];

describe('batch ops', () => {
  it('moves only selected tasks that are not already in the list', () => {
    const out = planBatch(tasks, ['a', 'b', 'gone', 'missing'], { type: 'move', listId: 'work' }, 42);
    expect(out.map((x) => [x.id, x.listId, x.updatedAt])).toEqual([['a', 'work', 42]]);
  });

  it('sets a date keeping time of day, or clears it', () => {
    const out = planBatch(tasks, ['a', 'b', 'c'], { type: 'setDate', date: '2026-10-06' }, 7);
    expect(out.map((x) => [x.id, x.dueAt])).toEqual([
      ['a', '2026-10-06T09:30'],
      ['b', '2026-10-06'],
      ['c', '2026-10-06'],
    ]);
    const cleared = planBatch(tasks, ['a', 'c'], { type: 'setDate', date: null });
    expect(cleared.map((x) => [x.id, x.dueAt])).toEqual([['a', null]]);
  });

  it('soft-deletes selected tasks', () => {
    const out = planBatch(tasks, new Set(['b', 'c', 'gone']), { type: 'delete' }, 9);
    expect(out.map((x) => [x.id, x.deletedAt])).toEqual([
      ['b', 9],
      ['c', 9],
    ]);
  });

  it('helpers', () => {
    expect(dueAtOnDate('2026-01-01T07:05', '2026-02-02')).toBe('2026-02-02T07:05');
    expect(dueAtOnDate(undefined, null)).toBeNull();
    const s = toggleSelected(new Set(['a']), 'b');
    expect([...s].sort()).toEqual(['a', 'b']);
    expect([...toggleSelected(s, 'a')]).toEqual(['b']);
  });
});
