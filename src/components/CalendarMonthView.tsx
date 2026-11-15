import { useMemo } from 'react';
import type { Task } from '../types/task';
import { buildMonthGrid, weekdayLabels } from '../domain/calendar';
import { usePrefs } from '../prefs/prefs';
import { formatDate, getDueDatePart, isCompleted, isRecurring, taskOccursOnDate } from '../domain/recurrence';

export const CALENDAR_ROW_HEIGHT = 36;
export const CALENDAR_WEEK_COUNT = 6;
export const CALENDAR_EXPAND_DELTA = CALENDAR_ROW_HEIGHT * (CALENDAR_WEEK_COUNT - 1);

interface CalendarMonthViewProps {
  tasks: Task[];
  year: number;
  monthIndex: number;
  selectedDateStr: string | null;
  expanded: boolean;
  /** 0 (week strip) .. 1 (full month); overrides `expanded` while actively dragging. */
  dragProgress?: number | null;
  onToggleExpanded: (next?: boolean) => void;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (dateStr: string) => void;
}

/**
 * TickTick-style collapsible calendar: defaults to a 7-day week strip around the
 * selected date and smoothly reveals/retracts the full 6-row month grid as the user pulls.
 */
export function CalendarMonthView({
  tasks,
  year,
  monthIndex,
  selectedDateStr,
  expanded,
  dragProgress,
  onToggleExpanded,
  onMonthChange,
  onSelectDate,
}: CalendarMonthViewProps) {
  const [{ weekStart }] = usePrefs();
  const todayStr = formatDate(new Date());
  const focusStr = selectedDateStr || todayStr;

  const dow = useMemo(() => weekdayLabels(weekStart), [weekStart]);

  const monthGrid = useMemo(
    () => buildMonthGrid(year, monthIndex, new Date(), weekStart),
    [year, monthIndex, weekStart]
  );

  const dueDateSet = useMemo(() => {
    const set = new Set<string>();
    const recurringTasks: Task[] = [];
    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (isRecurring(t)) {
        recurringTasks.push(t);
      } else if (!isCompleted(t) && t.dueAt) {
        set.add(getDueDatePart(t.dueAt));
      }
    }
    if (recurringTasks.length > 0) {
      for (const cell of monthGrid) {
        if (!set.has(cell.dateStr) && recurringTasks.some((t) => taskOccursOnDate(t, cell.dateStr))) {
          set.add(cell.dateStr);
        }
      }
    }
    return set;
  }, [tasks, monthGrid]);

  const selectedWeekIndex = useMemo(() => {
    const idx = monthGrid.findIndex((c) => c.dateStr === focusStr);
    return idx >= 0 ? Math.floor(idx / 7) : 0;
  }, [monthGrid, focusStr]);

  const isDragging = dragProgress !== null && dragProgress !== undefined;
  const progress = Math.max(0, Math.min(1, isDragging ? dragProgress : expanded ? 1 : 0));

  const containerHeight = CALENDAR_ROW_HEIGHT + progress * CALENDAR_EXPAND_DELTA;
  const gridTranslateY = -selectedWeekIndex * CALENDAR_ROW_HEIGHT * (1 - progress);

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 text-[13px] font-medium text-tt-muted">
        {dow.map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div
        style={{ height: `${containerHeight}px` }}
        className={`overflow-hidden ${isDragging ? '' : 'transition-[height] duration-200 ease-out'}`}
      >
        <div
          style={{ transform: `translateY(${gridTranslateY}px)` }}
          className={`grid grid-cols-7 ${isDragging ? '' : 'transition-transform duration-200 ease-out'}`}
        >
          {monthGrid.map((cell, idx) => {
            const rowIdx = Math.floor(idx / 7);
            const selected = focusStr === cell.dateStr;
            const isToday = cell.dateStr === todayStr;
            const hasTasks = dueDateSet.has(cell.dateStr);
            const muted = (progress > 0.05 || rowIdx !== selectedWeekIndex) && !cell.inCurrentMonth;
            return (
              <button
                key={cell.dateStr}
                type="button"
                style={{ height: `${CALENDAR_ROW_HEIGHT}px` }}
                onClick={() => {
                  onSelectDate(cell.dateStr);
                  if (
                    cell.date.getFullYear() !== year ||
                    cell.date.getMonth() !== monthIndex
                  ) {
                    onMonthChange(cell.date.getFullYear(), cell.date.getMonth());
                  }
                }}
                className="flex flex-col items-center justify-center rounded-xl hover:bg-tt-sidebar/60 transition-colors"
              >
                <span
                  className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-[15px] leading-none font-semibold transition-colors ${
                    selected
                      ? 'bg-tt-blue text-white'
                      : isToday
                        ? 'text-tt-blue font-bold'
                        : muted
                          ? 'text-tt-muted'
                          : 'text-tt-text'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                <span
                  className={`w-1 h-1 rounded-full -mt-1 ${
                    hasTasks
                      ? muted
                        ? 'bg-tt-muted'
                        : 'bg-tt-blue'
                      : 'opacity-0'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      <button
        type="button"
        onClick={() => onToggleExpanded()}
        aria-label={expanded ? 'Collapse calendar' : 'Expand calendar'}
        className="w-full flex justify-center pt-1.5 pb-1 cursor-pointer group"
      >
        <span className="w-9 h-1 rounded-full bg-tt-border group-hover:bg-tt-muted transition-colors" />
      </button>
    </div>
  );
}
