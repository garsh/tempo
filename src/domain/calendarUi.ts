import { formatDate } from './recurrence';
import { shiftMonth } from './calendar';

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

export { shiftMonth };
