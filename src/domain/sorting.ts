import type { Task, TaskPriority } from '../types/task';
import { PRIORITY_ORDER } from '../types/task';
import { getDueDeadline, getTaskUrgency } from './recurrence';

const URGENCY_ORDER: Record<string, number> = {
  overdue: 0,
  due_today: 1,
  upcoming: 2,
  later: 3,
  none: 4,
};

function priorityRank(p?: TaskPriority | null): number {
  return PRIORITY_ORDER[p ?? 'none'] ?? PRIORITY_ORDER.none;
}

/**
 * Sort for daily-driver views:
 * 1. Pinned first
 * 2. Urgency (overdue → today → upcoming → later → none)
 * 3. Priority (high → medium → low → none)
 * 4. Earlier due deadline first
 * 5. Title A–Z
 */
export function sortTasksForDailyView(tasks: Task[], now: Date = new Date()): Task[] {
  return [...tasks].sort((a, b) => {
    const pinA = a.pinned ? 0 : 1;
    const pinB = b.pinned ? 0 : 1;
    if (pinA !== pinB) return pinA - pinB;

    const urgA = URGENCY_ORDER[getTaskUrgency(a.dueAt, now)] ?? 4;
    const urgB = URGENCY_ORDER[getTaskUrgency(b.dueAt, now)] ?? 4;
    if (urgA !== urgB) return urgA - urgB;

    const priA = priorityRank(a.priority);
    const priB = priorityRank(b.priority);
    if (priA !== priB) return priA - priB;

    const dueA = a.dueAt ? getDueDeadline(a.dueAt).getTime() : Number.POSITIVE_INFINITY;
    const dueB = b.dueAt ? getDueDeadline(b.dueAt).getTime() : Number.POSITIVE_INFINITY;
    if (dueA !== dueB) return dueA - dueB;

    return a.title.localeCompare(b.title);
  });
}

/**
 * Filter by search query (title, notes, tags) — case-insensitive.
 */
export function matchesSearch(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.notes?.toLowerCase().includes(q)) return true;
  if (task.tags?.some((tag) => tag.toLowerCase().includes(q))) return true;
  return false;
}

/**
 * Filter by tag pill (exact match on a tag).
 */
export function matchesTag(task: Task, tag: string | null): boolean {
  if (!tag) return true;
  return !!task.tags?.includes(tag);
}
