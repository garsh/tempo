import { useMemo } from 'react';
import type { Task } from '../types/task';
import { buildMonthGrid, monthLabel, shiftMonth, tasksDueOnDate } from '../domain/calendar';
import { ChevronLeft, ChevronRight } from 'lucide-react';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

interface CalendarMonthViewProps {
  tasks: Task[];
  year: number;
  monthIndex: number;
  selectedDateStr: string | null;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (dateStr: string) => void;
  onSelectTask: (task: Task) => void;
}

export function CalendarMonthView({
  tasks,
  year,
  monthIndex,
  selectedDateStr,
  onMonthChange,
  onSelectDate,
  onSelectTask,
}: CalendarMonthViewProps) {
  const grid = useMemo(() => buildMonthGrid(year, monthIndex), [year, monthIndex]);

  const go = (delta: number) => {
    const next = shiftMonth(year, monthIndex, delta);
    onMonthChange(next.year, next.monthIndex);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-tt-text">{monthLabel(year, monthIndex)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            className="p-1.5 rounded-lg border border-tt-border text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              onMonthChange(now.getFullYear(), now.getMonth());
            }}
            className="px-2.5 py-1.5 text-[11px] font-semibold rounded-lg border border-tt-border text-tt-secondary hover:text-tt-text"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="p-1.5 rounded-lg border border-tt-border text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] font-semibold uppercase tracking-wider text-tt-muted px-0.5">
        {DOW.map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((cell) => {
          const dayTasks = tasksDueOnDate(tasks, cell.dateStr);
          const selected = selectedDateStr === cell.dateStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              className={`min-h-[4.5rem] sm:min-h-[5.5rem] p-1 rounded-xl border text-left transition-colors ${
                selected
                  ? 'border-indigo-500 bg-indigo-950/40'
                  : cell.isToday
                    ? 'border-amber-700/50 bg-amber-950/20'
                    : 'border-tt-border/80 bg-tt-sidebar/40 hover:border-tt-border'
              } ${!cell.inCurrentMonth ? 'opacity-40' : ''}`}
            >
              <div
                className={`text-[11px] font-semibold mb-1 ${
                  cell.isToday ? 'text-amber-300' : 'text-tt-secondary'
                }`}
              >
                {cell.date.getDate()}
              </div>
              <div className="space-y-0.5">
                {dayTasks.slice(0, 3).map((t) => (
                  <div
                    key={t.id}
                    role="link"
                    tabIndex={0}
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTask(t);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.stopPropagation();
                        onSelectTask(t);
                      }
                    }}
                    className="truncate text-[10px] px-1 py-0.5 rounded bg-tt-blue/30 text-indigo-100 hover:bg-tt-blue/50 cursor-pointer"
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[9px] text-tt-muted px-1">+{dayTasks.length - 3} more</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
