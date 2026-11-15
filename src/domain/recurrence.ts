import type {
  IntervalUnit,
  RecurrenceRule,
  RecurrenceType,
  Task,
  TaskUrgency,
  Weekday,
} from '../types/task';
import { WEEKDAY_LABELS } from '../types/task';

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;

export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDateTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDate(date)}T${hours}:${minutes}`;
}

export function hasDueTime(dueAt: string): boolean {
  return dueAt.includes('T');
}

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

export function combineDueAt(date: string, time: string | null | undefined): string | null {
  if (!date) return null;
  if (time && time.trim()) {
    return `${date}T${time.trim().slice(0, 5)}`;
  }
  return date;
}

export function parseDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

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
  return new Date(dueAt);
}

export function getDueDeadline(dueAt: string): Date {
  if (hasDueTime(dueAt)) {
    return parseDueAt(dueAt);
  }
  const d = parseDate(dueAt);
  d.setHours(23, 59, 59, 999);
  return d;
}

export function getDueDatePart(dueAt: string): string {
  return splitDueAt(dueAt).date;
}

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
  completionHistory?: number[];
};

function clampMonthDay(year: number, monthIndex: number, day: number): Date {
  // monthIndex 0-based; day requested 1-31
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  return new Date(year, monthIndex, Math.min(day, lastDay));
}

/**
 * Next occurrence on one of the given weekdays, strictly after `fromDay` (midnight).
 * `intervalWeeks` controls how many weeks to skip when wrapping past the last weekday.
 */
export function nextWeekdayAfter(
  fromDay: Date,
  weekdays: Weekday[],
  intervalWeeks: number = 1
): Date {
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b) as Weekday[];
  if (sorted.length === 0) {
    return addDays(fromDay, Math.max(1, intervalWeeks * 7));
  }

  const start = startOfDay(fromDay);
  // Search up to a few cycles ahead
  for (let i = 1; i <= intervalWeeks * 7 + 14; i++) {
    const candidate = addDays(start, i);
    const dow = candidate.getDay() as Weekday;
    if (!sorted.includes(dow)) continue;

    // If intervalWeeks > 1, only accept weekdays in the "active" week of the cycle
    // relative to fromDay's week — simpler: for multi-weekday weekly, every matching
    // day within the pattern; when jumping from last weekday to first, require
    // at least intervalWeeks weeks between same weekday occurrences.
    if (intervalWeeks <= 1) {
      return candidate;
    }

    // For interval > 1: allow any weekday in sorted set, but the calendar week
    // distance from fromDay must be a multiple of intervalWeeks (or first hit
    // in the next allowed week block).
    const daysSince = Math.round(
      (startOfDay(candidate).getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    // Accept if we're still filling the current "on" week (days 1..7 of a cycle
    // that starts the day after fromDay), or later cycles.
    // Practical rule: first matching weekday at least 1 day later; subsequent
    // weeks only every intervalWeeks.
    const weekIndex = Math.floor((daysSince - 1) / 7);
    if (weekIndex % intervalWeeks === 0) {
      return candidate;
    }
  }

  // Fallback
  return addDays(start, intervalWeeks * 7);
}

/**
 * Next monthly occurrence on monthDay, strictly after fromDay.
 */
export function nextMonthDayAfter(
  fromDay: Date,
  monthDay: number,
  intervalMonths: number = 1
): Date {
  const day = Math.max(1, Math.min(31, monthDay));
  let year = fromDay.getFullYear();
  let month = fromDay.getMonth();

  // Try current month first if still ahead
  let candidate = clampMonthDay(year, month, day);
  if (candidate > startOfDay(fromDay)) {
    return candidate;
  }

  // Advance by intervalMonths until after fromDay
  do {
    month += intervalMonths;
    while (month > 11) {
      month -= 12;
      year += 1;
    }
    candidate = clampMonthDay(year, month, day);
  } while (candidate <= startOfDay(fromDay));

  return candidate;
}

function computeRawNextDue(task: NextDueInput, completionDate: Date): Date {
  const { recurrence } = task;
  const completionDay = startOfDay(completionDate);
  const weekdays = recurrence.weekdays?.length ? recurrence.weekdays : undefined;
  const monthDay = recurrence.monthDay;

  // Weekday pattern (typically with weeks unit)
  if (weekdays && weekdays.length > 0) {
    const intervalWeeks =
      recurrence.intervalUnit === 'weeks' ? Math.max(1, recurrence.intervalValue) : 1;

    if (recurrence.type === 'after_completion') {
      return nextWeekdayAfter(completionDay, weekdays, intervalWeeks);
    }

    // fixed_interval: advance from prior due
    const dueBase = task.dueAt ? startOfDay(parseDueAt(task.dueAt)) : completionDay;
    let next = nextWeekdayAfter(dueBase, weekdays, intervalWeeks);
    while (next <= completionDay) {
      next = nextWeekdayAfter(next, weekdays, intervalWeeks);
    }
    return next;
  }

  // Monthly-by-date
  if (monthDay != null && recurrence.intervalUnit === 'months') {
    const intervalMonths = Math.max(1, recurrence.intervalValue);
    if (recurrence.type === 'after_completion') {
      return nextMonthDayAfter(completionDay, monthDay, intervalMonths);
    }
    const dueBase = task.dueAt ? startOfDay(parseDueAt(task.dueAt)) : completionDay;
    let next = nextMonthDayAfter(dueBase, monthDay, intervalMonths);
    // If dueBase was already on monthDay, nextMonthDayAfter goes to next cycle —
    // but if due was before completion on same monthDay path, catch up:
    while (next <= completionDay) {
      next = nextMonthDayAfter(next, monthDay, intervalMonths);
    }
    return next;
  }

  // Default interval advance
  if (recurrence.type === 'after_completion') {
    return addInterval(completionDay, recurrence.intervalValue, recurrence.intervalUnit);
  }

  const dueBase = task.dueAt ? parseDueAt(task.dueAt) : completionDay;
  let nextDue = addInterval(dueBase, recurrence.intervalValue, recurrence.intervalUnit);
  const completionDayEnd = new Date(completionDay);
  completionDayEnd.setHours(23, 59, 59, 999);

  while (nextDue <= completionDayEnd) {
    nextDue = addInterval(nextDue, recurrence.intervalValue, recurrence.intervalUnit);
  }
  return nextDue;
}

/**
 * True when this completion should end the recurrence (no further due dates).
 */
export function willEndRecurrence(
  task: Pick<NextDueInput, 'recurrence' | 'completionHistory'>,
  nextDueDateStr: string,
  completionCountAfter: number
): boolean {
  const rule = task.recurrence;
  if (!rule) return true;

  if (rule.endAfterCount != null && rule.endAfterCount > 0) {
    if (completionCountAfter >= rule.endAfterCount) return true;
  }

  if (rule.endOnDate) {
    const end = parseDate(rule.endOnDate);
    const next = parseDate(getDueDatePart(nextDueDateStr));
    if (next > end) return true;
  }

  return false;
}

/**
 * Whether the recurrence has already ended (no more occurrences should be scheduled).
 */
export function isRecurrenceFinished(
  task: Pick<Task, 'recurrence' | 'completionHistory' | 'dueAt'>
): boolean {
  if (!task.recurrence) return true;
  const rule = task.recurrence;
  if (rule.endAfterCount != null && rule.endAfterCount > 0) {
    if ((task.completionHistory?.length ?? 0) >= rule.endAfterCount) return true;
  }
  if (rule.endOnDate && task.dueAt) {
    const end = parseDate(rule.endOnDate);
    const due = parseDate(getDueDatePart(task.dueAt));
    if (due > end) return true;
  }
  return false;
}

/**
 * Calculate the next due value when a recurring task is completed.
 * Preserves time-of-day when the previous dueAt had a time.
 * Returns null when recurrence should end (caller should finalize as completed).
 */
export function calculateNextDueDate(
  task: NextDueInput,
  completionDate: Date = new Date()
): string | null {
  const preserveTime = !!(task.dueAt && hasDueTime(task.dueAt));
  const priorTime = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;

  const formatNext = (d: Date): string => {
    if (preserveTime && priorTime) {
      return `${formatDate(d)}T${priorTime}`;
    }
    return formatDate(d);
  };

  const nextDate = computeRawNextDue(task, completionDate);
  const nextStr = formatNext(nextDate);
  const completionCountAfter = (task.completionHistory?.length ?? 0) + 1;

  if (willEndRecurrence(task, nextStr, completionCountAfter)) {
    return null;
  }

  return nextStr;
}

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

/** Format an "HH:MM" clock time as 12h ("5:30 PM") or 24h ("17:30"). */
export function formatClockTime(time: string, timeFormat: '12h' | '24h' = '12h'): string {
  const [hStr, mStr = '00'] = time.split(':');
  const h24 = parseInt(hStr, 10);
  if (Number.isNaN(h24)) return time;
  if (timeFormat === '24h') return `${String(h24).padStart(2, '0')}:${mStr}`;
  const ampm = h24 >= 12 ? 'PM' : 'AM';
  const h = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h}:${mStr} ${ampm}`;
}

