import { useMemo } from 'react';
import { MoreVertical, SlidersHorizontal } from 'lucide-react';
import type { Task } from '../types/task';
import { buildMonthGrid, shiftMonth, tasksDueOnDate, weekdayLabels } from '../domain/calendar';
import {
  calendarRowDueLabel,
  dayCardTitle,
  jumpToToday,
  monthName,
} from '../domain/calendarUi';
import { formatDate } from '../domain/recurrence';
import { usePrefs } from '../prefs/prefs';
import { CalendarTodayTip } from './calendar/CalendarTodayTip';
import { EmptyCalendarDay } from './calendar/EmptyCalendarDay';

interface CalendarMonthViewProps {
  tasks: Task[];
  year: number;
  monthIndex: number;
  selectedDateStr: string | null;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (dateStr: string) => void;
  onSelectTask: (task: Task) => void;
  onCompleteTask?: (id: string) => void;
  /** Filter icon — opens calendar list filter (optional). */
  onFilter?: () => void;
  /** View toggle — month ↔ agenda. */
  onToggleView?: () => void;
  /** ⋮ overflow (same menu as list views). */
  onMore?: (e: React.MouseEvent<HTMLElement>) => void;
  /** Compact TickTick mobile chrome (no chevron chrome). Default true on narrow layouts via CSS. */
  mobileChrome?: boolean;
}

/**
 * TickTick-style month calendar: month title + filter / view / ⋮ header, compact
 * day grid with a solid blue selected circle, and a day card below (empty state or
 * checkbox rows with a blue Today/date label).
 */
