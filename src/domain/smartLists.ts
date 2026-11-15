import type { Task } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import {
  addDays,
  formatDate,
  getDaysDifference,
  getDueDatePart,
  getNextUncompletedOccurrenceDate,
  isCompleted,
  isCompletedOnDate,
  isRecurring,
  projectTaskForDate,
  startOfDay,
  taskOccursOnDate,
} from './recurrence';
import { tasksDueOnDate } from './calendar';

export type SmartListId = 'today' | 'tomorrow' | 'next7' | 'inbox';

/**
 * Open (not soft-deleted, not completed one-off) tasks.
 * Recurring tasks are projected onto their next uncompleted occurrence date.
 */
export function openTasks(tasks: Task[], now: Date = new Date()): Task[] {
  const out: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t)) continue;
    if (isRecurring(t)) {
      const nextDate = getNextUncompletedOccurrenceDate(t, now);
      if (!nextDate) continue;
      out.push(projectTaskForDate(t, nextDate));
    } else {
      out.push(t);
    }
  }
  return out;
}

/**
 * Today smart list: overdue + due today (calendar), open only.
 * Recurring tasks due today are included unless completed for today.
 */
export function filterToday(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = formatDate(now);
  const result: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t)) continue;
    if (!isRecurring(t)) {
      if (t.dueAt && getDaysDifference(t.dueAt, now) <= 0) {
        result.push(t);
      }
      continue;
    }
    if (taskOccursOnDate(t, todayStr)) {
      if (!isCompletedOnDate(t, todayStr)) {
        result.push(projectTaskForDate(t, todayStr));
      }
    } else {
      const nextDate = getNextUncompletedOccurrenceDate(t, now);
      if (nextDate && nextDate <= todayStr) {
        result.push(projectTaskForDate(t, nextDate));
      }
    }
  }
  return result;
}

/**
 * Tomorrow smart list: due on the next calendar day.
 */
export function filterTomorrow(tasks: Task[], now: Date = new Date()): Task[] {
  return tasksDueOnDate(tasks, tomorrowDateStr(now));
}

/**
 * Next 7 Days: due from today through +6 days (includes overdue as part of "today" range).
 * Recurring tasks appear on every uncompleted day on which they repeat in the range.
 */
export function filterNext7Days(tasks: Task[], now: Date = new Date()): Task[] {
  const todayStr = formatDate(now);
  const result: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t)) continue;
    if (!isRecurring(t)) {
      if (t.dueAt && getDaysDifference(t.dueAt, now) <= 6) {
        result.push(t);
      }
      continue;
    }
    if (!taskOccursOnDate(t, todayStr)) {
      const nextDate = getNextUncompletedOccurrenceDate(t, now);
      if (nextDate && nextDate < todayStr) {
        result.push(projectTaskForDate(t, nextDate));
      }
    }
    for (let i = 0; i < 7; i++) {
      const dStr = formatDate(addDays(now, i));
      if (taskOccursOnDate(t, dStr) && !isCompletedOnDate(t, dStr)) {
        result.push(projectTaskForDate(t, dStr));
      }
    }
  }
  return result;
}

/**
 * Inbox smart list: open tasks assigned to the built-in Inbox list.
 */
export function filterInbox(tasks: Task[], now: Date = new Date()): Task[] {
  return openTasks(tasks, now).filter((t) => t.listId === INBOX_LIST_ID);
}

/**
 * Tasks in a specific user/system list (open only).
 */
export function filterByListId(tasks: Task[], listId: string, now: Date = new Date()): Task[] {
  return openTasks(tasks, now).filter((t) => t.listId === listId);
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