export function formatDueLabel(dueAt: string | null | undefined, timeFormat: '12h' | '24h' = '12h'): string {
  if (!dueAt) return '';
  const { date, time } = splitDueAt(dueAt);
  if (!time) return date;
  return `${date} ${formatClockTime(time, timeFormat)}`;
}

export function formatRecurrenceLabel(
  recurrenceType: RecurrenceType | RecurrenceRule,
  intervalValue?: number,
  intervalUnit?: IntervalUnit
): string {
  let rule: RecurrenceRule;

  if (typeof recurrenceType === 'object' && recurrenceType !== null) {
    rule = recurrenceType;
  } else {
    rule = {
      type: recurrenceType,
      intervalValue: intervalValue ?? 1,
      intervalUnit: intervalUnit ?? 'days',
    };
  }

  const value = rule.intervalValue;
  const unit = rule.intervalUnit;
  const unitSingular = unit.replace(/s$/, '');
  const unitText = value === 1 ? unitSingular : unit;

  let base: string;
  if (rule.weekdays && rule.weekdays.length > 0) {
    const days = [...rule.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d])
      .join(', ');
    if (rule.type === 'after_completion') {
      base =
        value === 1
          ? `Weekdays ${days} after completion`
          : `Every ${value} weeks on ${days} after completion`;
    } else {
      base = value === 1 ? `Every ${days}` : `Every ${value} weeks on ${days}`;
    }
  } else if (rule.monthDay != null && unit === 'months') {
    const dom = rule.monthDay;
    if (rule.type === 'after_completion') {
      base =
        value === 1
          ? `Monthly on day ${dom} after completion`
          : `Every ${value} months on day ${dom} after completion`;
    } else {
      base = value === 1 ? `Monthly on day ${dom}` : `Every ${value} months on day ${dom}`;
    }
  } else if (rule.type === 'after_completion') {
    base =
      value === 1
        ? `1 ${unitSingular} after completion`
        : `${value} ${unitText} after completion`;
  } else {
    base = value === 1 ? `Every ${unitSingular}` : `Every ${value} ${unitText}`;
  }

  const ends: string[] = [];
  if (rule.endOnDate) ends.push(`until ${rule.endOnDate}`);
  if (rule.endAfterCount) ends.push(`${rule.endAfterCount}x`);
  if (ends.length) return `${base} (${ends.join(', ')})`;
  return base;
}

