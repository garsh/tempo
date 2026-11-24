import type {
  RecurrenceRule,
  RecurrenceScheduleSegment,
  Task,
  Weekday,
} from '../types/task';
import { WEEKDAY_LABELS } from '../types/task';
import {
  addDays,
  findRescheduledOrigin,
  formatDate,
  formatRecurrenceLabel,
  getRecurrenceAnchor,
  getRuleActiveOnDate,
  getSkipOccurrenceDate,
  isCompletedOnDate,
  isSkippedOnDate,
  parseDate,
  startOfDay,
  taskOccursOnDate,
} from './recurrence';
import { MAX_SCHEDULE_HISTORY } from './syncPayload';

function normalizedWeekdays(weekdays: Weekday[] | undefined): string {
  if (!weekdays || weekdays.length === 0) return '';
  return [...new Set(weekdays)].sort((a, b) => a - b).join(',');
}

/**
 * Deep structural comparison for normalized recurrence rules, used to detect whether
 * a user manually altered repeat settings in QuickAddSheet alongside a date edit.
 */
export function recurrenceRulesEqual(
  a: RecurrenceRule | null | undefined,
  b: RecurrenceRule | null | undefined
): boolean {
  if (a == null && b == null) return true;
  if (a == null || b == null) return false;
  return (
    a.type === b.type &&
    a.intervalValue === b.intervalValue &&
    (a.maxIntervalValue ?? null) === (b.maxIntervalValue ?? null) &&
    a.intervalUnit === b.intervalUnit &&
    normalizedWeekdays(a.weekdays) === normalizedWeekdays(b.weekdays) &&
    (a.monthDay ?? null) === (b.monthDay ?? null) &&
    (a.endOnDate ?? null) === (b.endOnDate ?? null) &&
    (a.endAfterCount ?? null) === (b.endAfterCount ?? null)
  );
}

/** Return a copy of `rule` without series-global end bounds for historical segments. */
export function stripSegmentEndBounds(rule: RecurrenceRule): RecurrenceRule {
  const copy: RecurrenceRule = { ...rule };
  delete copy.endOnDate;
  delete copy.endAfterCount;
  delete copy.maxIntervalValue;
  return copy;
}

/**
 * Compute the transformed recurrence rule when moving a recurring series from `origFromDate` to `toDate`.
 * Multi-weekday schedules substitute `fromDow -> toDow` (deduplicated & sorted).
 */
export function buildSeriesMoveRule(
  rule: RecurrenceRule,
  origFromDate: string,
  toDate: string,
  globalEndOnDate?: string | null,
  globalEndAfterCount?: number | null
): { nextRule: RecurrenceRule; endDateExtendedTo: string | null } {
  const nextRule: RecurrenceRule = {
    ...rule,
    ...(globalEndOnDate !== undefined ? { endOnDate: globalEndOnDate } : {}),
    ...(globalEndAfterCount !== undefined ? { endAfterCount: globalEndAfterCount } : {}),
  };

  const fromDateObj = parseDate(origFromDate);
  const toDateObj = parseDate(toDate);
  const fromDow = fromDateObj.getDay() as Weekday;
  const toDow = toDateObj.getDay() as Weekday;
  const toDom = toDateObj.getDate();

  if (nextRule.intervalUnit === 'weeks' && nextRule.weekdays && nextRule.weekdays.length > 0) {
    let replaced = false;
    const mapped = nextRule.weekdays.map((d) => {
      if (d === fromDow) {
        replaced = true;
        return toDow;
      }
      return d;
    });
    if (!replaced) mapped.push(toDow);
    nextRule.weekdays = [...new Set(mapped)].sort((a, b) => a - b) as Weekday[];
  } else if (nextRule.intervalUnit === 'months' && nextRule.monthDay != null) {
    nextRule.monthDay = toDom;
  }

  let endDateExtendedTo: string | null = null;
  if (nextRule.endOnDate && toDate > nextRule.endOnDate) {
    const deltaDays = Math.round((toDateObj.getTime() - fromDateObj.getTime()) / 86400000);
    const shifted = deltaDays > 0 ? formatDate(addDays(parseDate(nextRule.endOnDate), deltaDays)) : toDate;
    const extended = shifted >= toDate ? shifted : toDate;
    nextRule.endOnDate = extended;
    endDateExtendedTo = extended;
  }

  return { nextRule, endDateExtendedTo };
}

/**
 * Update `task.scheduleHistory` so segments remain disjoint and strictly end at or before `segmentEnd`.
 */