export function CalendarMonthView({
  tasks,
  year,
  monthIndex,
  selectedDateStr,
  onMonthChange,
  onSelectDate,
  onSelectTask,
  onCompleteTask,
  onFilter,
  onToggleView,
  onMore,
  mobileChrome = true,
}: CalendarMonthViewProps) {
  const [{ weekStart }] = usePrefs();
  const grid = useMemo(
    () => buildMonthGrid(year, monthIndex, new Date(), weekStart),
    [year, monthIndex, weekStart]
  );
  const dow = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const todayStr = formatDate(new Date());
  const selected = selectedDateStr || todayStr;
  const dayTasks = useMemo(() => tasksDueOnDate(tasks, selected), [tasks, selected]);

  const goToday = () => {
    const t = jumpToToday();
    onMonthChange(t.year, t.monthIndex);
    onSelectDate(t.dateStr);
  };

  const goMonth = (delta: number) => {
    const next = shiftMonth(year, monthIndex, delta);
    onMonthChange(next.year, next.monthIndex);
  };

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of tasks) {
      if (!t.dueAt || t.deletedAt) continue;
      // tasksDueOnDate already excludes completed; mirror that for dots
      const open = tasksDueOnDate([t], t.dueAt.slice(0, 10));
      if (!open.length) continue;
      const d = t.dueAt.slice(0, 10);
      map.set(d, (map.get(d) ?? 0) + 1);
    }
    return map;
  }, [tasks]);

  return (
    <div
      className="flex flex-col min-h-0 h-full"
      data-tempo-calendar-month="1"
      data-selected-day={selected}
    >
      {/* Header: month name | filter, view, ⋮ — tip bubble anchors here */}
      <div className={`relative shrink-0 ${mobileChrome ? 'px-1 pt-1' : 'px-0.5'}`}>
        <div className="flex items-center gap-1 min-h-[44px]">
          <button
            type="button"
            onClick={goToday}
            aria-label={`Go to today (${monthName(year, monthIndex)})`}
            title="Tap to go today"
            className={`flex-1 min-w-0 text-left font-bold text-tt-text truncate ${
              mobileChrome ? 'text-[22px] pl-3 tracking-[-0.02em]' : 'text-lg'
            }`}
          >
            {monthName(year, monthIndex)}
          </button>
          {!mobileChrome && (
            <>
              <button type="button" onClick={() => goMonth(-1)} className="p-1.5 rounded-lg text-tt-secondary hover:bg-tt-sidebar" aria-label="Previous month">
                ‹
              </button>
              <button type="button" onClick={goToday} className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-tt-blue hover:bg-tt-blue-soft">
                Today
              </button>
              <button type="button" onClick={() => goMonth(1)} className="p-1.5 rounded-lg text-tt-secondary hover:bg-tt-sidebar" aria-label="Next month">
                ›
              </button>
            </>
          )}
          {onFilter && (
            <button type="button" onClick={onFilter} aria-label="Filter" title="Filter" className="w-10 h-10 flex items-center justify-center text-tt-text">
              <SlidersHorizontal className="w-[20px] h-[20px]" strokeWidth={1.9} />
            </button>
          )}
          {onToggleView && (
            <button type="button" onClick={onToggleView} aria-label="Switch calendar view" title="Agenda" className="w-10 h-10 flex items-center justify-center text-tt-text">
              <ViewToggleIcon />
            </button>
          )}
          {onMore && (
            <button type="button" onClick={onMore} aria-label="More" title="More" aria-haspopup="menu" className="w-10 h-10 flex items-center justify-center text-tt-text">
              <MoreVertical className="w-5 h-5" strokeWidth={2.2} />
            </button>
          )}
        </div>
        {mobileChrome && <CalendarTodayTip onGoToday={goToday} />}
      </div>

      {/* Weekday headers */}
      <div className={`grid grid-cols-7 shrink-0 ${mobileChrome ? 'px-1 pt-1' : ''}`}>
        {dow.map((d) => (
          <div key={d} className="text-center text-[12px] font-medium text-tt-muted py-1.5">
            {d}
          </div>
        ))}
      </div>

      {/* Compact day grid — no borders; selected = solid blue circle */}
      <div className={`grid grid-cols-7 shrink-0 ${mobileChrome ? 'px-1' : 'border-t border-l border-tt-border'}`}>
        {grid.map((cell) => {
          const isSelected = selected === cell.dateStr;
          const n = counts.get(cell.dateStr) ?? 0;
          if (mobileChrome) {
            return (
              <button
                key={cell.dateStr}
                type="button"
                onClick={() => onSelectDate(cell.dateStr)}
                aria-label={cell.dateStr}
                aria-current={isSelected ? 'date' : undefined}
                className="flex flex-col items-center justify-center h-[44px] bg-transparent"
              >
                <span
                  className={`inline-flex w-[30px] h-[30px] items-center justify-center text-[14px] font-medium rounded-full ${
                    isSelected
                      ? 'bg-tt-blue text-white'
                      : cell.inCurrentMonth
                        ? 'text-tt-text'
                        : 'text-tt-muted/50'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
                <span className="h-[4px] mt-[1px] flex items-center gap-[2px]">
                  {n > 0 && !isSelected && (
                    <span className="w-[4px] h-[4px] rounded-full bg-tt-blue/70" />
                  )}
                </span>
              </button>
            );
          }
          // Desktop denser grid keeps pills
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              className={`min-h-[4.75rem] p-1 border-r border-b text-left border-tt-border ${
                !cell.inCurrentMonth ? 'opacity-35' : ''
              } ${isSelected ? 'bg-tt-blue-soft' : 'bg-tt-elevated hover:bg-tt-hover'}`}
            >
              <div className="flex justify-center mb-0.5">
                <span
                  className={`inline-flex w-6 h-6 items-center justify-center text-[12px] font-semibold rounded-full ${
                    isSelected ? 'bg-tt-blue text-white' : 'text-tt-text'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
              </div>
              <div className="space-y-0.5 px-0.5">
                {tasksDueOnDate(tasks, cell.dateStr)
                  .slice(0, 3)
                  .map((t) => (
                    <div
                      key={t.id}
                      className="truncate text-[9px] px-1 py-[1px] rounded bg-tt-blue-soft text-tt-blue font-medium"
                      title={t.title}
                    >
                      {t.title}
                    </div>
                  ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected-day card */}
      <div
        className={`flex-1 min-h-0 flex flex-col ${
          mobileChrome
            ? 'mt-1 mx-0 rounded-t-[16px] bg-tt-elevated shadow-[0_-2px_12px_var(--tt-shadow)]'
            : 'mt-3 border-t border-tt-border pt-2'
        }`}
        data-testid="calendar-day-card"
      >
        {mobileChrome && (
          <h3 className="shrink-0 px-4 pt-3.5 pb-1 text-[17px] font-bold text-tt-text">
            {dayCardTitle(selected, todayStr)}
          </h3>
        )}
        {dayTasks.length === 0 ? (
          <EmptyCalendarDay />
        ) : (
          <div className="flex-1 overflow-y-auto pb-20">
            {dayTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                onClick={() => onSelectTask(task)}
                className="w-full flex items-center gap-3 px-4 min-h-[44px] text-left hover:bg-tt-hover border-b border-tt-border/60"
              >
                <span
                  role="checkbox"
                  aria-checked={false}
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    onCompleteTask?.(task.id);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      onCompleteTask?.(task.id);
                    }
                  }}
                  className="w-[18px] h-[18px] rounded-[5px] border-[1.5px] border-tt-pri-none shrink-0"
                />
                <span className="flex-1 min-w-0 text-[15px] text-tt-text truncate">{task.title}</span>
                <span className="shrink-0 text-[13px] font-medium text-tt-blue tabular-nums">
                  {calendarRowDueLabel(task.dueAt, todayStr)}
                </span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** List/agenda-style glyph (TickTick view toggle). */
function ViewToggleIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
      <path d="M1 2.5h12M1 9h18M1 15.5h9" />
      <path d="M16 1.5v4M14 3.5h4" />
    </svg>
  );
}
