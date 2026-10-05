import type { IntervalUnit, RecurrenceRule, RecurrenceType, Task, TaskUrgency } from '../types/task';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

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
 * Format a Date to YYYY-MM-DDTHH:mm in local time (no seconds / timezone).
 */
export function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)}T${hours}:${minutes}`;
}

/** True when dueAt includes a clock time. */
export function hasDueTime(dueAt: string): boolean {
  return dueAt.includes('T');
}

/**
 * Split a dueAt string into date (YYYY-MM-DD) and optional time (HH:mm).
 */
export function splitDueAt(dueAt: string | null | undefined): {
  date: string;
  time: string | null;
} {
  if (!dueAt) return { date: '', time: null };
  if (DATE_ONLY_RE.test(dueAt)) return { date: dueAt, time: null };
  const [datePart, timePart] = dueAt.split('T');
  const time = timePart ? timePart.slice(0, 5) : null;
  return { date: datePart, time };
}

/**
 * Combine date + optional time into a dueAt storage string.
 */
export function combineDueAt(date: string, time: string | null | undefined): string | null {
  if (!date) return null;
  if (time && time.trim()) {
    return `${date}T${time.trim().slice(0, 5)}`;
  }
  return date;
}

/**
 * Parse YYYY-MM-DD into a Date set to midnight local time
 */
export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Parse dueAt (date-only or datetime) into a local Date.
 * Date-only → midnight local. Datetime → that local wall time.
 */
export function parseDueAt(dueAt: string): Date {
  if (DATE_ONLY_RE.test(dueAt)) {
    return parseDate(dueAt);
  }
  if (DATE_TIME_RE.test(dueAt) || dueAt.includes('T')) {
    const { date, time } = splitDueAt(dueAt);
    const [year, month, day] = date.split('-').map(Number);
    const [hours, minutes] = (time || '00:00').split(':').map(Number);
    return new Date(year, month - 1, day, hours, minutes, 0, 0);
  }
  // Fallback: try native parse
  return new Date(dueAt);
}

/**
 * Instant used for "is this overdue right now?" comparisons.
 * - Date-only: end of that local calendar day (23:59:59.999)
 * - Date+time: the exact local instant
 */
export function getDueDeadline(dueAt: string): Date {
  if (hasDueTime(dueAt)) {
    return parseDueAt(dueAt);
  }
  const d = parseDate(dueAt);
  d.setHours(23, 59, 59, 999);
  return d;
}

/**
 * Calendar day (YYYY-MM-DD) of a dueAt value.
 */
export function getDueDatePart(dueAt: string): string {
  return splitDueAt(dueAt).date;
}

/**
 * Add interval to a given date (preserves time-of-day on the Date object)
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
 * Calculate the next due value when a recurring task is completed.
 * Preserves time-of-day when the previous dueAt had a time.
 */
export function calculateNextDueDate(
  task: NextDueInput,
  completionDate: Date = new Date()
): string {
  const { recurrence } = task;
  const preserveTime = !!(task.dueAt && hasDueTime(task.dueAt));
  const priorTime = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;

  const completionDay = new Date(
    completionDate.getFullYear(),
    completionDate.getMonth(),
    completionDate.getDate()
  );

  const formatNext = (d: Date): string => {
    if (preserveTime && priorTime) {
      return `${formatDate(d)}T${priorTime}`;
    }
    return formatDate(d);
  };

  if (recurrence.type === 'after_completion') {
    const nextDate = addInterval(
      completionDay,
      recurrence.intervalValue,
      recurrence.intervalUnit
    );
    return formatNext(nextDate);
  }

  // fixed_interval — advance from prior due (or completion day)
  const dueBase = task.dueAt ? parseDueAt(task.dueAt) : completionDay;
  // Compare on calendar days for catch-up loop
  let nextDue = addInterval(dueBase, recurrence.intervalValue, recurrence.intervalUnit);
  const completionDayEnd = new Date(completionDay);
  completionDayEnd.setHours(23, 59, 59, 999);

  while (nextDue <= completionDayEnd) {
    nextDue = addInterval(nextDue, recurrence.intervalValue, recurrence.intervalUnit);
  }

  return formatNext(nextDue);
}

/**
 * Returns difference in calendar days between dueAt's date and referenceDate.
 * < 0: Overdue by N days (calendar)
 * = 0: Same calendar day
 * > 0: Due in N days
 */
export function getDaysDifference(dueAtStr: string, referenceDate: Date = new Date()): number {
  const target = parseDate(getDueDatePart(dueAtStr)).getTime();
  const ref = new Date(
    referenceDate.getFullYear(),
    referenceDate.getMonth(),
    referenceDate.getDate()
  ).getTime();

  const msPerDay = 1000 * 60 * 60 * 24;
  return Math.round((target - ref) / msPerDay);
}

/**
 * Get urgency category for a task with an optional due date/time.
 * Tasks without dueAt return 'none'.
 * For timed dues on today: overdue if past the clock time.
 */
export function getTaskUrgency(
  dueAtStr: string | null | undefined,
  referenceDate: Date = new Date()
): TaskUrgency {
  if (!dueAtStr) return 'none';

  const deadline = getDueDeadline(dueAtStr);
  if (deadline.getTime() < referenceDate.getTime()) {
    return 'overdue';
  }

  const diff = getDaysDifference(dueAtStr, referenceDate);
  if (diff === 0) return 'due_today';
  if (diff <= 3) return 'upcoming';
  return 'later';
}

/**
 * Human-readable due label (date and optional time).
 */
export function formatDueLabel(dueAt: string | null | undefined): string {
  if (!dueAt) return '';
  const { date, time } = splitDueAt(dueAt);
  if (!time) return date;
  const [hStr, mStr] = time.split(':');
  let h = parseInt(hStr, 10);
  const m = mStr;
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${date} ${h}:${m} ${ampm}`;
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

/** True when a one-off task has been completed. */
export function isCompleted(task: Pick<Task, 'completedAt' | 'recurrence'>): boolean {
  return !task.recurrence && !!task.completedAt;
}

/** Start of local calendar day for a Date. */
export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Add N calendar days to a date (midnight-based). */
export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}