export function isRecurring(task: Pick<Task, 'recurrence'>): boolean {
  return !!task.recurrence;
}

export function isCompleted(task: Pick<Task, 'completedAt' | 'recurrence'>): boolean {
  return !!task.completedAt;
}

/** Set of YYYY-MM-DD local calendar dates present in `task.completionHistory`. */
export function getCompletedDateSet(task: Pick<Task, 'completionHistory'>): Set<string> {
  const set = new Set<string>();
  for (const ts of task.completionHistory || []) {
    set.add(formatDate(new Date(ts)));
  }
  return set;
}

/**
 * Return the completion timestamp for `task` on `dateStr` (YYYY-MM-DD), or null if not completed on that day.
 */
export function getCompletionTimestampOnDate(
  task: Pick<Task, 'completionHistory' | 'completedAt' | 'recurrence' | 'dueAt'>,
  dateStr: string
): number | null {
  const history = task.completionHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const ts = history[i];
    if (formatDate(new Date(ts)) === dateStr) {
      return ts;
    }
  }
  if (!task.recurrence && task.completedAt) {
    if (
      (task.dueAt && getDueDatePart(task.dueAt) === dateStr) ||
      formatDate(new Date(task.completedAt)) === dateStr
    ) {
      return task.completedAt;
    }
  }
  return null;
}

/** Whether `task` is marked completed for the specific calendar date `dateStr` (YYYY-MM-DD). */
export function isCompletedOnDate(
  task: Pick<Task, 'completionHistory' | 'completedAt' | 'recurrence' | 'dueAt'>,
  dateStr: string
): boolean {
  return getCompletionTimestampOnDate(task, dateStr) !== null;
}

