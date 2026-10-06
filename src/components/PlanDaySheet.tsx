import { useEffect } from 'react';
import { ArrowRight, X } from 'lucide-react';
import type { Task } from '../types/task';
import { formatDueLabel } from '../domain/recurrence';
import { planDaySuggestions } from '../domain/planDay';
import { priorityCheckboxColor } from '../theme/ticktick';
import { LightbulbIcon } from './shell/LightbulbIcon';
import { usePrefs } from '../prefs/prefs';

interface PlanDaySheetProps {
  isOpen: boolean;
  tasks: Task[];
  listNameById: Map<string, string>;
  onClose: () => void;
  onMoveToToday: (task: Task) => void;
  onAddTask: () => void;
}

/**
 * Today lightbulb → "Plan your day": overdue, upcoming (next 7 days) and undated
 * tasks, each pulled into Today with one tap (keeps any time of day).
 */
export function PlanDaySheet({
  isOpen,
  tasks,
  listNameById,
  onClose,
  onMoveToToday,
  onAddTask,
}: PlanDaySheetProps) {
  const [{ timeFormat }] = usePrefs();
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const { overdue, upcoming, noDate } = planDaySuggestions(tasks);
  const sections: { id: string; label: string; tone: string; tasks: Task[] }[] = [
    { id: 'overdue', label: 'Overdue', tone: 'text-tt-overdue', tasks: overdue },
    { id: 'upcoming', label: 'Next 7 days', tone: 'text-tt-secondary', tasks: upcoming },
    { id: 'nodate', label: 'No date', tone: 'text-tt-secondary', tasks: noDate },
  ].filter((s) => s.tasks.length > 0);

  return (
    <div className="fixed inset-0 z-[55] flex items-end sm:items-center justify-center bg-black/40" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plan-day-title"
        data-tempo-plan-day="1"
        className="w-full sm:max-w-md max-h-[78vh] flex flex-col bg-tt-elevated text-tt-text rounded-t-3xl sm:rounded-3xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-tt-border sm:hidden" />
        <div className="flex items-start gap-3 px-5 pt-3 pb-3">
          <span className="mt-0.5 w-9 h-9 rounded-full bg-tt-blue-soft text-tt-blue flex items-center justify-center shrink-0">
            <LightbulbIcon className="w-5 h-5" />
          </span>
          <div className="flex-1 min-w-0">
            <h2 id="plan-day-title" className="m-0 text-[17px] font-bold">Plan your day</h2>
            <p className="m-0 mt-0.5 text-[13px] text-tt-secondary">
              Tap <span className="font-semibold text-tt-blue">Today</span> to move a task into today.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 -mr-1.5 text-tt-secondary hover:text-tt-text rounded-lg hover:bg-tt-hover"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-2 pb-5">
          {sections.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="m-0 text-[15px] font-semibold">Nothing to plan yet</p>
              <p className="m-0 mt-1 text-[13px] text-tt-secondary">
                Overdue, upcoming and undated tasks will show up here.
              </p>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onAddTask();
                }}
                className="mt-4 px-4 py-2 rounded-xl bg-tt-blue hover:bg-tt-blue-hover text-white text-sm font-semibold"
              >
                Add a task
              </button>
            </div>
          ) : (
            sections.map((section) => (
              <div key={section.id} className="mb-2">
                <div className={`px-3 pt-2 pb-1 text-[11px] font-bold uppercase tracking-wide ${section.tone}`}>
                  {section.label} <span className="text-tt-muted font-medium">{section.tasks.length}</span>
                </div>
                {section.tasks.map((task) => {
                  const due = formatDueLabel(task.dueAt, timeFormat);
                  const list = listNameById.get(task.listId);
                  return (
                    <div key={task.id} className="flex items-center gap-3 px-3 py-2 rounded-xl hover:bg-tt-hover">
                      <span
                        className="w-[18px] h-[18px] rounded-[5px] border-2 shrink-0"
                        style={{ borderColor: priorityCheckboxColor(task.priority) }}
                        aria-hidden
                      />
                      <div className="flex-1 min-w-0">
                        <div className="text-[15px] truncate">{task.title}</div>
                        <div className="text-[12px] text-tt-secondary truncate">
                          {[due, list].filter(Boolean).join(' · ') || 'No date'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => onMoveToToday(task)}
                        aria-label={`Move "${task.title}" to today`}
                        className="shrink-0 inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-tt-blue-soft text-tt-blue text-[13px] font-semibold hover:bg-tt-blue hover:text-white transition-colors"
                      >
                        Today
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
