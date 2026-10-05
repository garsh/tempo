import { useMemo } from 'react';
import type { Task } from '../types/task';
import { buildAgenda } from '../domain/calendar';
import { formatDueLabel } from '../domain/recurrence';

interface CalendarAgendaViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string | null;
  dayCount?: number;
}

export function CalendarAgendaView({
  tasks,
  onSelectTask,
  selectedTaskId,
  dayCount = 14,
}: CalendarAgendaViewProps) {
  const agenda = useMemo(() => buildAgenda(tasks, new Date(), dayCount, false), [tasks, dayCount]);

  if (agenda.length === 0) {
    return (
      <div className="py-16 text-center border border-dashed border-tt-border rounded-3xl bg-tt-sidebar">
        <p className="text-sm font-semibold text-tt-text/80">Nothing on the agenda</p>
        <p className="text-xs text-tt-muted mt-1">Tasks with due dates will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-tt-text">Agenda</h2>
      {agenda.map((day) => (
        <div key={day.dateStr} className="space-y-2">
          <div
            className={`text-xs font-bold uppercase tracking-wider px-1 ${
              day.dateStr === 'overdue' ? 'text-rose-400' : 'text-tt-muted'
            }`}
          >
            {day.dateStr === 'overdue'
              ? 'Overdue'
              : day.date.toLocaleDateString(undefined, {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric',
                })}
          </div>
          <div className="space-y-1.5">
            {day.tasks.length === 0 ? (
              <div className="text-xs text-slate-600 px-2 py-2">No tasks</div>
            ) : (
              day.tasks.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTask(t)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                    selectedTaskId === t.id
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-tt-border bg-tt-sidebar hover:border-tt-border'
                  }`}
                >
                  <div className="text-sm font-semibold text-tt-text truncate">{t.title}</div>
                  <div className="text-[11px] text-tt-muted mt-0.5">
                    {t.dueAt ? formatDueLabel(t.dueAt) : ''}
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