/**
 * Timestamp to record in `completionHistory` when completing an occurrence on `dateStr`.
 * Uses `now` when `dateStr` is today, otherwise local noon on `dateStr` so timezone roundtrips stay on the same day.
 */
export function completionTimestampForDate(dateStr: string, now: number = Date.now()): number {
  if (formatDate(new Date(now)) === dateStr) return now;
  const d = parseDate(dateStr);
  d.setHours(12, 0, 0, 0);
  return d.getTime();
}

function scheduleMatchesDate(
  rule: RecurrenceRule,
  baseStr: string,
  dateStr: string,
  anchorStr: string
): boolean {
  if (dateStr < baseStr) return false;
  const baseDate = parseDate(baseStr);
  const targetDate = parseDate(dateStr);
  const interval = Math.max(1, rule.intervalValue || 1);

  if (rule.weekdays && rule.weekdays.length > 0) {
    const sorted = [...new Set(rule.weekdays)].sort((a, b) => a - b) as Weekday[];
    if (!sorted.includes(targetDate.getDay() as Weekday)) return false;
    const intervalWeeks = rule.intervalUnit === 'weeks' ? interval : 1;
    if (intervalWeeks <= 1) return true;

    let firstMatch: Date | null = null;
    for (let i = 0; i < 7; i++) {
      const candidate = addDays(baseDate, i);
      if (sorted.includes(candidate.getDay() as Weekday)) {
        firstMatch = candidate;
        break;
      }
    }
    if (!firstMatch || targetDate < firstMatch) return false;

    const firstWeek = addDays(firstMatch, -firstMatch.getDay());
    const targetWeek = addDays(targetDate, -targetDate.getDay());
    const weeksDiff = Math.round((targetWeek.getTime() - firstWeek.getTime()) / (7 * 86400000));
    return weeksDiff >= 0 && weeksDiff % intervalWeeks === 0;
  }

  if (rule.intervalUnit === 'days') {
    const daysDiff = Math.round((targetDate.getTime() - baseDate.getTime()) / 86400000);
    return daysDiff >= 0 && daysDiff % interval === 0;
  }

  if (rule.intervalUnit === 'weeks') {
    const daysDiff = Math.round((targetDate.getTime() - baseDate.getTime()) / 86400000);
    return daysDiff >= 0 && daysDiff % (interval * 7) === 0;
  }

  if (rule.intervalUnit === 'months') {
    if (dateStr === anchorStr) return true;
    const desiredDay =
      rule.monthDay != null ? Math.max(1, Math.min(31, rule.monthDay)) : baseDate.getDate();
    const expectedInTarget = clampMonthDay(
      targetDate.getFullYear(),
      targetDate.getMonth(),
      desiredDay
    );
    if (targetDate.getDate() !== expectedInTarget.getDate()) return false;
    const candidateInBaseMonth = clampMonthDay(
      baseDate.getFullYear(),
      baseDate.getMonth(),
      desiredDay
    );
    const firstCycleDate =
      candidateInBaseMonth >= baseDate
        ? candidateInBaseMonth
        : nextMonthDayAfter(baseDate, desiredDay, 1);
    if (targetDate < firstCycleDate) return false;
    const monthsDiff =
      (targetDate.getFullYear() - firstCycleDate.getFullYear()) * 12 +
      (targetDate.getMonth() - firstCycleDate.getMonth());
    return monthsDiff >= 0 && monthsDiff % interval === 0;
  }

  return false;
}

/**
 * Whether `task` occurs on the local calendar date `dateStr` (YYYY-MM-DD).
 * Returns true for every scheduled repeat day as well as any day already in `completionHistory`.
 */
