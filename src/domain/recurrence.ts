import type {
  AnnualWindow,
  IntervalUnit,
  RecurrenceRule,
  RecurrenceScheduleSegment,
  RecurrenceType,
  Task,
  TaskUrgency,
  Weekday,
} from '../types/task';
import { WEEKDAY_LABELS } from '../types/task';

export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface SeasonPreset {
  id: SeasonId;
  label: string;
  window: AnnualWindow;
}

export const ANNUAL_MONTH_SHORT = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

export const ANNUAL_MONTH_LONG = [
  '',
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const MAX_DAYS_IN_ANNUAL_MONTH = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

export function daysInAnnualMonth(month: number): number {
  const m = Math.min(12, Math.max(1, Math.floor(month || 1)));
  return MAX_DAYS_IN_ANNUAL_MONTH[m];
}

export function sanitizeAnnualWindow(w: AnnualWindow): AnnualWindow {
  const startMonth = Math.min(12, Math.max(1, Math.floor(w.startMonth || 1)));
  const endMonth = Math.min(12, Math.max(1, Math.floor(w.endMonth || 1)));
  const startDay = Math.min(daysInAnnualMonth(startMonth), Math.max(1, Math.floor(w.startDay || 1)));
  const endDay = Math.min(daysInAnnualMonth(endMonth), Math.max(1, Math.floor(w.endDay || 1)));
  return { startMonth, startDay, endMonth, endDay };
}

export function isYearWrapAnnualWindow(w: AnnualWindow): boolean {
  const s = sanitizeAnnualWindow(w);
  return s.startMonth > s.endMonth || (s.startMonth === s.endMonth && s.startDay > s.endDay);
}

export function annualWindowsEqual(a: AnnualWindow, b: AnnualWindow): boolean {
  const sa = sanitizeAnnualWindow(a);
  const sb = sanitizeAnnualWindow(b);
  return (
    sa.startMonth === sb.startMonth &&
    sa.startDay === sb.startDay &&
    sa.endMonth === sb.endMonth &&
    sa.endDay === sb.endDay
  );
}

export function getSeasonPresets(hemisphere: 'north' | 'south' = 'north'): SeasonPreset[] {
  if (hemisphere === 'south') {
    return [
      { id: 'spring', label: 'Spring', window: { startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 } },
      { id: 'summer', label: 'Summer', window: { startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 } },
      { id: 'autumn', label: 'Autumn', window: { startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 } },
      { id: 'winter', label: 'Winter', window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 } },
    ];
  }
  return [
    { id: 'spring', label: 'Spring', window: { startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 } },
    { id: 'summer', label: 'Summer', window: { startMonth: 6, startDay: 1, endMonth: 8, endDay: 31 } },
    { id: 'autumn', label: 'Fall', window: { startMonth: 9, startDay: 1, endMonth: 11, endDay: 30 } },
    { id: 'winter', label: 'Winter', window: { startMonth: 12, startDay: 1, endMonth: 2, endDay: 29 } },
  ];
}

