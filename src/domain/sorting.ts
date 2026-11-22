import type { Task } from '../types/task';
import {
  getDaysDifference,
  getDueDeadline,
  getFixedIntervalCycleDays,
  getWindowProgress,
  type WindowProgress,
} from './recurrence';

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

export type RecurringSortEntry =
  | {
      kind: 'window';
      raw: Task;
      progress: WindowProgress;
      subtitle: string;
    }
  | {
      kind: 'fixed';
      raw: Task;
      projected: Task;
      nextDate: string | null;
      subtitle: string;
    };

interface RecurringSortKey {
  tier: number;
  primary: number;
  secondary: number;
  tertiary: number;
}

function getRecurringSortKey(entry: RecurringSortEntry, now: Date): RecurringSortKey {
  if (entry.kind === 'window') {
    const { progress } = entry;
    switch (progress.stage) {
      case 'at_or_past_max':
        if ((progress.daysUntilMax ?? 0) < 0) {
          return {
            tier: 0,
            primary: -progress.sortScore,
            secondary: progress.daysUntilMax ?? 0,
            tertiary: 0,
          };
        }
        return { tier: 1, primary: 0, secondary: 0, tertiary: 0 };
      case 'in_window':
        return {
          tier: 2,
          primary: -progress.sortScore,
          secondary: -(progress.elapsedDays ?? -1),
          tertiary: 0,
        };
      case 'not_done_yet':
        return { tier: 3, primary: 0, secondary: 0, tertiary: 0 };
      case 'before_min':
        return {
          tier: 4,
          primary: progress.daysUntilOpen ?? Number.POSITIVE_INFINITY,
          secondary: progress.daysUntilMax ?? Number.POSITIVE_INFINITY,
          tertiary: 1,
        };
      case 'stopped':
      default:
        return { tier: 5, primary: Number.POSITIVE_INFINITY, secondary: 0, tertiary: 0 };
    }
  }

  const daysUntilDue = entry.nextDate ? getDaysDifference(entry.nextDate, now) : null;
  if (daysUntilDue == null) {
    return { tier: 5, primary: Number.POSITIVE_INFINITY, secondary: 0, tertiary: 0 };
  }
  if (daysUntilDue < 0) {
    const overdueDays = -daysUntilDue;
    const cycleDays = entry.raw.recurrence ? getFixedIntervalCycleDays(entry.raw.recurrence) : 1;
    const score = 1.01 + overdueDays / cycleDays;
    return { tier: 0, primary: -score, secondary: daysUntilDue, tertiary: 0 };
  }
  if (daysUntilDue === 0) {
    return { tier: 1, primary: 0, secondary: 0, tertiary: 0 };
  }
  return {
    tier: 4,
    primary: daysUntilDue,
    secondary: daysUntilDue,
    tertiary: 0,
  };
}

/**
 * Sort all recurring tasks (window, annual window, and fixed interval) by closeness to due:
 * 1. Overdue (relative urgency descending, then more overdue days first)
 * 2. Due today / last day of window
 * 3. In window (relative progress sortScore descending)
 * 4. Not done yet (bottom of Due Now, above Upcoming)
 * 5. Upcoming (absolute days until open/due ascending, then tighter max deadline)
 * 6. Undated/fallback entries last
 */
export function sortRecurringByDueProximity(
  entries: readonly RecurringSortEntry[],
  now: Date = new Date()
): RecurringSortEntry[] {
  const keys = new Map<RecurringSortEntry, RecurringSortKey>();
  for (const entry of entries) {
    keys.set(entry, getRecurringSortKey(entry, now));
  }
  return [...entries].sort((a, b) => {
    const ka = keys.get(a)!;
    const kb = keys.get(b)!;
    if (ka.tier !== kb.tier) return ka.tier - kb.tier;
    if (ka.primary !== kb.primary) return ka.primary - kb.primary;
    if (ka.secondary !== kb.secondary) return ka.secondary - kb.secondary;
    if (ka.tertiary !== kb.tertiary) return ka.tertiary - kb.tertiary;
    return compareCreatedThenTitle(a.raw, b.raw);
  });
}