export function buildUpdatedScheduleHistory(
  task: Task,
  segmentEnd: string
): RecurrenceScheduleSegment[] {
  const result: RecurrenceScheduleSegment[] = [];
  for (const seg of task.scheduleHistory ?? []) {
    if (seg.startDate > segmentEnd) continue;
    result.push({
      startDate: seg.startDate,
      endDate: seg.endDate > segmentEnd ? segmentEnd : seg.endDate,
      recurrence: stripSegmentEndBounds(seg.recurrence),
    });
  }

  if (task.recurrence) {
    const anchor = getRecurrenceAnchor(task);
    if (anchor <= segmentEnd) {
      result.push({
        startDate: anchor,
        endDate: segmentEnd,
        recurrence: stripSegmentEndBounds(task.recurrence),
      });
    }
  }

  return result.length > MAX_SCHEDULE_HISTORY ? result.slice(-MAX_SCHEDULE_HISTORY) : result;
}

function appendEndSuffix(base: string, rule: RecurrenceRule): string {
  const ends: string[] = [];
  if (rule.endOnDate) ends.push(`until ${rule.endOnDate}`);
  if (rule.endAfterCount) ends.push(`${rule.endAfterCount}x`);
  return ends.length > 0 ? `${base} (${ends.join(', ')})` : base;
}

/**
 * Format a schedule label that includes the concrete weekday/monthday derived from `anchorDateStr`
 * when the rule omits explicit `weekdays` or `monthDay`.
 */
export function formatSchedulePreview(rule: RecurrenceRule, anchorDateStr: string): string {
  if (rule.weekdays && rule.weekdays.length > 0) {
    return formatRecurrenceLabel(rule);
  }
  const anchor = parseDate(anchorDateStr);
  const value = rule.intervalValue;

  if (rule.intervalUnit === 'weeks') {
    const wd = WEEKDAY_LABELS[anchor.getDay() as Weekday];
    const base = value === 1 ? `Every ${wd}` : `Every ${value} weeks on ${wd}`;
    return appendEndSuffix(base, rule);
  }

  if (rule.intervalUnit === 'months' && rule.monthDay == null) {
    const dom = anchor.getDate();
    const base = value === 1 ? `Monthly on day ${dom}` : `Every ${value} months on day ${dom}`;
    return appendEndSuffix(base, rule);
  }

  if (rule.intervalUnit === 'years') {
    const monthDayStr = anchor.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const base = value === 1 ? `Yearly on ${monthDayStr}` : `Every ${value} years on ${monthDayStr}`;
    return appendEndSuffix(base, rule);
  }

  return formatRecurrenceLabel(rule);
}

export interface RecurringMoveAnalysis {
  origFromDate: string;
  nextRule: RecurrenceRule;
  currentScheduleLabel: string;
  nextScheduleLabel: string;
  isCompletedOccurrence: boolean;
  canMoveCompletedOccurrence: boolean;
  hasCollisionOnTarget: boolean;
  isDaily: boolean;
  isFinalOccurrence: boolean;
  endDateExtendedTo: string | null;
}

/**
 * Analyze moving a fixed-interval recurring task's occurrence from `fromDate` to `toDate`.
 */
export function analyzeRecurringDateMove(
  task: Task,
  fromDate: string,
  toDate: string,
  today: Date = new Date()
): RecurringMoveAnalysis {
  if (!task.recurrence) {
    throw new Error('analyzeRecurringDateMove requires a recurring task');
  }
  const origFromDate = findRescheduledOrigin(task, fromDate) ?? fromDate;
  const activeRuleForOrigin = getRuleActiveOnDate(task, origFromDate) ?? task.recurrence;
  const { nextRule, endDateExtendedTo } = buildSeriesMoveRule(
    activeRuleForOrigin,
    origFromDate,
    toDate,
    task.recurrence.endOnDate,
    task.recurrence.endAfterCount
  );

  const currentScheduleLabel = formatSchedulePreview(activeRuleForOrigin, origFromDate);
  const nextScheduleLabel = formatSchedulePreview(nextRule, toDate);
  const isCompletedOccurrence = isCompletedOnDate(task, fromDate);
  const todayStr = formatDate(startOfDay(today));
  const canMoveCompletedOccurrence = !isCompletedOccurrence || toDate <= todayStr;
  const hasCollisionOnTarget =
    !isCompletedOccurrence &&
    taskOccursOnDate(task, toDate) &&
    !isSkippedOnDate(task, toDate) &&
    !isCompletedOnDate(task, toDate);
  const isDaily = nextRule.intervalUnit === 'days' && nextRule.intervalValue === 1;
  const isFinalOccurrence = getSkipOccurrenceDate(task, fromDate) === null;

  return {
    origFromDate,
    nextRule,
    currentScheduleLabel,
    nextScheduleLabel,
    isCompletedOccurrence,
    canMoveCompletedOccurrence,
    hasCollisionOnTarget,
    isDaily,
    isFinalOccurrence,
    endDateExtendedTo,
  };
}
