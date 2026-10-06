import { useMemo } from 'react';
import type { Task } from '../types/task';
import { buildMonthGrid, monthLabel, shiftMonth, tasksDueOnDate, weekdayLabels } from '../domain/calendar';
import { usePrefs } from '../prefs/prefs';
import { formatDate } from '../domain/recurrence';
import { pillColorForId } from '../theme/listColors';
import { ChevronLeft, ChevronRight } from 'lucide-react';

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
  const [{ weekStart }] = usePrefs();
  const grid = useMemo(
    () => buildMonthGrid(year, monthIndex, new Date(), weekStart),
    [year, monthIndex, weekStart]
  );
  const dow = useMemo(() => weekdayLabels(weekStart), [weekStart]);
  const todayStr = formatDate(new Date());

  const go = (delta: number) => {
    const next = shiftMonth(year, monthIndex, delta);
    onMonthChange(next.year, next.monthIndex);
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between px-0.5">
        <h2 className="text-lg font-bold text-tt-text">{monthLabel(year, monthIndex)}</h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            className="p-1.5 rounded-lg text-tt-secondary hover:bg-tt-sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={() => {
              const now = new Date();
              onMonthChange(now.getFullYear(), now.getMonth());
              onSelectDate(formatDate(now));
            }}
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg text-tt-blue hover:bg-tt-blue-soft"
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            className="p-1.5 rounded-lg text-tt-secondary hover:bg-tt-sidebar"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-7 text-[11px] font-medium text-tt-muted">
        {dow.map((d) => (
          <div key={d} className="text-center py-1.5">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 border-t border-l border-tt-border">
        {grid.map((cell) => {
          const dayTasks = tasksDueOnDate(tasks, cell.dateStr);
          const selected = selectedDateStr === cell.dateStr;
          const isToday = cell.dateStr === todayStr;
          return (
            <button
              key={cell.dateStr}
              type="button"
              onClick={() => onSelectDate(cell.dateStr)}
              className={`min-h-[4.75rem] sm:min-h-[5.75rem] p-1 border-r border-b text-left align-top transition-colors ${
                !cell.inCurrentMonth ? 'opacity-35' : ''
              } border-tt-border ${
                selected ? 'bg-tt-blue-soft' : 'bg-tt-elevated hover:bg-tt-hover'
              } ${isToday && selected ? 'shadow-[inset_0_0_0_2px_var(--tt-blue)]' : ''}`}
            >
              <div className="flex justify-center mb-0.5">
                <span
                  className={`inline-flex w-6 h-6 items-center justify-center text-[12px] font-semibold rounded-full ${
                    isToday
                      ? 'bg-tt-blue text-white'
                      : selected
                        ? 'text-tt-blue'
                        : 'text-tt-text'
                  }`}
                >
                  {cell.date.getDate()}
                </span>
              </div>
              <div className="space-y-0.5 px-0.5">
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
                    className="truncate text-[9px] sm:text-[10px] px-1 py-[1px] rounded font-medium text-[#1c1c1e] cursor-pointer leading-tight"
                    style={{ backgroundColor: pillColorForId(t.listId || t.id) }}
                    title={t.title}
                  >
                    {t.title}
                  </div>
                ))}
                {dayTasks.length > 3 && (
                  <div className="text-[9px] text-tt-muted px-0.5">+{dayTasks.length - 3}</div>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
