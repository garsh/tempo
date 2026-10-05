import type { Task } from '../types/task';
import { getDueDeadline, isCompleted } from './recurrence';

export interface TempoStats {
  openCount: number;
  overdueCount: number;
  dueTodayCount: number;
  completedThisWeek: number;
  /** Consecutive calendar days (ending today or yesterday) with ≥1 completion. */
  completionStreakDays: number;
}

function startOfLocalDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dayKey(ts: number): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Lightweight personal stats — useful at a glance, not a dashboard product.
 */
export function computeTempoStats(tasks: Task[], now = new Date()): TempoStats {
  const active = tasks.filter((t) => !t.deletedAt);
  const open = active.filter((t) => !isCompleted(t));

  const todayStart = startOfLocalDay(now);
  const todayEnd = new Date(todayStart);
  todayEnd.setHours(23, 59, 59, 999);

  const weekStart = new Date(todayStart);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // Sunday-start week (US)

  let overdueCount = 0;
  let dueTodayCount = 0;
  for (const t of open) {
    if (!t.dueAt) continue;
    const deadline = getDueDeadline(t.dueAt);
    if (deadline.getTime() < todayStart.getTime()) overdueCount += 1;
    else if (deadline.getTime() <= todayEnd.getTime()) dueTodayCount += 1;
  }

  const completionDays = new Set<string>();
  let completedThisWeek = 0;
  for (const t of active) {
    for (const ts of t.completionHistory || []) {
      if (ts >= weekStart.getTime()) completedThisWeek += 1;
      completionDays.add(dayKey(ts));
    }
    if (t.completedAt && !(t.completionHistory || []).includes(t.completedAt)) {
      if (t.completedAt >= weekStart.getTime()) completedThisWeek += 1;
      completionDays.add(dayKey(t.completedAt));
    }
  }

  // Streak: walk back from today; allow starting from yesterday if today empty
  let streak = 0;
  const cursor = startOfLocalDay(now);
  const todayKey = dayKey(cursor.getTime());
  if (!completionDays.has(todayKey)) {
    cursor.setDate(cursor.getDate() - 1);
  }
  while (completionDays.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return {
    openCount: open.length,
    overdueCount,
    dueTodayCount,
    completedThisWeek,
    completionStreakDays: streak,
  };
}
