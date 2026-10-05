import type { Task } from '../types/task';
import { formatDate, getDueDatePart, isCompleted, startOfDay } from './recurrence';

export type CalendarDayCell = {
  date: Date;
  dateStr: string;
  inCurrentMonth: boolean;
  isToday: boolean;
};

/**
 * Build a 6×7 month grid starting on Sunday (locale-independent).
 */
export function buildMonthGrid(year: number, monthIndex: number, today: Date = new Date()): CalendarDayCell[] {
  const first = new Date(year, monthIndex, 1);
  const startOffset = first.getDay(); // 0=Sun
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

/** Open tasks due on a given YYYY-MM-DD (date part of dueAt). */
export function tasksDueOnDate(tasks: Task[], dateStr: string): Task[] {
  return tasks.filter((t) => {
    if (t.deletedAt || isCompleted(t) || !t.dueAt) return false;
    return getDueDatePart(t.dueAt) === dateStr;
  });
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
  const open = tasks.filter((t) => !t.deletedAt && !isCompleted(t) && t.dueAt);
  const days: AgendaDay[] = [];
  const start = startOfDay(from);

  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = formatDate(d);
    const dayTasks = open
      .filter((t) => getDueDatePart(t.dueAt!) === dateStr)
      .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));
    if (includeEmpty || dayTasks.length > 0 || i === 0) {
      days.push({ dateStr, date: d, tasks: dayTasks });
    }
  }

  // Also surface overdue before the range as a synthetic "Overdue" bucket
  const rangeStartStr = formatDate(start);
  const overdue = open
    .filter((t) => getDueDatePart(t.dueAt!) < rangeStartStr)
    .sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));

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
