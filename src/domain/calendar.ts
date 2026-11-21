import type { Task } from '../types/task';
import {
  formatDate,
  getDayBoundsMs,
  getDueDatePart,
  isCompletedOnDate,
  isFixedRecurring,
  isSkippedOnDate,
  isWindowPeriodic,
  projectTaskForDate,
  startOfDay,
  taskOccursOnDate,
} from './recurrence';

export type CalendarDayCell = {
  date: Date;
  dateStr: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

/**
 * Build a 6×7 month grid starting on `weekStart` (0=Sun, 1=Mon, 6=Sat; locale-independent).
 */
export function buildMonthGrid(
  year: number,
  monthIndex: number,
  today: Date = new Date(),
  weekStart: number = 0
): CalendarDayCell[] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() - weekStart + 7) % 7;
  const gridStart = new Date(year, monthIndex, 1 - startOffset);
  const todayStr = formatDate(startOfDay(today));

  const cells: CalendarDayCell[] = [];
  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart);
    d.setDate(gridStart.getDate() + i);
    const dateStr = formatDate(d);
    cells.push({
      date: d,
      dateStr,
      inCurrentMonth: d.getMonth() === monthIndex,
      isToday: dateStr === todayStr,
    });
  }
  return cells;
}

const DOW_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday header labels rotated to start on `weekStart`. */
export function weekdayLabels(weekStart: number = 0): string[] {
  return Array.from({ length: 7 }, (_, i) => DOW_SHORT[(weekStart + i) % 7]);
}

/** First day (local midnight) of the week containing `date`, for a given week start. */
export function startOfWeek(date: Date, weekStart: number = 0): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() - weekStart + 7) % 7));
  return d;
}

/** Open tasks due on a given YYYY-MM-DD (including scheduled recurring occurrences not completed on that day). */
export function tasksDueOnDate(tasks: Task[], dateStr: string): Task[] {
  return tasks
    .filter((t) => {
      if (t.deletedAt || isWindowPeriodic(t) || (!t.dueAt && !isFixedRecurring(t))) return false;
      if (!t.recurrence && t.completedAt) return false;
      if (isSkippedOnDate(t, dateStr)) return false;
      if (!taskOccursOnDate(t, dateStr)) return false;
      return !isCompletedOnDate(t, dateStr);
    })
    .map((t) => projectTaskForDate(t, dateStr));
}

/** Tasks completed on a given YYYY-MM-DD (including recurring and approximate completions on that day). */
export function completedTasksOnDate(tasks: Task[], dateStr: string): Task[] {
  const [dayStartMs, dayEndMs] = getDayBoundsMs(dateStr);
  return tasks
    .filter((t) => {
      if (t.deletedAt) return false;
      if (isWindowPeriodic(t)) {
        return isCompletedOnDate(t, dateStr);
      }
      if (!t.dueAt && !isFixedRecurring(t)) {
        return (
          !t.recurrence &&
          !!t.completedAt &&
          t.completedAt >= dayStartMs &&
          t.completedAt < dayEndMs
        );
      }
      if (!t.recurrence) {
        if (!t.completedAt) return false;
        const dueMatches = !!t.dueAt && getDueDatePart(t.dueAt) === dateStr;
        const compMatches = t.completedAt >= dayStartMs && t.completedAt < dayEndMs;
        if (!dueMatches && !compMatches) return false;
        return taskOccursOnDate(t, dateStr) && isCompletedOnDate(t, dateStr);
      }
      if (!taskOccursOnDate(t, dateStr)) return false;
      return isCompletedOnDate(t, dateStr);
    })
    .map((t) => projectTaskForDate(t, dateStr));
}

export function monthLabel(year: number, monthIndex: number): string {
  return new Date(year, monthIndex, 1).toLocaleString(undefined, {
    month: 'long',
    year: 'numeric',
  });
}

export function shiftMonth(year: number, monthIndex: number, delta: number): {
  year: number;
  monthIndex: number;
} {
  const d = new Date(year, monthIndex + delta, 1);
  return { year: d.getFullYear(), monthIndex: d.getMonth() };
}
