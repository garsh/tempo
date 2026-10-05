import type { IntervalUnit, RecurrenceRule, RecurrenceType, Task, TaskUrgency } from '../types/task';

/**
 * Format a Date to YYYY-MM-DD in local time
 */
export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Parse YYYY-MM-DD into a Date set to midnight local time
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Add interval to a given date
 */
export function addInterval(baseDate: Date, value: number, unit: IntervalUnit): Date {
  const result = new Date(baseDate);
  if (unit === 'days') {
    result.setDate(result.getDate() + value);
  } else if (unit === 'weeks') {
    result.setDate(result.getDate() + value * 7);
  } else if (unit === 'months') {
    result.setMonth(result.getMonth() + value);
  }
  return result;
}

export type NextDueInput = {
  recurrence: RecurrenceRule;
  dueAt?: string | null;
};

/**
 * Calculate the next due date when a recurring task is completed.
 *
 * - 'after_completion': next due = completion + interval
 * - 'fixed_interval': cadence locked to schedule; catches up if heavily overdue
 */
export function calculateNextDueDate(
  task: NextDueInput,
  completionDate: Date = new Date()
): string {
  const { recurrence } = task;
  const normalizedCompletionDate = new Date(
    completionDate.getFullYear(),
    completionDate.getMonth(),
    completionDate.getDate()
  );

  if (recurrence.type === 'after_completion') {
    const nextDate = addInterval(
      normalizedCompletionDate,
      recurrence.intervalValue,
      recurrence.intervalUnit
    );
    return formatDate(nextDate);
  }

  // fixed_interval — fall back to completion date if no dueAt set
  const dueBase = task.dueAt ? parseDate(task.dueAt) : normalizedCompletionDate;
  let nextDue = addInterval(dueBase, recurrence.intervalValue, recurrence.intervalUnit);

  while (nextDue <= normalizedCompletionDate) {
    nextDue = addInterval(nextDue, recurrence.intervalValue, recurrence.intervalUnit);
  }

  return formatDate(nextDue);
}

/**
 * Returns difference in days between dueDate and referenceDate (today).
 * < 0: Overdue by N days
 * = 0: Due today
 * > 0: Due in N days
 */
export function getDaysDifference(dueDateStr: string, referenceDate: Date = new Date()): number {
  const target = parseDate(dueDateStr).getTime();
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target - ref) / msPerDay);
}

/**
 * Get urgency category for a task with an optional due date.
 * Tasks without dueAt return 'none'.
 */
export function getTaskUrgency(
  dueDateStr: string | null | undefined,
  referenceDate: Date = new Date()
): TaskUrgency {
  if (!dueDateStr) return 'none';
  const diff = getDaysDifference(dueDateStr, referenceDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= 3) return 'upcoming';
  return 'later';
}

/**
 * Human-readable recurrence label from a RecurrenceRule
 */
export function formatRecurrenceLabel(
  recurrenceType: RecurrenceType | RecurrenceRule,
  intervalValue?: number,
  intervalUnit?: IntervalUnit
): string {
  let type: RecurrenceType;
  let value: number;
  let unit: IntervalUnit;

  if (typeof recurrenceType === 'object' && recurrenceType !== null) {
    type = recurrenceType.type;
    value = recurrenceType.intervalValue;
    unit = recurrenceType.intervalUnit;
  } else {
    type = recurrenceType;
    value = intervalValue ?? 1;
    unit = intervalUnit ?? 'days';
  }

  const unitSingular = unit.replace(/s$/, '');
  const unitText = value === 1 ? unitSingular : unit;

  if (type === 'after_completion') {
    return value === 1
      ? `1 ${unitSingular} after completion`
      : `${value} ${unitText} after completion`;
  }

  return value === 1 ? `Every ${unitSingular}` : `Every ${value} ${unitText}`;
}

/** True when the task has an active recurrence rule. */
export function isRecurring(task: Pick<Task, 'recurrence'>): boolean {
  return !!task.recurrence;
}

/** True when a one-off task has been completed (or a recurring one marked done this cycle — we use completedAt only for one-offs). */
export function isCompleted(task: Pick<Task, 'completedAt' | 'recurrence'>): boolean {
  return !task.recurrence && !!task.completedAt;
}
