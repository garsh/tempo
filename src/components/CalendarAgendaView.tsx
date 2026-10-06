import { useMemo } from 'react';
import type { Task } from '../types/task';
import { tasksDueOnDate } from '../domain/calendar';
import {
  formatDate,
  hasDueTime,
  isCompleted,
  splitDueAt,
} from '../domain/recurrence';
import { Check } from 'lucide-react';

interface CalendarAgendaViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string | null;
  /** Focus day for the day-timeline (YYYY-MM-DD). Defaults to today. */
  selectedDateStr?: string | null;
  onSelectDate?: (dateStr: string) => void;
  dayCount?: number;
}

function weekAround(centerStr: string): { dateStr: string; date: Date; label: string; dayNum: number }[] {
  const [y, m, d] = centerStr.split('-').map(Number);
  const center = new Date(y, m - 1, d);
  // Start Monday of that week
  const dow = center.getDay();
  const mondayOffset = dow === 0 ? -6 : 1 - dow;
  const monday = new Date(center);
  monday.setDate(center.getDate() + mondayOffset);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    days.push({
      dateStr: formatDate(dt),
      date: dt,
      label: names[dt.getDay()],
      dayNum: dt.getDate(),
    });
  }
  return days;
}

function timeLabel(dueAt: string | null | undefined): string {
  if (!dueAt || !hasDueTime(dueAt)) return 'All day';
  return splitDueAt(dueAt).time || 'All day';
}

/**
 * TickTick-like day agenda: week strip + vertical timeline for the selected day.
 */
export function CalendarAgendaView({
  tasks,
  onSelectTask,
  selectedTaskId,
  selectedDateStr,
  onSelectDate,
}: CalendarAgendaViewProps) {
  const todayStr = formatDate(new Date());
  const focus = selectedDateStr || todayStr;
  const week = useMemo(() => weekAround(focus), [focus]);

  const dayTasks = useMemo(() => {
    const due = tasksDueOnDate(tasks, focus);
    // Include completed that were due this day for timeline checkmarks
    const completedToday = tasks.filter((t) => {
      if (t.deletedAt || !isCompleted(t) || !t.dueAt) return false;
      return t.dueAt.startsWith(focus);
    });
    const map = new Map<string, Task>();
    for (const t of [...due, ...completedToday]) map.set(t.id, t);
    return [...map.values()].sort((a, b) => {
      const at = a.dueAt && hasDueTime(a.dueAt) ? a.dueAt : `${focus}T99:99`;
      const bt = b.dueAt && hasDueTime(b.dueAt) ? b.dueAt : `${focus}T99:99`;
      return at.localeCompare(bt);
    });
  }, [tasks, focus]);

  const focusDate = useMemo(() => {
    const [y, m, d] = focus.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [focus]);

  const headerLabel = focusDate.toLocaleDateString(undefined, { month: 'short' });
  const isToday = focus === todayStr;

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-tt-text">
        {headerLabel}
        {isToday ? ', Today' : ''}
      </h2>

      <div className="flex items-center justify-between gap-1 px-1">
        {week.map((d) => {
          const active = d.dateStr === focus;
          const today = d.dateStr === todayStr;
          return (
            <button
              key={d.dateStr}
              type="button"
              onClick={() => onSelectDate?.(d.dateStr)}
              className="flex-1 flex flex-col items-center gap-1 py-1 rounded-xl hover:bg-tt-sidebar"
            >
              <span className="text-[10px] font-medium text-tt-muted">{d.label}</span>
              <span
                className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-semibold ${
                  active || today
                    ? 'bg-tt-blue text-white'
                    : 'text-tt-text'
                }`}
              >
                {d.dayNum}
              </span>
            </button>
          );
        })}
      </div>

      {dayTasks.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-tt-muted">Nothing scheduled</p>
          <p className="text-xs text-tt-muted mt-1">Tasks with due times show on the timeline.</p>
        </div>
      ) : (
        <div className="relative pl-2">
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-tt-border" />
          <div className="space-y-3">
            {dayTasks.map((t) => {
              const done = isCompleted(t);
              const selected = selectedTaskId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTask(t)}
                  className={`relative w-full flex gap-3 text-left ${selected ? '' : ''}`}
                >
                  <div className="w-10 shrink-0 text-[11px] text-tt-secondary tabular-nums pt-3 text-right pr-1">
                    {timeLabel(t.dueAt)}
                  </div>
                  <div
                    className={`mt-3 w-3.5 h-3.5 rounded-full border-2 shrink-0 z-[1] flex items-center justify-center ${
                      done
                        ? 'bg-tt-muted border-tt-muted text-white'
                        : 'bg-tt-elevated border-tt-border'
                    }`}
                  >
                    {done && <Check className="w-2 h-2 stroke-[3]" />}
                  </div>
                  <div
                    className={`flex-1 rounded-xl border px-3 py-2.5 transition-colors ${
                      selected
                        ? 'border-tt-blue bg-tt-blue-soft/40'
                        : 'border-tt-border bg-tt-elevated hover:bg-tt-sidebar/50'
                    } ${done ? 'opacity-60' : ''}`}
                  >
                    <div className={`text-[12px] font-medium text-tt-blue mb-0.5`}>
                      {timeLabel(t.dueAt)}
                      {hasDueTime(t.dueAt || '') ? '' : ''}
                    </div>
                    <div
                      className={`text-[15px] font-semibold ${
                        done ? 'text-tt-secondary line-through' : 'text-tt-text'
                      }`}
                    >
                      {t.title}
                    </div>
                    {t.notes && (
                      <div className="text-xs text-tt-muted mt-0.5 line-clamp-1">{t.notes}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
