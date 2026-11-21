import type { Task } from '../types/task';
import { getDueDeadline, getWindowProgress } from './recurrence';

/**
 * Sort for daily-driver views:
 * 1. Manual sortOrder (when reordered; ordered items precede newly added ones)
 * 2. Earlier due deadline first
 * 3. Creation order (oldest / first-added first)
 * 4. Title A–Z
 */
export function sortTasksForDailyView(tasks: Task[], _now: Date = new Date()): Task[] {
  return [...tasks].sort((a, b) => {
    const hasOrderA = a.sortOrder != null;
    const hasOrderB = b.sortOrder != null;
    if (hasOrderA && hasOrderB) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder! - b.sortOrder!;
    } else if (hasOrderA !== hasOrderB) {
      return hasOrderA ? -1 : 1;
    }

    const dueA = a.dueAt ? getDueDeadline(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.dueAt ? getDueDeadline(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;

    const createdA = a.createdAt ?? 0;
    const createdB = b.createdAt ?? 0;
    if (createdA !== createdB) return createdA - createdB;

    return a.title.localeCompare(b.title);
  });
}

/**
 * Sort approximate window periodic tasks by urgency (`sortScore` descending),
 * then elapsed days descending, then creation order / title.
 */
export function sortWindowTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const progressById = new Map(tasks.map((t) => [t.id, getWindowProgress(t, now)]));
  return [...tasks].sort((a, b) => {
    const pa = progressById.get(a.id);
    const pb = progressById.get(b.id);
    const scoreA = pa?.sortScore ?? -999;
    const scoreB = pb?.sortScore ?? -999;
    if (scoreA !== scoreB) return scoreB - scoreA;

    const elapsedA = pa?.elapsedDays ?? -1;
    const elapsedB = pb?.elapsedDays ?? -1;
    if (elapsedA !== elapsedB) return elapsedB - elapsedA;

    const createdA = a.createdAt ?? 0;
    const createdB = b.createdAt ?? 0;
    if (createdA !== createdB) return createdA - createdB;

    return a.title.localeCompare(b.title);
  });
}

/**
 * Sort undated one-time tasks by user-defined `sortOrder` (ordered precede unordered),
 * then creation order (oldest first), then title A–Z.
 */
export function sortUndatedOneTimeTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const hasOrderA = a.sortOrder != null;
    const hasOrderB = b.sortOrder != null;
    if (hasOrderA && hasOrderB) {
      if (a.sortOrder !== b.sortOrder) return a.sortOrder! - b.sortOrder!;
    } else if (hasOrderA !== hasOrderB) {
      return hasOrderA ? -1 : 1;
    }

    const createdA = a.createdAt ?? 0;
    const createdB = b.createdAt ?? 0;
    if (createdA !== createdB) return createdA - createdB;

    return a.title.localeCompare(b.title);
  });
}
