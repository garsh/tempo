import type { Task } from '../types/task';
import { splitDueAt } from './recurrence';

/** Batch operations available from Select mode (completion goes through completeTask). */
export type BatchOp =
  | { type: 'move'; listId: string }
  | { type: 'setDate'; date: string | null }
  | { type: 'delete' };

/**
 * New dueAt when moving a task to `date` (YYYY-MM-DD): keeps the time of day if the
 * task had one; `null` clears the date.
 */
export function dueAtOnDate(dueAt: string | null | undefined, date: string | null): string | null {
  if (!date) return null;
  if (!dueAt) return date;
  const { time } = splitDueAt(dueAt);
  return time ? `${date}T${time}` : date;
}

/**
 * Pure planner: the updated copies of the selected tasks for `op`. Unknown ids,
 * already-deleted tasks and no-op changes are skipped, so the result is exactly
 * what needs to be written.
 */
export function planBatch(tasks: Task[], ids: Iterable<string>, op: BatchOp, now: number = Date.now()): Task[] {
  const want = new Set(ids);
  const out: Task[] = [];
  for (const t of tasks) {
    if (!want.has(t.id) || t.deletedAt) continue;
    if (op.type === 'move') {
      if (t.listId === op.listId) continue;
      out.push({ ...t, listId: op.listId, updatedAt: now });
    } else if (op.type === 'setDate') {
      const dueAt = dueAtOnDate(t.dueAt, op.date);
      if ((t.dueAt ?? null) === dueAt) continue;
      out.push({ ...t, dueAt, updatedAt: now });
    } else {
      out.push({ ...t, deletedAt: now, updatedAt: now });
    }
  }
  return out;
}

/** Selection helper: toggle one id in an immutable Set. */
export function toggleSelected(selected: ReadonlySet<string>, id: string): Set<string> {
  const next = new Set(selected);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}
