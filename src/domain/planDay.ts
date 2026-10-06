import type { Task } from '../types/task';
import { formatDate, getDaysDifference, splitDueAt } from './recurrence';
import { openTasks } from './smartLists';
import { sortTasksForDailyView } from './sorting';

export interface PlanDaySuggestions {
  /** Open tasks due before today. */
  overdue: Task[];
  /** Open tasks due in the next `upcomingDays` days (not today). */
  upcoming: Task[];
  /** Open tasks with no due date (most recently created first). */
  noDate: Task[];
}

/**
 * Candidates for the Today "lightbulb" (plan your day) sheet:
 * things the user may want to pull into Today with one tap.
 */
export function planDaySuggestions(
  tasks: Task[],
  now: Date = new Date(),
  opts: { upcomingDays?: number; noDateLimit?: number } = {}
): PlanDaySuggestions {
  const upcomingDays = opts.upcomingDays ?? 7;
  const noDateLimit = opts.noDateLimit ?? 5;
  const open = openTasks(tasks);

  const overdue: Task[] = [];
  const upcoming: Task[] = [];
  const noDate: Task[] = [];
  for (const t of open) {
    if (!t.dueAt) {
      noDate.push(t);
      continue;
    }
    const diff = getDaysDifference(t.dueAt, now);
    if (diff < 0) overdue.push(t);
    else if (diff >= 1 && diff <= upcomingDays) upcoming.push(t);
  }

  return {
    overdue: sortTasksForDailyView(overdue, now),
    upcoming: sortTasksForDailyView(upcoming, now),
    noDate: noDate.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)).slice(0, noDateLimit),
  };
}

/** New dueAt that lands on `now`'s date, keeping any existing time of day. */
export function dueAtMovedToToday(dueAt: string | null | undefined, now: Date = new Date()): string {
  const today = formatDate(now);
  const { time } = splitDueAt(dueAt);
  return time ? `${today}T${time}` : today;
}