export function taskOccursOnDate(
  task: Pick<Task, 'dueAt' | 'recurrence' | 'completionHistory' | 'createdAt' | 'deletedAt'>,
  dateStr: string
): boolean {
  if (task.deletedAt) return false;
  if (!task.recurrence) {
    return !!task.dueAt && getDueDatePart(task.dueAt) === dateStr;
  }

  const rule = task.recurrence;
  const completedDates = getCompletedDateSet(task);
  if (completedDates.has(dateStr)) return true;

  if (rule.endOnDate && dateStr > rule.endOnDate) return false;
  if (rule.endAfterCount != null && rule.endAfterCount > 0 && completedDates.size >= rule.endAfterCount) {
    return false;
  }

  const anchorStr = task.dueAt
    ? getDueDatePart(task.dueAt)
    : formatDate(new Date(task.createdAt));
  if (dateStr < anchorStr) return false;

  let baseStr = anchorStr;
  if (rule.type === 'after_completion') {
    let latestComp: string | null = null;
    for (const c of completedDates) {
      if (c >= anchorStr && c < dateStr && (!latestComp || c > latestComp)) {
        latestComp = c;
      }
    }
    if (latestComp) {
      const nextAfterComp = formatDate(
        computeRawNextDue({ recurrence: rule, dueAt: latestComp }, parseDate(latestComp))
      );
      if (dateStr < nextAfterComp) return false;
      baseStr = nextAfterComp;
    }
  }

  if (!scheduleMatchesDate(rule, baseStr, dateStr, anchorStr)) return false;

  if (rule.endAfterCount != null && rule.endAfterCount > 0) {
    const targetDate = parseDate(dateStr);
    let uncompletedCount = 0;
    let cursor = parseDate(baseStr);
    while (cursor <= targetDate) {
      const dStr = formatDate(cursor);
      if (!completedDates.has(dStr) && scheduleMatchesDate(rule, baseStr, dStr, anchorStr)) {
        uncompletedCount++;
        if (completedDates.size + uncompletedCount > rule.endAfterCount) {
          return false;
        }
      }
      cursor = addDays(cursor, 1);
    }
  }

  return true;
}

/**
 * Project a task onto a specific calendar date `dateStr` (YYYY-MM-DD), preserving any due time
 * and setting `completedAt` based on whether that particular day was completed.
 */
export function projectTaskForDate(task: Task, dateStr: string): Task {
  const time = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;
  const projectedDueAt = combineDueAt(dateStr, time);
  if (task.recurrence) {
    const compTs = getCompletionTimestampOnDate(task, dateStr);
    return {
      ...task,
      dueAt: projectedDueAt,
      completedAt: compTs,
    };
  }
  return task.dueAt === projectedDueAt ? task : { ...task, dueAt: projectedDueAt };
}

/**
 * Find the next (or currently overdue) uncompleted occurrence date (YYYY-MM-DD) for `task`,
 * relative to `fromDate`. Returns null if the task is completed or its recurrence has ended.
 */
export function getNextUncompletedOccurrenceDate(
  task: Task,
  fromDate: Date = new Date()
): string | null {
  if (task.deletedAt) return null;
  if (!task.recurrence) {
    if (isCompleted(task) || !task.dueAt) return null;
    return getDueDatePart(task.dueAt);
  }

  const today = startOfDay(fromDate);
  const todayStr = formatDate(today);

  if (taskOccursOnDate(task, todayStr) && !isCompletedOnDate(task, todayStr)) {
    return todayStr;
  }

  const anchorStr = task.dueAt
    ? getDueDatePart(task.dueAt)
    : formatDate(new Date(task.createdAt));
  const completedDates = getCompletedDateSet(task);

  if (!isCompletedOnDate(task, todayStr) && anchorStr < todayStr) {
    const anchorDate = parseDate(anchorStr);
    const minLookback = addDays(today, -365);
    const earliest = anchorDate > minLookback ? anchorDate : minLookback;
    for (let cursor = addDays(today, -1); cursor >= earliest; cursor = addDays(cursor, -1)) {
      const dStr = formatDate(cursor);
      if (completedDates.has(dStr)) break;
      if (taskOccursOnDate(task, dStr) && !isCompletedOnDate(task, dStr)) {
        return dStr;
      }
    }
  }

  const startForward = anchorStr > todayStr ? parseDate(anchorStr) : addDays(today, 1);
  for (let i = 0; i <= 1100; i++) {
    const dStr = formatDate(addDays(startForward, i));
    if (task.recurrence.endOnDate && dStr > task.recurrence.endOnDate) break;
    if (taskOccursOnDate(task, dStr) && !isCompletedOnDate(task, dStr)) {
      return dStr;
    }
  }

  return null;
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Subtask progress helper. */
export function subtaskProgress(subtasks: { completed: boolean }[] | undefined): {
  done: number;
  total: number;
} {
  const list = subtasks || [];
  return {
    done: list.filter((s) => s.completed).length,
    total: list.length,
  };
}
