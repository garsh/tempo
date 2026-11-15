import type { Task } from '../types/task';
import {
  formatDate,
  getDayBoundsMs,
  getDueDatePart,
  getNextUncompletedOccurrenceDate,
  isCompleted,
  isCompletedOnDate,
  isRecurring,
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

/** Open tasks due on a given YYYY-MM-DD (including recurring occurrences not completed on that day). */
export function tasksDueOnDate(tasks: Task[], dateStr: string): Task[] {
  return tasks
    .filter((t) => {
      if (t.deletedAt || (!t.dueAt && !isRecurring(t))) return false;
      if (!t.recurrence && t.completedAt) return false;
      if (!taskOccursOnDate(t, dateStr)) return false;
      return !isCompletedOnDate(t, dateStr);
    })
    .map((t) => projectTaskForDate(t, dateStr));
}

/** Tasks completed on a given YYYY-MM-DD (including recurring occurrences completed on that day). */
export function completedTasksOnDate(tasks: Task[], dateStr: string): Task[] {
  const [dayStartMs, dayEndMs] = getDayBoundsMs(dateStr);
  return tasks
    .filter((t) => {
      if (t.deletedAt || (!t.dueAt && !isRecurring(t))) return false;
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

/**
 * Agenda groups: consecutive days from `from` for `dayCount` days,
 * only including days that have tasks (plus always include today if empty? —
 * include all days in range for a predictable agenda feel, empty ones optional).
 */
export type AgendaDay = {
  dateStr: string;
  date: Date;
  tasks: Task[];
};

export function buildAgenda(
  tasks: Task[],
  from: Date = new Date(),
  dayCount: number = 14,
  includeEmpty: boolean = false
): AgendaDay[] {
  const days: AgendaDay[] = [];
  const start = startOfDay(from);

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = formatDate(d);
    const dayTasks = tasksDueOnDate(tasks, dateStr).sort((a, b) =>
      (a.dueAt || '').localeCompare(b.dueAt || '')
    );
    if (includeEmpty || dayTasks.length > 0 || i === 0) {
      days.push({ dateStr, date: d, tasks: dayTasks });
    }
  }

  // Also surface overdue before the range as a synthetic "Overdue" bucket
  const rangeStartStr = formatDate(start);
  const overdue: Task[] = [];
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t)) continue;
    if (isRecurring(t)) {
      const nextDate = getNextUncompletedOccurrenceDate(t, start);
      if (nextDate && nextDate < rangeStartStr) {
        overdue.push(projectTaskForDate(t, nextDate));
      }
    } else if (t.dueAt && getDueDatePart(t.dueAt) < rangeStartStr) {
      overdue.push(t);
    }
  }
  overdue.sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));

  if (overdue.length > 0) {
    days.unshift({
      dateStr: 'overdue',
      date: new Date(start.getTime() - 86400000),
      tasks: overdue,
    });
  }

  return days;
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
