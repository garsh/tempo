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
      <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
        <p className="text-sm font-semibold text-slate-300">Nothing on the agenda</p>
        <p className="text-xs text-slate-500 mt-1">Tasks with due dates will show up here.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold text-slate-100">Agenda</h2>
      {agenda.map((day) => (
        <div key={day.dateStr} className="space-y-2">
          <div
            className={`text-xs font-bold uppercase tracking-wider px-1 ${
              day.dateStr === 'overdue' ? 'text-rose-400' : 'text-slate-500'
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
                      : 'border-slate-800 bg-slate-900/60 hover:border-slate-700'
                  }`}
                >
                  <div className="text-sm font-semibold text-slate-100 truncate">{t.title}</div>
                  <div className="text-[11px] text-slate-500 mt-0.5">
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
