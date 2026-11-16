import { addDays, formatDate } from './recurrence';
import { shiftMonth, startOfWeek, type CalendarDayCell } from './calendar';

export const CAL_TODAY_TIP_KEY = 'tempo_cal_today_tip_dismissed';

export function isCalTodayTipDismissed(storage: Pick<Storage, 'getItem'> | null = defaultStorage()): boolean {
  try {
    return storage?.getItem(CAL_TODAY_TIP_KEY) === '1';
  } catch {
    return false;
  }
}

export function dismissCalTodayTip(storage: Pick<Storage, 'setItem'> | null = defaultStorage()): void {
  try {
    storage?.setItem(CAL_TODAY_TIP_KEY, '1');
  } catch {
    /* private mode */
  }
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

/** Month name only ("October"), matching TickTick's calendar header. */
export function monthName(year: number, monthIndex: number, locale?: string): string {
  return new Date(year, monthIndex, 1).toLocaleString(locale, { month: 'long' });
}

/**
 * Day-card title under the month grid: "Today" when the selected day is today,
 * otherwise a short date like "Mon, Oct 7".
 */
export function dayCardTitle(dateStr: string, todayStr: string, locale?: string): string {
  if (dateStr === todayStr) return 'Today';
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(locale, { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * Right-side due label on a calendar day-card row: "Today" when due today,
 * otherwise a short month+day (TickTick style).
 */
export function calendarRowDueLabel(dueAt: string | null | undefined, todayStr: string): string {
  if (!dueAt) return '';
  const date = dueAt.slice(0, 10);
  if (date === todayStr) return 'Today';
  const [y, m, d] = date.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface JumpToTodayResult {
  year: number;
  monthIndex: number;
  dateStr: string;
}

/** Jump the calendar selection (and visible month) to today. */
export function jumpToToday(now: Date = new Date()): JumpToTodayResult {
  return {
    year: now.getFullYear(),
    monthIndex: now.getMonth(),
    dateStr: formatDate(now),
  };
}

/**
 * Build the dueAt for a task created from the calendar FAB.
 * Date-only (YYYY-MM-DD); keeps an existing time if the chip was edited to one.
 */
export function dueAtForSelectedDay(selectedDateStr: string | null | undefined, todayStr?: string): string | null {
  if (!selectedDateStr) return todayStr ?? formatDate(new Date());
  return selectedDateStr;
}

/** True when shifting months would leave the selected day outside the new month — keep selection. */
export function monthContains(dateStr: string, year: number, monthIndex: number): boolean {
  const [y, m] = dateStr.split('-').map(Number);
  return y === year && m - 1 === monthIndex;
}

export interface ShiftCalendarResult {
  dateStr: string;
  year: number;
  monthIndex: number;
}

/**
 * Shifts the viewed week by deltaWeeks (-1 for previous week, +1 for next week).
 * Returns the new selected dateStr and corresponding year and monthIndex.
 */
export function shiftWeek(
  selectedDateStr: string | null | undefined,
  deltaWeeks: number,
  today: Date = new Date()
): ShiftCalendarResult {
  const baseStr = selectedDateStr || formatDate(today);
  const parts = baseStr.split('-').map(Number);
  const y = parts[0] || today.getFullYear();
  const m = (parts[1] || 1) - 1;
  const d = parts[2] || 1;
  const dt = new Date(y, m, d);
  const nextDt = addDays(dt, deltaWeeks * 7);
  return {
    dateStr: formatDate(nextDt),
    year: nextDt.getFullYear(),
    monthIndex: nextDt.getMonth(),
  };
}

/**
 * Returns the default highlighted date for a given month:
 * `today` if the month is the current month, otherwise the 1st of that month.
 */
export function defaultDateForMonth(
  year: number,
  monthIndex: number,
  today: Date = new Date()
): string {
  const isCurrentMonth =
    year === today.getFullYear() && monthIndex === today.getMonth();
  return isCurrentMonth
    ? formatDate(today)
    : formatDate(new Date(year, monthIndex, 1));
}

/**
 * Shifts the viewed month by deltaMonths (-1 for previous month, +1 for next month).
 * Defaults to the 1st of the month highlighted, except for the current month, which defaults to today.
 * Returns the new selected dateStr and corresponding year and monthIndex.
 */
export function shiftMonthView(
  year: number,
  monthIndex: number,
  _selectedDateStr: string | null | undefined,
  deltaMonths: number,
  today: Date = new Date()
): ShiftCalendarResult {
  const { year: nextYear, monthIndex: nextMonthIndex } = shiftMonth(year, monthIndex, deltaMonths);
  return {
    dateStr: defaultDateForMonth(nextYear, nextMonthIndex, today),
    year: nextYear,
    monthIndex: nextMonthIndex,
  };
}

/**
 * Builds a 7-day strip for the week containing `centerDateStr`, starting on `weekStart`.
 */
export function buildWeekCells(
  centerDateStr: string,
  year: number,
  monthIndex: number,
  weekStart: number = 0,
  todayStr?: string
): CalendarDayCell[] {
  const [y, m, d] = centerDateStr.split('-').map(Number);
  const monday = startOfWeek(new Date(y, m - 1, d), weekStart);
  const currentTodayStr = todayStr ?? formatDate(new Date());

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    const dateStr = formatDate(dt);
    cells.push({
      date: dt,
      dateStr,
      inCurrentMonth: dt.getFullYear() === year && dt.getMonth() === monthIndex,
      isToday: dateStr === currentTodayStr,
    });
  }
  return cells;
}

export { shiftMonth };
