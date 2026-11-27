import { addDays, formatDate } from './recurrence';
import { shiftMonth, startOfWeek, type CalendarDayCell } from './calendar';

/** Month + year title for the calendar header (e.g. "November 2026"). */
export function calendarHeaderTitle(
  year: number,
  monthIndex: number,
  locale?: string
): string {
  return new Date(year, monthIndex, 1).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
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

export type CalendarPullMode = 'pending' | 'drag' | 'scroll';

/**
 * While the finger is still undecided, classify a move as a month pull, a scroll,
 * or not far enough yet. Horizontal movement is left to the month/week pager.
 */
export function classifyCalendarPull(input: {
  mode: CalendarPullMode;
  dx: number;
  dy: number;
  atTop: boolean;
  onHeader: boolean;
  expanded: boolean;
}): CalendarPullMode {
  if (input.mode !== 'pending') return input.mode;
  if (Math.abs(input.dx) > Math.abs(input.dy) && Math.abs(input.dx) > 8) return 'scroll';
  if (Math.abs(input.dy) < 6) return 'pending';
  const { dy, atTop, onHeader, expanded } = input;
  if ((dy > 0 && atTop) || (dy < 0 && expanded && onHeader)) return 'drag';
  return 'scroll';
}

/** 0 = week strip, 1 = full month. `expandDelta` is the pixel height between those two. */
export function calendarExpandProgress(startProgress: number, dy: number, expandDelta: number): number {
  return Math.max(0, Math.min(1, startProgress + dy / expandDelta));
}

/** Release rule: a collapsed grid opens past 25%; an open grid stays open at 75% or more. */
export function commitCalendarExpanded(startProgress: number, progress: number): boolean {
  return startProgress === 0 ? progress > 0.25 : progress >= 0.75;
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

export const CALENDAR_EXPANDED_STORAGE_KEY = 'tempo_calendar_expanded';

/**
 * Reads whether the calendar should start expanded (month view) or collapsed (week view).
 * Accepts 'month' | 'week', or boolean string representations ('true' | 'false', '1' | '0').
 * Defaults to false (week view) if not set or invalid.
 */
export function readStoredCalendarExpanded(storage?: Pick<Storage, 'getItem'>): boolean {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(CALENDAR_EXPANDED_STORAGE_KEY);
    if (raw === 'month' || raw === 'true' || raw === '1') return true;
    if (raw === 'week' || raw === 'false' || raw === '0') return false;
  } catch {
    /* ignore storage access errors */
  }
  return false;
}

/**
 * Saves whether the calendar is showing month view (expanded) or week view (collapsed).
 */
export function saveStoredCalendarExpanded(
  expanded: boolean,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    s?.setItem(CALENDAR_EXPANDED_STORAGE_KEY, expanded ? 'month' : 'week');
  } catch {
    /* ignore storage errors */
  }
}

export type ActiveMainView = 'calendar' | 'tasks';

export const ACTIVE_VIEW_STORAGE_KEY = 'tempo_active_view';

/**
 * Reads which primary view ('calendar' | 'tasks') was last active.
 * Defaults to 'calendar' if unset or invalid.
 */
export function readStoredActiveView(storage?: Pick<Storage, 'getItem'>): ActiveMainView {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (raw === 'tasks' || raw === 'calendar') return raw;
  } catch {
    /* ignore storage access errors */
  }
  return 'calendar';
}

/**
 * Persists which primary view ('calendar' | 'tasks') is currently active.
 */
export function saveStoredActiveView(
  view: ActiveMainView,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    s?.setItem(ACTIVE_VIEW_STORAGE_KEY, view);
  } catch {
    /* ignore storage errors */
  }
}

export const CALENDAR_SELECTED_DATE_STORAGE_KEY = 'tempo_calendar_selected_date';
export const CALENDAR_SELECTED_TODAY_SENTINEL = 'today';

function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  if (y < 100) return false;
  const dt = new Date(y, m - 1, d);
  return !Number.isNaN(dt.getTime()) && formatDate(dt) === value;
}

/**
 * Reads the persisted calendar selection, resolving the `'today'` sentinel (or unset/invalid values)
 * to the caller's current `todayKey`.
 */
export function readStoredCalendarSelectedDate(
  todayKey: string,
  storage?: Pick<Storage, 'getItem'>
): string {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const raw = s?.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY);
    if (!raw || raw === CALENDAR_SELECTED_TODAY_SENTINEL) return todayKey;
    if (isValidIsoDate(raw)) return raw;
  } catch {
    /* ignore storage access errors */
  }
  return todayKey;
}

/**
 * Persists the selected calendar date. Stores `'today'` when viewing `todayKey` (or unset/invalid)
 * so reopening on a later day shows that day's "today".
 */
