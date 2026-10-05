import type { Task } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import {
  addDays,
  getDaysDifference,
  getDueDatePart,
  isCompleted,
  startOfDay,
} from './recurrence';

export type SmartListId = 'today' | 'tomorrow' | 'next7' | 'inbox';

/**
 * Open (not soft-deleted, not completed one-off) tasks.
 */
export function openTasks(tasks: Task[]): Task[] {
  return tasks.filter((t) => !t.deletedAt && !isCompleted(t));
}

/**
 * Today smart list: overdue + due today (calendar), open only.
 * Matches common TickTick "Today" behavior so nothing slips past.
 */
export function filterToday(tasks: Task[], now: Date = new Date()): Task[] {
  return openTasks(tasks).filter((t) => {
    if (!t.dueAt) return false;
    const diff = getDaysDifference(t.dueAt, now);
    return diff <= 0;
  });
}

/**
 * Tomorrow smart list: due on the next calendar day.
 */
export function filterTomorrow(tasks: Task[], now: Date = new Date()): Task[] {
  return openTasks(tasks).filter((t) => {
    if (!t.dueAt) return false;
    return getDaysDifference(t.dueAt, now) === 1;
  });
}

/**
 * Next 7 Days: due from today through +6 days (includes overdue as part of "today" range).
 * Overdue items are included so the week view still surfaces them.
 */
export function filterNext7Days(tasks: Task[], now: Date = new Date()): Task[] {
  return openTasks(tasks).filter((t) => {
    if (!t.dueAt) return false;
    const diff = getDaysDifference(t.dueAt, now);
    return diff <= 6;
  });
}

/**
 * Inbox smart list: open tasks assigned to the built-in Inbox list.
 */
export function filterInbox(tasks: Task[]): Task[] {
  return openTasks(tasks).filter((t) => t.listId === INBOX_LIST_ID);
}

/**
 * Tasks in a specific user/system list (open only).
 */
export function filterByListId(tasks: Task[], listId: string): Task[] {
  return openTasks(tasks).filter((t) => t.listId === listId);
}

/**
 * Whether a dueAt falls on a given local calendar day (YYYY-MM-DD).
 */
export function isDueOnDate(dueAt: string | null | undefined, dateStr: string): boolean {
  if (!dueAt) return false;
  return getDueDatePart(dueAt) === dateStr;
}

/**
 * Labels / helpers for UI.
 */
export function smartListLabel(id: SmartListId): string {
  switch (id) {
    case 'today':
      return 'Today';
    case 'tomorrow':
      return 'Tomorrow';
    case 'next7':
      return 'Next 7 Days';
    case 'inbox':
      return 'Inbox';
  }
}

export function todayDateStr(now: Date = new Date()): string {
  const d = startOfDay(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function tomorrowDateStr(now: Date = new Date()): string {
  const d = addDays(now, 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
