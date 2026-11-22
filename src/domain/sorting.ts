import type { Task } from '../types/task';
import { getDueDeadline, getWindowProgress, type WindowProgress } from './recurrence';

function compareManualOrder(a: Task, b: Task): number {
  const hasOrderA = a.sortOrder != null;
  const hasOrderB = b.sortOrder != null;
  if (hasOrderA && hasOrderB) {
    return a.sortOrder! - b.sortOrder!;
  }
  if (hasOrderA !== hasOrderB) {
    return hasOrderA ? -1 : 1;
  }
  return 0;
}

function compareCreatedThenTitle(a: Task, b: Task): number {
  const createdA = a.createdAt ?? 0;
  const createdB = b.createdAt ?? 0;
  if (createdA !== createdB) return createdA - createdB;
  return a.title.localeCompare(b.title);
}

/**
 * Sort for daily-driver views:
 * 1. Manual sortOrder (when reordered; ordered items precede newly added ones)
 * 2. Earlier due deadline first
 * 3. Creation order (oldest / first-added first)
 * 4. Title A–Z
 */
export function sortTasksForDailyView(tasks: Task[]): Task[] {
  const dueMsByTask = new Map<Task, number>();
  for (const t of tasks) {
    dueMsByTask.set(t, t.dueAt ? getDueDeadline(t.dueAt).getTime() : Number.POSITIVE_INFINITY);
  }
  return [...tasks].sort((a, b) => {
    const orderDiff = compareManualOrder(a, b);
    if (orderDiff !== 0) return orderDiff;

    const dueDiff = dueMsByTask.get(a)! - dueMsByTask.get(b)!;
    if (dueDiff !== 0) return dueDiff;

    return compareCreatedThenTitle(a, b);
  });
}

/**
 * Sort approximate window periodic tasks by urgency (`sortScore` descending),
 * then elapsed days descending, then creation order / title.
 */
export function sortWindowTasks(
  tasks: Task[],
  now: Date = new Date(),
  precomputedProgress?: ReadonlyMap<string, WindowProgress | null>
): Task[] {
  const progressById =
    precomputedProgress ?? new Map(tasks.map((t) => [t.id, getWindowProgress(t, now)]));
  return [...tasks].sort((a, b) => {
    const pa = progressById.get(a.id);
    const pb = progressById.get(b.id);
    const scoreA = pa?.sortScore ?? -999;
    const scoreB = pb?.sortScore ?? -999;
    if (scoreA !== scoreB) return scoreB - scoreA;

    const elapsedA = pa?.elapsedDays ?? -1;
    const elapsedB = pb?.elapsedDays ?? -1;
    if (elapsedA !== elapsedB) return elapsedB - elapsedA;

    return compareCreatedThenTitle(a, b);
  });
}

/**
 * Compute a `sortOrder` strictly smaller than every non-deleted task's finite `sortOrder`
 * (or `0` when no task has a `sortOrder` yet), leaving a 1000-unit gap for midpoint reorders.
 */
export function computeTopSortOrder(
  tasks: readonly Pick<Task, 'sortOrder' | 'deletedAt'>[]
): number {
  let minSortOrder = Number.POSITIVE_INFINITY;
  for (const t of tasks) {
    if (!t.deletedAt && typeof t.sortOrder === 'number' && Number.isFinite(t.sortOrder)) {
      if (t.sortOrder < minSortOrder) minSortOrder = t.sortOrder;
    }
  }
  return Number.isFinite(minSortOrder) ? minSortOrder - 1000 : 0;
}

/**
 * Sort undated one-time tasks by user-defined `sortOrder` (ordered precede unordered),
 * then creation order (oldest first), then title A–Z.
 */
export function sortUndatedOneTimeTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const orderDiff = compareManualOrder(a, b);
    if (orderDiff !== 0) return orderDiff;

    return compareCreatedThenTitle(a, b);
  });
}