export function saveStoredCalendarSelectedDate(
  selectedDateStr: string | null | undefined,
  todayKey: string,
  storage?: Pick<Storage, 'setItem'>
): void {
  try {
    const s = storage ?? (typeof localStorage !== 'undefined' ? localStorage : undefined);
    const value =
      !selectedDateStr || selectedDateStr === todayKey || !isValidIsoDate(selectedDateStr)
        ? CALENDAR_SELECTED_TODAY_SENTINEL
        : selectedDateStr;
    s?.setItem(CALENDAR_SELECTED_DATE_STORAGE_KEY, value);
  } catch {
    /* ignore storage errors */
  }
}

export type CalendarSwipeEvent =
  | { phase: 'drag'; progress: number }
  | { phase: 'snap'; target: -1 | 0 | 1; durationMs: number }
  | { phase: 'reset' };

export interface MonthTitleSwipeState {
  translatePercent: number;
  prevOpacity: number;
  currentOpacity: number;
  nextOpacity: number;
}

/**
 * Computes the horizontal translation and per-slide opacities for the month header title
 * given normalized swipe progress in [-1, 1] (negative = dragging left toward next month,
 * positive = dragging right toward previous month).
 */
export function computeMonthTitleSwipeState(
  progress: number,
  canSwipePrev: boolean,
  canSwipeNext: boolean
): MonthTitleSwipeState {
  const clamped = Math.max(-1, Math.min(1, progress));
  const blocked = (clamped > 0 && !canSwipePrev) || (clamped < 0 && !canSwipeNext);
  const effective = blocked ? 0 : clamped;
  return {
    translatePercent: effective * 100,
    prevOpacity: Math.max(0, effective),
    currentOpacity: 1 - Math.abs(effective),
    nextOpacity: Math.max(0, -effective),
  };
}

/** Step the calendar by 1 month (expanded) or 1 week (collapsed), matching swipe behavior. */
export function stepCalendarView(input: {
  expanded: boolean;
  year: number;
  monthIndex: number;
  selectedDateStr: string | null | undefined;
  delta: -1 | 1;
  today?: Date;
}): ShiftCalendarResult {
  const { expanded, year, monthIndex, selectedDateStr, delta, today = new Date() } = input;
  if (expanded) {
    return shiftMonthView(year, monthIndex, selectedDateStr, delta, today);
  }
  return shiftWeek(selectedDateStr, delta, today);
}

/** Localized short month labels (Jan..Dec). */
export function shortMonthNames(locale?: string): string[] {
  return Array.from({ length: 12 }, (_, m) =>
    new Date(2026, m, 1).toLocaleDateString(locale, { month: 'short' })
  );
}

export const PICKER_YEAR_COLUMNS = 4;
export const PICKER_PAST_YEARS = 56;
export const PICKER_FUTURE_YEARS = 47;
export const PICKER_DEFAULT_VISIBLE_FUTURE_YEARS = 12;

/**
 * Build the scrollable year grid list so `currentYear` always starts at column 0 of its row,
 * with past years above (scrollable back) and future years from `currentYear` onward.
 * Expands automatically if `selectedYear` falls outside the default window.
 */
export function buildPickerYears(
  currentYear: number,
  selectedYear: number = currentYear
): number[] {
  const minTarget = Math.min(currentYear - PICKER_PAST_YEARS, selectedYear);
  const pastSpan =
    Math.ceil((currentYear - minTarget) / PICKER_YEAR_COLUMNS) * PICKER_YEAR_COLUMNS;
  const startYear = currentYear - pastSpan;

  const maxTarget = Math.max(currentYear + PICKER_FUTURE_YEARS, selectedYear);
  const futureSpan =
    Math.ceil((maxTarget - currentYear + 1) / PICKER_YEAR_COLUMNS) * PICKER_YEAR_COLUMNS - 1;
  const endYear = currentYear + futureSpan;

  const years: number[] = [];
  for (let y = startYear; y <= endYear; y++) {
    years.push(y);
  }
  return years;
}

/**
 * Year button whose row should align to the top of the picker's scrollable year list on open.
 * When viewing the current year or near-future years (within the default 3-row viewport),
 * anchor at `currentYear` so current + future years are shown by default.
 * Otherwise anchor at the start of `selectedYear`'s row so it is immediately visible.
 */
export function pickerDefaultScrollYear(selectedYear: number, currentYear: number): number {
  if (
    selectedYear >= currentYear &&
    selectedYear < currentYear + PICKER_DEFAULT_VISIBLE_FUTURE_YEARS
  ) {
    return currentYear;
  }
  const rowOffset =
    Math.floor((selectedYear - currentYear) / PICKER_YEAR_COLUMNS) * PICKER_YEAR_COLUMNS;
  return currentYear + rowOffset;
}

export { shiftMonth };
