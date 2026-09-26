import type { IntervalUnit, PeriodicTask, RecurrenceType, TaskUrgency } from '../types/task';

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

/**
 * Calculate the next due date when a task is completed.
 *
 * - 'after_completion': The next due date is calculated strictly relative to the completion date.
 * - 'fixed_interval': The cadence remains locked to the schedule. If completed, advances from the existing due date.
 *                     If heavily overdue, catches up to the earliest future or today's date.
 */
export function calculateNextDueDate(
  task: Pick<PeriodicTask, 'recurrenceType' | 'intervalValue' | 'intervalUnit' | 'dueDate'>,
  completionDate: Date = new Date()
): string {
  const normalizedCompletionDate = new Date(
    completionDate.getFullYear(),
    completionDate.getMonth(),
    completionDate.getDate()
  );

  if (task.recurrenceType === 'after_completion') {
    const nextDate = addInterval(normalizedCompletionDate, task.intervalValue, task.intervalUnit);
    return formatDate(nextDate);
  }

  // fixed_interval
  let currentDue = parseDate(task.dueDate);
  let nextDue = addInterval(currentDue, task.intervalValue, task.intervalUnit);

  // If the task was very overdue and nextDue is still before or equal to completionDate,
  // advance until it lands in the future relative to completion.
  while (nextDue <= normalizedCompletionDate) {
    nextDue = addInterval(nextDue, task.intervalValue, task.intervalUnit);
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
 * Get urgency category for a task
 */
export function getTaskUrgency(dueDateStr: string, referenceDate: Date = new Date()): TaskUrgency {
  const diff = getDaysDifference(dueDateStr, referenceDate);
  if (diff < 0) return 'overdue';
  if (diff === 0) return 'due_today';
  if (diff <= 3) return 'upcoming';
  return 'later';
}

/**
 * Human-readable recurrence label
 */
export function formatRecurrenceLabel(
  recurrenceType: RecurrenceType,
  intervalValue: number,
  intervalUnit: IntervalUnit
): string {
  const unitSingular = intervalUnit.replace(/s$/, '');
  const unitText = intervalValue === 1 ? unitSingular : intervalUnit;

  if (recurrenceType === 'after_completion') {
    return intervalValue === 1
      ? `1 ${unitSingular} after completion`
      : `${intervalValue} ${unitText} after completion`;
  }

  // fixed_interval
  return intervalValue === 1 ? `Every ${unitSingular}` : `Every ${intervalValue} ${unitText}`;
}