export function formatAnnualWindowRange(w: AnnualWindow): string {
  const s = sanitizeAnnualWindow(w);
  const isFullStart = s.startDay === 1;
  const isFullEnd = s.endDay >= (s.endMonth === 2 ? 28 : daysInAnnualMonth(s.endMonth));
  if (s.startMonth === s.endMonth && isFullStart && isFullEnd) {
    return ANNUAL_MONTH_LONG[s.startMonth];
  }
  if (isFullStart && isFullEnd) {
    return `${ANNUAL_MONTH_SHORT[s.startMonth]}–${ANNUAL_MONTH_SHORT[s.endMonth]}`;
  }
  if (s.startMonth === s.endMonth && s.startDay === s.endDay) {
    return `${ANNUAL_MONTH_SHORT[s.startMonth]} ${s.startDay}`;
  }
  return `${ANNUAL_MONTH_SHORT[s.startMonth]} ${s.startDay} – ${ANNUAL_MONTH_SHORT[s.endMonth]} ${s.endDay}`;
}

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
    return result;
  }
  if (unit === 'weeks') {
    result.setDate(result.getDate() + value * 7);
    return result;
  }
  if (unit === 'months') {
    const clamped = clampMonthDay(baseDate.getFullYear(), baseDate.getMonth() + value, baseDate.getDate());
    clamped.setHours(
      baseDate.getHours(),
      baseDate.getMinutes(),
      baseDate.getSeconds(),
      baseDate.getMilliseconds()
    );
    return clamped;
  }
  if (unit === 'years') {
    const clamped = clampMonthDay(baseDate.getFullYear() + value, baseDate.getMonth(), baseDate.getDate());
    clamped.setHours(
      baseDate.getHours(),
      baseDate.getMinutes(),
      baseDate.getSeconds(),
      baseDate.getMilliseconds()
    );
    return clamped;
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
  task: Pick<Task, 'recurrence' | 'completionHistory' | 'dueAt'> &
    Partial<
      Pick<
        Task,
        'completedAt' | 'startDate' | 'createdAt' | 'deletedAt' | 'skippedDates' | 'rescheduledDates' | 'scheduleHistory'
      >
    >,
  referenceDate: Date = new Date()
): boolean {
  if (!task.recurrence) return true;
  if (isWindowPeriodic(task)) {
    return isWindowStopped(task, referenceDate);
  }
  const rule = task.recurrence;
  if (rule.endAfterCount != null && rule.endAfterCount > 0) {
    if ((task.completionHistory?.length ?? 0) >= rule.endAfterCount) return true;
  }
  const effectiveEnd = getEffectiveEndOnDate(task);
  if (effectiveEnd) {
    if (task.dueAt) {
      const end = parseDate(effectiveEnd);
      const due = parseDate(getDueDatePart(task.dueAt));
      if (due > end) return true;
    }
    const synthetic: Task = {
      id: '',
      title: '',
      listId: 'inbox',
      createdAt: task.createdAt ?? 0,
      updatedAt: 0,
      completionHistory: task.completionHistory ?? [],
      recurrence: task.recurrence,
      dueAt: task.dueAt ?? null,
      startDate: task.startDate ?? null,
      completedAt: task.completedAt ?? null,
      deletedAt: task.deletedAt ?? null,
      skippedDates: task.skippedDates,
      rescheduledDates: task.rescheduledDates,
      scheduleHistory: task.scheduleHistory,
    };
    if (getNextUncompletedOccurrenceDate(synthetic, referenceDate) === null) {
      return true;
    }
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

  if (isAnnualWindow({ recurrence: rule })) {
    const ranges = rule.annualWindows!.map(formatAnnualWindowRange).join(', ');
    const base = `Every ${ranges}`;
    return rule.endOnDate ? `${base} (until ${rule.endOnDate})` : base;
  }

  if (isWindowPeriodic({ recurrence: rule })) {
    const { min, max } = getWindowBounds(rule);
    const base =
      min === max
        ? min === 1
          ? `Every ${unitSingular} (approx)`
          : `Every ${min} ${unit} (approx)`
        : `Every ${min}–${max} ${unit}`;
    return rule.endOnDate ? `${base} (until ${rule.endOnDate})` : base;
  }

  let base: string;
  if (rule.weekdays && rule.weekdays.length > 0) {
    const days = [...rule.weekdays]
      .sort((a, b) => a - b)
      .map((d) => WEEKDAY_LABELS[d])
      .join(', ');
    base = value === 1 ? `Every ${days}` : `Every ${value} weeks on ${days}`;
  } else if (rule.monthDay != null && unit === 'months') {
    const dom = rule.monthDay;
    base = value === 1 ? `Monthly on day ${dom}` : `Every ${value} months on day ${dom}`;
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

/**
 * Annual calendar-window periodic routine (shown in Tasks, off-calendar).
 * Matches `type === 'annual_window'` with at least one configured annual window.
 */
export function isAnnualWindow(task: Pick<Task, 'recurrence'>): boolean {
  const rule = task.recurrence;
  return (
    !!rule &&
    rule.type === 'annual_window' &&
    Array.isArray(rule.annualWindows) &&
    rule.annualWindows.length > 0
  );
}

/**
 * Window-based approximate periodic routine (shown in Tasks, off-calendar).
 * Matches `type === 'after_completion'` (legacy normalized to [N, N]),
 * `type === 'annual_window'`, or any rule with `maxIntervalValue >= intervalValue`.
 */
export function isWindowPeriodic(task: Pick<Task, 'recurrence'>): boolean {
  const rule = task.recurrence;
  if (!rule) return false;
  if (rule.type === 'after_completion') return true;
  if (isAnnualWindow(task)) return true;
  return rule.maxIntervalValue != null && rule.maxIntervalValue >= rule.intervalValue;
}

/** Calendar-bound fixed-interval recurring task. */
export function isFixedRecurring(task: Pick<Task, 'recurrence'>): boolean {
  return !!task.recurrence && task.recurrence.type !== 'annual_window' && !isWindowPeriodic(task);
}

/** Undated one-time task belonging in Tasks > One-Time. */
export function isUndatedOneTime(task: Pick<Task, 'dueAt' | 'recurrence'>): boolean {
  return !task.dueAt && !task.recurrence;
}

export function getWindowBounds(rule: RecurrenceRule): {
  min: number;
  max: number;
  unit: IntervalUnit;
} {
  const min = Math.max(1, Math.floor(rule.intervalValue || 1));
  const rawMax = rule.maxIntervalValue;
  const max =
    rawMax != null && Number.isFinite(rawMax) && rawMax >= min ? Math.floor(rawMax) : min;
  return { min, max, unit: rule.intervalUnit };
}

export function getLatestCompletionMs(task: Pick<Task, 'completionHistory'>): number | null {
  const history = task.completionHistory;
  if (!history || history.length === 0) return null;
  let maxTs = history[0];
  for (let i = 1; i < history.length; i++) {
    if (history[i] > maxTs) maxTs = history[i];
  }
  return maxTs;
}

export function isWindowStopped(
  task: Pick<Task, 'recurrence' | 'completionHistory'> &
    Partial<Pick<Task, 'completedAt' | 'dueAt' | 'createdAt'>>,
  now: Date = new Date()
): boolean {
  if (!isWindowPeriodic(task) || !task.recurrence?.endOnDate) return false;
  const todayStr = formatDate(startOfDay(now));
  const endOnDate = task.recurrence.endOnDate;
  if (todayStr > endOnDate) return true;
  if (todayStr === endOnDate && isCompletedOnDate(task, todayStr)) return true;
  if (isAnnualWindow(task)) {
    return resolveAnnualProgress(task, now).stage === 'stopped';
  }
  return false;
}

export type WindowStage =
  | 'before_min'
  | 'in_window'
  | 'not_done_yet'
  | 'at_or_past_max'
  | 'stopped';

export interface WindowProgress {
  stage: WindowStage;
  visibleInTasks: boolean;
  sortScore: number;
  /** 0..1 clockwise fill amount for the radial progress ring (steady, no pulsing). */
  ringFill: number;
  /** 0..1 escalation past max for smooth orange -> red color blending. */
  overdueIntensity: number;
  elapsedDays: number | null;
  minDays: number;
  maxDays: number;
  lastDoneMs: number | null;
  doneToday: boolean;
  detailLabel: string;
}

const UNIT_SINGULAR: Record<IntervalUnit, string> = {
  days: 'day',
  weeks: 'week',
  months: 'month',
  years: 'year',
};

const UNIT_PLURAL: Record<IntervalUnit, string> = {
  days: 'days',
  weeks: 'weeks',
  months: 'months',
  years: 'years',
};

function formatExpandedPeriod(min: number, max: number, unit: IntervalUnit): string {
  if (min === max) {
    return min === 1 ? `every ${UNIT_SINGULAR[unit]}` : `every ${min} ${UNIT_PLURAL[unit]}`;
  }
  return `every ${min}–${max} ${UNIT_PLURAL[unit]}`;
}

function formatExpandedElapsed(days: number): string {
  if (days <= 0) return 'Done today';
  if (days === 1) return 'Last done yesterday';
  if (days < 60) return `Last done ${days} days ago`;
  if (days < 365) {
    const months = Math.max(1, Math.round(days / 30.4375));
    return `Last done ${months} ${months === 1 ? 'month' : 'months'} ago`;
  }
  const years = (days / 365).toFixed(1).replace(/\.0$/, '');
  return `Last done ${years} ${years === '1' ? 'year' : 'years'} ago`;
}

function localDaysBetween(fromMidnight: Date, toMidnight: Date): number {
  return Math.round((toMidnight.getTime() - fromMidnight.getTime()) / 86400000);
}

interface AnnualCycleInstance {
  start: Date;
  end: Date;
  startStr: string;
  endStr: string;
  window: AnnualWindow;
}

function buildAnnualCycles(windows: AnnualWindow[], centerYear: number): AnnualCycleInstance[] {
  const seen = new Set<string>();
  const cycles: AnnualCycleInstance[] = [];
  for (const rawW of windows) {
    const w = sanitizeAnnualWindow(rawW);
    const wraps = isYearWrapAnnualWindow(w);
    for (let y = centerYear - 2; y <= centerYear + 2; y++) {
      const start = clampMonthDay(y, w.startMonth - 1, w.startDay);
      const endYear = wraps ? y + 1 : y;
      const end = clampMonthDay(endYear, w.endMonth - 1, w.endDay);
      const startStr = formatDate(start);
      const endStr = formatDate(end);
      const key = `${startStr}|${endStr}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cycles.push({ start, end, startStr, endStr, window: w });
    }
  }
  cycles.sort((a, b) =>
    a.startStr !== b.startStr ? a.startStr.localeCompare(b.startStr) : a.endStr.localeCompare(b.endStr)
  );
  return cycles;
}

function leadInStartStr(cycles: AnnualCycleInstance[], idx: number): string {
  if (idx <= 0) return cycles[idx].startStr;
  const prevEnd = cycles[idx - 1].end;
  const currStart = cycles[idx].start;
  const gapDays = localDaysBetween(prevEnd, currStart);
  if (gapDays <= 1) return cycles[idx].startStr;
  return formatDate(addDays(prevEnd, Math.ceil(gapDays / 2)));
}

function formatAnnualNextStart(date: Date, referenceYear: number): string {
  const base = `${ANNUAL_MONTH_SHORT[date.getMonth() + 1]} ${date.getDate()}`;
  return date.getFullYear() === referenceYear ? base : `${base}, ${date.getFullYear()}`;
}

function resolveAnnualProgress(
  task: Pick<Task, 'recurrence' | 'completionHistory'> &
    Partial<Pick<Task, 'completedAt' | 'dueAt' | 'createdAt'>>,
  now: Date
): WindowProgress {
  const windows = task.recurrence!.annualWindows!;
  const scheduleLabel = windows.map(formatAnnualWindowRange).join(', ');
  const today = startOfDay(now);
  const todayStr = formatDate(today);
  const doneToday = isCompletedOnDate(task, todayStr);

  const history = task.completionHistory || [];
  let minTs: number | null = null;
  let maxTs: number | null = null;
  for (const ts of history) {
    if (minTs === null || ts < minTs) minTs = ts;
    if (maxTs === null || ts > maxTs) maxTs = ts;
  }

  const lastDoneMs = maxTs;
  const latestDoneDateStr = maxTs != null ? formatDate(startOfDay(new Date(maxTs))) : null;
  const earliestDoneDateStr = minTs != null ? formatDate(startOfDay(new Date(minTs))) : null;
  const elapsedDays =
    lastDoneMs != null ? Math.max(0, localDaysBetween(startOfDay(new Date(lastDoneMs)), today)) : null;

  const endOnDate = task.recurrence?.endOnDate ?? null;
  if (endOnDate && (todayStr > endOnDate || (todayStr === endOnDate && doneToday))) {
    return {
      stage: 'stopped',
      visibleInTasks: false,
      sortScore: -2,
      ringFill: 0,
      overdueIntensity: 0,
      elapsedDays,
      minDays: 1,
      maxDays: 1,
      lastDoneMs,
      doneToday,
      detailLabel: `Stopped · every ${scheduleLabel}`,
    };
  }

  const createdDateStr =
    task.createdAt != null && Number.isFinite(task.createdAt)
      ? formatDate(startOfDay(new Date(task.createdAt)))
      : null;
  const effectiveStartStr =
    earliestDoneDateStr && (!createdDateStr || earliestDoneDateStr < createdDateStr)
      ? earliestDoneDateStr
      : createdDateStr ?? todayStr;

  const cycles = buildAnnualCycles(windows, today.getFullYear());
  const isCycleSatisfied = (idx: number): boolean =>
    latestDoneDateStr != null && latestDoneDateStr >= leadInStartStr(cycles, idx);

  let lastStartedIdx = -1;
  for (let i = 0; i < cycles.length; i++) {
    if (cycles[i].startStr <= todayStr) {
      lastStartedIdx = i;
    } else {
      break;
    }
  }

  const currEligible = lastStartedIdx >= 0 && cycles[lastStartedIdx].endStr >= effectiveStartStr;
  const currActive = currEligible && !isCycleSatisfied(lastStartedIdx);

  if (currActive) {
    const curr = cycles[lastStartedIdx];
    const windowLabel = formatAnnualWindowRange(curr.window);
    const windowSpanDays = Math.max(0, localDaysBetween(curr.start, curr.end));
    const elapsedSuffix = elapsedDays != null ? ` · ${formatExpandedElapsed(elapsedDays)}` : '';

    if (todayStr < curr.endStr) {
      const daysInto = Math.max(0, localDaysBetween(curr.start, today));
      const daysLeft = Math.max(1, localDaysBetween(today, curr.end));
      const w = daysInto / Math.max(1, windowSpanDays);
      return {
        stage: 'in_window',
        visibleInTasks: true,
        sortScore: w,
        ringFill: Math.max(0.08, w),
        overdueIntensity: 0,
        elapsedDays,
        minDays: 0,
        maxDays: Math.max(1, windowSpanDays),
        lastDoneMs,
        doneToday,
        detailLabel: `${windowLabel} · ${daysLeft === 1 ? '1 day left' : `${daysLeft} days left`}${elapsedSuffix}`,
      };
    }

    if (todayStr === curr.endStr) {
      return {
        stage: 'at_or_past_max',
        visibleInTasks: true,
        sortScore: 1.01,
        ringFill: 1.0,
        overdueIntensity: 0,
        elapsedDays,
        minDays: 0,
        maxDays: Math.max(1, windowSpanDays),
        lastDoneMs,
        doneToday,
        detailLabel: `${windowLabel} · Last day of window${elapsedSuffix}`,
      };
    }

    const daysOverdue = Math.max(1, localDaysBetween(curr.end, today));
    const extra = daysOverdue / Math.max(7, windowSpanDays);
    return {
      stage: 'at_or_past_max',
      visibleInTasks: true,
      sortScore: 1.01 + extra,
      ringFill: 1.0,
      overdueIntensity: Math.min(1, extra),
      elapsedDays,
      minDays: 0,
      maxDays: Math.max(1, windowSpanDays),
      lastDoneMs,
      doneToday,
      detailLabel: `${windowLabel} · ${daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}${elapsedSuffix}`,
    };
  }

  let nextIdx = cycles.length - 1;
  for (let i = Math.max(0, lastStartedIdx + 1); i < cycles.length; i++) {
    if (!isCycleSatisfied(i)) {
      nextIdx = i;
      break;
    }
  }
  const next = cycles[nextIdx];

  if (endOnDate && next.startStr > endOnDate) {
    return {
      stage: 'stopped',
      visibleInTasks: false,
      sortScore: -2,
      ringFill: 0,
      overdueIntensity: 0,
      elapsedDays,
      minDays: 1,
      maxDays: 1,
      lastDoneMs,
      doneToday,
      detailLabel: `Stopped · every ${scheduleLabel}`,
    };
  }

  const prevCycleEnd = nextIdx > 0 ? cycles[nextIdx - 1].end : addDays(next.start, -365);
  const lastDoneDay = lastDoneMs != null ? startOfDay(new Date(lastDoneMs)) : null;
  const refStart =
    lastDoneDay &&
    lastDoneDay <= today &&
    lastDoneDay > addDays(next.start, -365) &&
    (lastDoneDay >= prevCycleEnd || (lastStartedIdx >= 0 && lastDoneDay >= cycles[lastStartedIdx].start))
      ? lastDoneDay
      : prevCycleEnd;
  const waitDays = Math.max(1, localDaysBetween(refStart, next.start));
  const elapsedWait = Math.max(0, Math.min(waitDays, localDaysBetween(refStart, today)));
  const ratio = elapsedWait / waitDays;
  const nextStartLabel = formatAnnualNextStart(next.start, today.getFullYear());
  const nextWindowLabel = formatAnnualWindowRange(next.window);

  const detailLabel = doneToday
    ? `Done today · next ${nextStartLabel} (${nextWindowLabel})`
    : elapsedDays != null
      ? `${formatExpandedElapsed(elapsedDays)} · next ${nextStartLabel} (${nextWindowLabel})`
      : `Starts ${nextStartLabel} · ${nextWindowLabel}`;

  return {
    stage: 'before_min',
    visibleInTasks: false,
    sortScore: -1 + ratio,
    ringFill: ratio,
    overdueIntensity: 0,
    elapsedDays,
    minDays: waitDays,
    maxDays: waitDays + Math.max(1, localDaysBetween(next.start, next.end)),
    lastDoneMs,
    doneToday,
    detailLabel,
  };
}

/**
 * Compute continuous progress, visibility in Tasks, sort score, and radial ring fill
 * for an approximate min–max periodic task or annual time-of-year window task.
 * Returns null for non-window tasks.
 */
export function getWindowProgress(
  task: Pick<Task, 'recurrence' | 'completionHistory'> &
    Partial<Pick<Task, 'completedAt' | 'dueAt' | 'createdAt'>>,
  now: Date = new Date()
): WindowProgress | null {
  if (!isWindowPeriodic(task) || !task.recurrence) return null;
  if (isAnnualWindow(task)) {
    return resolveAnnualProgress(task, now);
  }

  const { min, max, unit } = getWindowBounds(task.recurrence);
  const periodExpanded = formatExpandedPeriod(min, max, unit);
  const today = startOfDay(now);
  const todayStr = formatDate(today);
  const lastDoneMs = getLatestCompletionMs(task);
  const doneToday = isCompletedOnDate(task, todayStr);

  if (isWindowStopped(task, now)) {
    return {
      stage: 'stopped',
      visibleInTasks: false,
      sortScore: -2,
      ringFill: 0,
      overdueIntensity: 0,
      elapsedDays: lastDoneMs != null ? Math.max(0, localDaysBetween(startOfDay(new Date(lastDoneMs)), today)) : null,
      minDays: 1,
      maxDays: 1,
      lastDoneMs,
      doneToday,
      detailLabel: `Stopped · ${periodExpanded}`,
    };
  }

  if (lastDoneMs == null) {
    const minDays = Math.max(1, localDaysBetween(today, addInterval(today, min, unit)));
    const maxDays = Math.max(minDays, localDaysBetween(today, addInterval(today, max, unit)));
    return {
      stage: 'not_done_yet',
      visibleInTasks: true,
      sortScore: 1.0,
      ringFill: 1.0,
      overdueIntensity: 0,
      elapsedDays: null,
      minDays,
      maxDays,
      lastDoneMs: null,
      doneToday: false,
      detailLabel: `Not done yet · ${periodExpanded}`,
    };
  }

  const anchor = startOfDay(new Date(lastDoneMs));
  const minDate = addInterval(anchor, min, unit);
  const maxDate = addInterval(anchor, max, unit);
  const minDays = Math.max(1, localDaysBetween(anchor, minDate));
  const maxDays = Math.max(minDays, localDaysBetween(anchor, maxDate));
  const elapsedDays = Math.max(0, localDaysBetween(anchor, today));
  const elapsedExpanded = formatExpandedElapsed(elapsedDays);

  if (elapsedDays < minDays) {
    return {
      stage: 'before_min',
      visibleInTasks: false,
      sortScore: -1 + elapsedDays / minDays,
      ringFill: elapsedDays / minDays,
      overdueIntensity: 0,
      elapsedDays,
      minDays,
      maxDays,
      lastDoneMs,
      doneToday,
      detailLabel: `${elapsedExpanded} · ${periodExpanded}`,
    };
  }

  if (elapsedDays < maxDays) {
    const w = (elapsedDays - minDays) / Math.max(1, maxDays - minDays);
    return {
      stage: 'in_window',
      visibleInTasks: true,
      sortScore: w,
      ringFill: Math.max(0.08, w),
      overdueIntensity: 0,
      elapsedDays,
      minDays,
      maxDays,
      lastDoneMs,
      doneToday,
      detailLabel: `${elapsedExpanded} · ${periodExpanded}`,
    };
  }

  const extra = (elapsedDays - maxDays) / Math.max(1, maxDays);
  return {
    stage: 'at_or_past_max',
    visibleInTasks: true,
    sortScore: 1.01 + extra,
    ringFill: 1.0,
    overdueIntensity: Math.min(1, extra),
    elapsedDays,
    minDays,
    maxDays,
    lastDoneMs,
    doneToday,
    detailLabel: `${elapsedExpanded} · ${periodExpanded}${extra > 0 ? ' (overdue)' : ''}`,
  };
}

export function isCompleted(task: Pick<Task, 'completedAt' | 'recurrence'>): boolean {
  return !!task.completedAt;
}

const dayBoundsCache = new Map<string, readonly [number, number]>();

const completedDateSetCache = new WeakMap<
  object,
  { history: readonly number[] | undefined; length: number; set: Set<string> }
>();

const skippedDateSetCache = new WeakMap<
  object,
  { skipped: readonly string[] | undefined; length: number; set: Set<string> }
>();

type EndAfterCountCacheEntry = {
  rule: RecurrenceRule;
  endAfterCount: number;
  anchorStr: string;
  earliestStart: string;
  scheduleHistory: readonly RecurrenceScheduleSegment[] | undefined;
  rescheduledDates: Readonly<Record<string, string>> | undefined;
  history: readonly number[] | undefined;
  historyLength: number;
  scannedThrough: string | null;
  uncompletedCount: number;
  cutoffDateStr: string | null;
};

const endAfterCountCache = new WeakMap<object, EndAfterCountCacheEntry>();

/** Local midnight bounds `[startMs, nextMidnightMs)` for a YYYY-MM-DD calendar date. */
export function getDayBoundsMs(dateStr: string): readonly [number, number] {
  const cached = dayBoundsCache.get(dateStr);
  if (cached) return cached;
  const start = parseDate(dateStr);
  const startMs = start.getTime();
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  const endMs = next.getTime();
  const bounds = [startMs, endMs] as const;
  if (dayBoundsCache.size > 512) dayBoundsCache.clear();
  dayBoundsCache.set(dateStr, bounds);
  return bounds;
}

/**
 * Set of YYYY-MM-DD local calendar dates present in `task.completionHistory`.
 * Reused for the same task object until that history array changes, so a month
 * grid or overdue scan does not reformat every timestamp once per day.
 */
export function getCompletedDateSet(task: Pick<Task, 'completionHistory'>): Set<string> {
  const history = task.completionHistory;
  const length = history?.length ?? 0;
  const cached = completedDateSetCache.get(task);
  if (cached && cached.history === history && cached.length === length) return cached.set;

  const set = new Set<string>();
  if (history) {
    for (const ts of history) set.add(formatDate(new Date(ts)));
  }
  completedDateSetCache.set(task, { history, length, set });
  return set;
}

/**
 * Return the completion timestamp for `task` on `dateStr` (YYYY-MM-DD), or null if not completed on that day.
 */
function getCompletionTimestampOnDate(
  task: Pick<Task, 'completionHistory' | 'completedAt' | 'recurrence' | 'dueAt'>,
  dateStr: string
): number | null {
  const [dayStartMs, dayEndMs] = getDayBoundsMs(dateStr);
  const history = task.completionHistory || [];
  for (let i = history.length - 1; i >= 0; i--) {
    const ts = history[i];
    if (ts >= dayStartMs && ts < dayEndMs) {
      return ts;
    }
  }
  if (!task.recurrence && task.completedAt) {
    if (
      (task.dueAt && getDueDatePart(task.dueAt) === dateStr) ||
      (task.completedAt >= dayStartMs && task.completedAt < dayEndMs)
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
  if (getCompletedDateSet(task).has(dateStr)) return true;
  if (!task.recurrence && task.completedAt) {
    if (task.dueAt && getDueDatePart(task.dueAt) === dateStr) return true;
    const [dayStartMs, dayEndMs] = getDayBoundsMs(dateStr);
    if (task.completedAt >= dayStartMs && task.completedAt < dayEndMs) return true;
  }
  return false;
}

function getSkippedDateSet(task: Pick<Task, 'skippedDates'>): Set<string> {
  const skipped = task.skippedDates;
  const length = skipped?.length ?? 0;
  const cached = skippedDateSetCache.get(task);
  if (cached && cached.skipped === skipped && cached.length === length) return cached.set;

  const set = new Set<string>(skipped);
  skippedDateSetCache.set(task, { skipped, length, set });
  return set;
}

/** Whether `task` has had its occurrence skipped for `dateStr` (YYYY-MM-DD). */
export function isSkippedOnDate(
  task: Pick<Task, 'skippedDates'>,
  dateStr: string
): boolean {
  if (!task.skippedDates || task.skippedDates.length === 0) return false;
  return getSkippedDateSet(task).has(dateStr);
}

/**
 * If `targetDateStr` is the rescheduled target of an earlier/original occurrence, returns that original YYYY-MM-DD key;
 * otherwise returns null.
 */
export function findRescheduledOrigin(
  task: Pick<Task, 'rescheduledDates'>,
  targetDateStr: string
): string | null {
  if (!task.rescheduledDates) return null;
  for (const [orig, target] of Object.entries(task.rescheduledDates)) {
    if (target === targetDateStr && orig !== target) {
      return orig;
    }
  }
  return null;
}

/**
 * Return the recurrence rule active on `dateStr` (checking historical scheduleHistory segments first).
 */
export function getRuleActiveOnDate(
  task: Pick<
    Task,
    'startDate' | 'dueAt' | 'createdAt' | 'completionHistory' | 'recurrence' | 'scheduleHistory'
  >,
  dateStr: string
): RecurrenceRule | null {
  if (task.scheduleHistory && task.scheduleHistory.length > 0) {
    for (const seg of task.scheduleHistory) {
      if (dateStr >= seg.startDate && dateStr <= seg.endDate) {
        return seg.recurrence;
      }
    }
  }
  return task.recurrence ?? null;
}

/**
 * Earliest base schedule start date across `scheduleHistory` segments and the active recurrence anchor.
 */
export function getEarliestBaseStart(
  task: Pick<Task, 'startDate' | 'dueAt' | 'createdAt' | 'completionHistory' | 'scheduleHistory'>
): string {
  let minStr = getRecurrenceAnchor(task);
  if (task.scheduleHistory) {
    for (const seg of task.scheduleHistory) {
      if (seg.startDate && seg.startDate < minStr) {
        minStr = seg.startDate;
      }
    }
  }
  return minStr;
}

/**
 * Earliest calendar date where `task` could appear, accounting for `scheduleHistory` and `rescheduledDates`.
 */
export function getEarliestOccurrenceBound(
  task: Pick<
    Task,
    'startDate' | 'dueAt' | 'createdAt' | 'completionHistory' | 'scheduleHistory' | 'rescheduledDates'
  >
): string {
  let minStr = getEarliestBaseStart(task);
  if (task.rescheduledDates) {
    for (const target of Object.values(task.rescheduledDates)) {
      if (target && target < minStr) {
        minStr = target;
      }
    }
  }
  return minStr;
}

/**
 * Effective end date (YYYY-MM-DD), extended when a scheduled occurrence on or before `endOnDate`
 * was moved past `endOnDate` via `rescheduledDates`.
 */
export function getEffectiveEndOnDate(
  task: Pick<Task, 'recurrence' | 'rescheduledDates'>
): string | null {
  const endOnDate = task.recurrence?.endOnDate;
  if (!endOnDate) return null;
  let maxEnd = endOnDate;
  if (task.rescheduledDates) {
    for (const [orig, target] of Object.entries(task.rescheduledDates)) {
      if (orig <= endOnDate && target > maxEnd) {
        maxEnd = target;
      }
    }
  }
  return maxEnd;
}

/**
 * Inception/start date (YYYY-MM-DD) for a recurring task.
 * Prioritizes task.startDate so that skipping occurrences or advancing dueAt does not
 * retroactively wipe out earlier uncompleted occurrences from the calendar.
 * Falls back to earliest completed date if earlier than current dueAt, or dueAt/createdAt.
 */
export function getRecurrenceAnchor(
  task: Pick<Task, 'startDate' | 'dueAt' | 'createdAt' | 'completionHistory'>
): string {
  if (task.startDate) return task.startDate;
  const duePart = task.dueAt ? getDueDatePart(task.dueAt) : null;

  if (task.completionHistory && task.completionHistory.length > 0) {
    let minTs = task.completionHistory[0];
    for (let i = 1; i < task.completionHistory.length; i++) {
      if (task.completionHistory[i] < minTs) minTs = task.completionHistory[i];
    }
    const earliestComp = formatDate(new Date(minTs));
    if (!duePart || earliestComp < duePart) {
      return earliestComp;
    }
  }

  return duePart || formatDate(new Date(task.createdAt));
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
    if (!rule.weekdays.includes(targetDate.getDay() as Weekday)) return false;
    const intervalWeeks = rule.intervalUnit === 'weeks' ? interval : 1;
    if (intervalWeeks <= 1) return true;

    let firstMatch: Date | null = null;
    for (let i = 0; i < 7; i++) {
      const candidate = addDays(baseDate, i);
      if (rule.weekdays.includes(candidate.getDay() as Weekday)) {
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

  if (rule.intervalUnit === 'years') {
    const expected = clampMonthDay(targetDate.getFullYear(), baseDate.getMonth(), baseDate.getDate());
    if (
      targetDate.getMonth() !== expected.getMonth() ||
      targetDate.getDate() !== expected.getDate()
    ) {
      return false;
    }
    const yearsDiff = targetDate.getFullYear() - baseDate.getFullYear();
    return yearsDiff >= 0 && yearsDiff % interval === 0;
  }

  return false;
}

/**
 * Whether `dateStr` matches the task's base recurring schedule (prior `scheduleHistory` segments
 * or the current recurrence rule from `getRecurrenceAnchor`), ignoring single-occurrence overrides.
 */
export function baseScheduleMatchesDate(
  task: Pick<
    Task,
    'startDate' | 'dueAt' | 'recurrence' | 'completionHistory' | 'createdAt' | 'scheduleHistory'
  >,
  dateStr: string
): boolean {
  const rule = task.recurrence;
  if (!rule) return false;
  if (task.scheduleHistory && task.scheduleHistory.length > 0) {
    for (const seg of task.scheduleHistory) {
      if (dateStr >= seg.startDate && dateStr <= seg.endDate) {
        return scheduleMatchesDate(seg.recurrence, seg.startDate, dateStr, seg.startDate);
      }
    }
  }
  const anchorStr = getRecurrenceAnchor(task);
  if (dateStr < anchorStr) return false;
  return scheduleMatchesDate(rule, anchorStr, dateStr, anchorStr);
}

function passesEndAfterCount(
  task: Pick<
    Task,
    | 'startDate'
    | 'dueAt'
    | 'recurrence'
    | 'completionHistory'
    | 'createdAt'
    | 'rescheduledDates'
    | 'scheduleHistory'
  >,
  baseDateStr: string,
  completedDates: Set<string>
): boolean {
  const rule = task.recurrence;
  if (!rule || rule.endAfterCount == null || rule.endAfterCount <= 0) return true;

  const remaining = rule.endAfterCount - completedDates.size;
  if (remaining <= 0) return false;

  const anchorStr = getRecurrenceAnchor(task);
  const earliestStart = getEarliestBaseStart(task);
  const history = task.completionHistory;
  const historyLength = history?.length ?? 0;
  const scheduleHistory = task.scheduleHistory;
  const rescheduledDates = task.rescheduledDates;

  let entry = endAfterCountCache.get(task);
  if (
    !entry ||
    entry.rule !== rule ||
    entry.endAfterCount !== rule.endAfterCount ||
    entry.anchorStr !== anchorStr ||
    entry.earliestStart !== earliestStart ||
    entry.scheduleHistory !== scheduleHistory ||
    entry.rescheduledDates !== rescheduledDates ||
    entry.history !== history ||
    entry.historyLength !== historyLength
  ) {
    entry = {
      rule,
      endAfterCount: rule.endAfterCount,
      anchorStr,
      earliestStart,
      scheduleHistory,
      rescheduledDates,
      history,
      historyLength,
      scannedThrough: null,
      uncompletedCount: 0,
      cutoffDateStr: null,
    };
    endAfterCountCache.set(task, entry);
  }

  if (entry.cutoffDateStr !== null) {
    return baseDateStr <= entry.cutoffDateStr;
  }
  if (entry.scannedThrough !== null && baseDateStr <= entry.scannedThrough) {
    return true;
  }

  const targetDate = parseDate(baseDateStr);
  let cursor = entry.scannedThrough
    ? addDays(parseDate(entry.scannedThrough), 1)
    : parseDate(earliestStart);
  while (cursor <= targetDate) {
    const dStr = formatDate(cursor);
    entry.scannedThrough = dStr;
    if (baseScheduleMatchesDate(task, dStr)) {
      const effectiveDate = rescheduledDates?.[dStr] ?? dStr;
      if (!completedDates.has(dStr) && !completedDates.has(effectiveDate)) {
        entry.uncompletedCount++;
        if (entry.uncompletedCount === remaining) {
          entry.cutoffDateStr = dStr;
          return baseDateStr <= dStr;
        }
      }
    }
    cursor = addDays(cursor, 1);
  }

  return true;
}

/**
 * Whether `task` occurs on the local calendar date `dateStr` (YYYY-MM-DD).
 * Returns true for every scheduled repeat day as well as any day already in `completionHistory`.
 */
export function taskOccursOnDate(
  task: Pick<Task, 'startDate' | 'dueAt' | 'recurrence' | 'completionHistory' | 'createdAt' | 'deletedAt'> &
    Partial<Pick<Task, 'rescheduledDates' | 'scheduleHistory'>>,
  dateStr: string
): boolean {
  if (task.deletedAt) return false;
  if (!task.recurrence) {
    return !!task.dueAt && getDueDatePart(task.dueAt) === dateStr;
  }
  if (isWindowPeriodic(task)) {
    return false;
  }

  const rule = task.recurrence;
  const completedDates = getCompletedDateSet(task);
  if (completedDates.has(dateStr)) return true;

  if (rule.endAfterCount != null && rule.endAfterCount > 0 && completedDates.size >= rule.endAfterCount) {
    return false;
  }

  const rescheduledOrigin = findRescheduledOrigin(task, dateStr);
  if (rescheduledOrigin) {
    if (rule.endOnDate && rescheduledOrigin > rule.endOnDate) return false;
    if (!baseScheduleMatchesDate(task, rescheduledOrigin)) return false;
    if (rule.endAfterCount != null && rule.endAfterCount > 0) {
      return passesEndAfterCount(task, rescheduledOrigin, completedDates);
    }
    return true;
  }

  if (
    task.rescheduledDates &&
    Object.prototype.hasOwnProperty.call(task.rescheduledDates, dateStr) &&
    task.rescheduledDates[dateStr] !== dateStr
  ) {
    return false;
  }

  if (rule.endOnDate && dateStr > rule.endOnDate) return false;
  if (!baseScheduleMatchesDate(task, dateStr)) return false;

  if (rule.endAfterCount != null && rule.endAfterCount > 0) {
    return passesEndAfterCount(task, dateStr, completedDates);
  }

  return true;
}

/**
 * Project a task onto a specific calendar date `dateStr` (YYYY-MM-DD), preserving any due time
 * and setting `completedAt` based on whether that particular day was completed.
 */
export function projectTaskForDate(task: Task, dateStr: string): Task {
  if (isWindowPeriodic(task)) {
    const compTs = getCompletionTimestampOnDate(task, dateStr);
    return {
      ...task,
      dueAt: null,
      completedAt: compTs,
    };
  }
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
  if (!task.dueAt) {
    return task;
  }
  return task.dueAt === projectedDueAt ? task : { ...task, dueAt: projectedDueAt };
}

function findNextUncompletedForward(
  task: Task,
  startDate: Date,
  maxDays: number = 1100
): string | null {
  const effectiveEnd = getEffectiveEndOnDate(task);
  for (let i = 0; i <= maxDays; i++) {
    const dStr = formatDate(addDays(startDate, i));
    if (effectiveEnd && dStr > effectiveEnd) return null;
    if (
      !isCompletedOnDate(task, dStr) &&
      !isSkippedOnDate(task, dStr) &&
      taskOccursOnDate(task, dStr)
    ) {
      return dStr;
    }
  }
  return null;
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
  if (isWindowPeriodic(task)) return null;
  if (!task.recurrence) {
    if (isCompleted(task) || !task.dueAt) return null;
    return getDueDatePart(task.dueAt);
  }

  const today = startOfDay(fromDate);
  const todayStr = formatDate(today);

  if (
    !isCompletedOnDate(task, todayStr) &&
    !isSkippedOnDate(task, todayStr) &&
    taskOccursOnDate(task, todayStr)
  ) {
    return todayStr;
  }

  const earliestStr = getEarliestOccurrenceBound(task);
  const completedDates = getCompletedDateSet(task);
  let latestCompletedStr: string | null = null;
  for (const c of completedDates) {
    if (!latestCompletedStr || c > latestCompletedStr) latestCompletedStr = c;
  }

  if (!isCompletedOnDate(task, todayStr) && !isSkippedOnDate(task, todayStr) && earliestStr < todayStr) {
    const earliestDate = parseDate(earliestStr);
    const minLookback = addDays(today, -365);
    const earliest = earliestDate > minLookback ? earliestDate : minLookback;
    for (let cursor = addDays(today, -1); cursor >= earliest; cursor = addDays(cursor, -1)) {
      const dStr = formatDate(cursor);
      if (completedDates.has(dStr) || (latestCompletedStr && dStr <= latestCompletedStr)) break;
      if (
        !isCompletedOnDate(task, dStr) &&
        !isSkippedOnDate(task, dStr) &&
        taskOccursOnDate(task, dStr)
      ) {
        return dStr;
      }
    }
  }

  const startForward = earliestStr > todayStr ? parseDate(earliestStr) : addDays(today, 1);
  return findNextUncompletedForward(task, startForward);
}

export function startOfDay(date: Date = new Date()): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addDays(date: Date, days: number): Date {
  const d = startOfDay(date);
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Calculates the next occurrence date for a recurring task after skipping the current one.
 * If referenceDateStr is given, skips that occurrence and returns the next scheduled date.
 * Returns null if the task does not recur or has reached its end condition.
 */
export function getSkipOccurrenceDate(
  task: Task,
  referenceDateStr?: string
): string | null {
  if (!isFixedRecurring(task) || !task.recurrence) return null;
  const curDateStr =
    referenceDateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date()));
  const fromDate = parseDate(curDateStr);
  const time = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;

  // Search forward strictly after curDateStr
  const startForward = addDays(fromDate, 1);
  const nextForward = findNextUncompletedForward(task, startForward);
  if (nextForward) {
    return combineDueAt(nextForward, time);
  }
  const effectiveEnd = getEffectiveEndOnDate(task);
  if (effectiveEnd && formatDate(addDays(startForward, 1100)) > effectiveEnd) {
    return null;
  }

  // Fallback for long-interval schedules beyond the 1100-day forward scan
  try {
    const rawNext = computeRawNextDue({ ...task, recurrence: task.recurrence }, fromDate);
    const rawStr = formatDate(rawNext);
    if (task.recurrence.endOnDate && rawStr > task.recurrence.endOnDate) {
      return null;
    }
    return combineDueAt(rawStr, time);
  } catch {
    return null;
  }
}

