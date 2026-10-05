import { useEffect, useRef, useState } from 'react';
import type { RecurrenceRule, Task, TaskPriority } from '../types/task';
import {
  combineDueAt,
  formatDate,
  formatDueLabel,
  formatRecurrenceLabel,
  hasDueTime,
  isCompleted,
  splitDueAt,
  subtaskProgress,
} from '../domain/recurrence';
import { priorityCheckboxColor, TT } from '../theme/ticktick';
import {
  X,
  Check,
  Edit2,
  Trash2,
  Flag,
  List as ListIcon,
  Sparkles,
  Bell,
  RefreshCw,
  Calendar,
  Pin,
} from 'lucide-react';

type TaskPatch = Partial<{
  dueAt: string | null;
  priority: TaskPriority;
  recurrence: RecurrenceRule | null;
  notes: string;
  title: string;
  pinned: boolean;
}>;

interface TaskDetailPaneProps {
  task: Task | null;
  listName?: string;
  onClose: () => void;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
  onPatch?: (id: string, patch: TaskPatch) => void;
}

const PRIORITY_CYCLE: TaskPriority[] = ['none', 'low', 'medium', 'high'];

function shiftDate(base: Date, days: number): string {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return formatDate(d);
}

export function TaskDetailPane({
  task,
  listName,
  onClose,
  onComplete,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleSubtask,
  onPatch,
}: TaskDetailPaneProps) {
  const [dateOpen, setDateOpen] = useState(false);
  const [remindOpen, setRemindOpen] = useState(false);
  const [repeatOpen, setRepeatOpen] = useState(false);
  const dateRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDateOpen(false);
    setRemindOpen(false);
    setRepeatOpen(false);
  }, [task?.id]);

  useEffect(() => {
    if (!dateOpen && !remindOpen && !repeatOpen) return;
    const onDoc = (e: MouseEvent) => {
      if (dateRef.current && !dateRef.current.contains(e.target as Node)) {
        setDateOpen(false);
        setRemindOpen(false);
        setRepeatOpen(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [dateOpen, remindOpen, repeatOpen]);

  if (!task) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-tt-surface">
        <svg
          width="120"
          height="100"
          viewBox="0 0 120 100"
          className="mb-4 text-tt-border"
          aria-hidden
        >
          <rect x="28" y="18" width="64" height="72" rx="8" fill="currentColor" opacity="0.25" />
          <rect x="38" y="30" width="44" height="6" rx="3" fill="currentColor" opacity="0.45" />
          <rect x="38" y="44" width="36" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
          <rect x="38" y="56" width="40" height="5" rx="2.5" fill="currentColor" opacity="0.35" />
          <circle cx="90" cy="78" r="10" fill="#E8EEFE" />
          <path d="M86 78h8M90 74v8" stroke="#4772FA" strokeWidth="2" strokeLinecap="round" />
          <Sparkles className="hidden" />
        </svg>
        <p className="text-sm text-tt-muted">Select a task to see details</p>
      </div>
    );
  }

  const completed = isCompleted(task);
  const progress = subtaskProgress(task.subtasks);
  const checkColor = priorityCheckboxColor(task.priority);
  const patch = (p: TaskPatch) => onPatch?.(task.id, p);

  const setDuePreset = (days: number | null) => {
    if (days === null) {
      patch({ dueAt: null });
    } else {
      const date = shiftDate(new Date(), days);
      const time = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;
      patch({ dueAt: combineDueAt(date, time) });
    }
    setDateOpen(false);
  };

  const setTime = (time: string | null) => {
    const date =
      task.dueAt && splitDueAt(task.dueAt).date
        ? splitDueAt(task.dueAt).date
        : formatDate(new Date());
    patch({ dueAt: combineDueAt(date, time) });
    setRemindOpen(false);
  };

  const cyclePriority = () => {
    const cur = task.priority ?? 'none';
    const idx = PRIORITY_CYCLE.indexOf(cur);
    const next = PRIORITY_CYCLE[(idx + 1) % PRIORITY_CYCLE.length];
    patch({ priority: next });
  };

  const setRepeat = (rule: RecurrenceRule | null) => {
    patch({ recurrence: rule });
    setRepeatOpen(false);
  };

  return (
    <div className="h-full flex flex-col bg-tt-surface" ref={dateRef}>
      <div className="flex items-center gap-2 px-4 py-3 border-b border-tt-border flex-wrap">
        <button
          type="button"
          onClick={() => !completed && onComplete(task.id)}
          disabled={completed}
          className="w-5 h-5 rounded-[5px] border-[1.5px] flex items-center justify-center flex-shrink-0"
          style={{
            borderColor: completed ? '#34C759' : checkColor,
            backgroundColor: completed ? '#34C759' : 'transparent',
            color: '#fff',
          }}
        >
          {completed && <Check className="w-3 h-3 stroke-[3]" />}
        </button>

        <div className="relative">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tt-blue-soft text-xs font-semibold text-tt-blue"
            onClick={() => {
              setDateOpen((v) => !v);
              setRemindOpen(false);
              setRepeatOpen(false);
            }}
            title="Due date"
          >
            <Calendar className="w-3 h-3" />
            {task.dueAt ? formatDueLabel(task.dueAt) : 'Set date'}
          </button>
          {dateOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-52 rounded-xl border border-tt-border bg-white shadow-lg p-2 space-y-0.5">
              {[
                ['Today', 0],
                ['Tomorrow', 1],
                ['Next week', 7],
              ].map(([label, days]) => (
                <button
                  key={String(label)}
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar text-tt-text"
                  onClick={() => setDuePreset(days as number)}
                >
                  {label}
                </button>
              ))}
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar text-tt-overdue"
                onClick={() => setDuePreset(null)}
              >
                Clear date
              </button>
              <label className="block px-2.5 py-1.5 text-[11px] text-tt-muted">
                Custom
                <input
                  type="date"
                  className="mt-1 w-full text-xs border border-tt-border rounded-lg px-2 py-1"
                  value={task.dueAt ? splitDueAt(task.dueAt).date : ''}
                  onChange={(e) => {
                    if (!e.target.value) return;
                    const time =
                      task.dueAt && hasDueTime(task.dueAt)
                        ? splitDueAt(task.dueAt).time
                        : null;
                    patch({ dueAt: combineDueAt(e.target.value, time) });
                    setDateOpen(false);
                  }}
                />
              </label>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            className={`p-1.5 rounded-lg ${
              task.dueAt && hasDueTime(task.dueAt)
                ? 'text-tt-blue bg-tt-blue-soft'
                : 'text-tt-secondary hover:bg-tt-sidebar'
            }`}
            title="Reminder / time"
            onClick={() => {
              setRemindOpen((v) => !v);
              setDateOpen(false);
              setRepeatOpen(false);
            }}
          >
            <Bell className="w-4 h-4" />
          </button>
          {remindOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-44 rounded-xl border border-tt-border bg-white shadow-lg p-2 space-y-0.5">
              {['09:00', '12:00', '17:00', '20:00'].map((t) => (
                <button
                  key={t}
                  type="button"
                  className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar"
                  onClick={() => setTime(t)}
                >
                  {t}
                </button>
              ))}
              <label className="block px-2.5 py-1.5 text-[11px] text-tt-muted">
                Custom
                <input
                  type="time"
                  className="mt-1 w-full text-xs border border-tt-border rounded-lg px-2 py-1"
                  value={
                    task.dueAt && hasDueTime(task.dueAt)
                      ? splitDueAt(task.dueAt).time || ''
                      : ''
                  }
                  onChange={(e) => setTime(e.target.value || null)}
                />
              </label>
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-tt-overdue hover:bg-tt-sidebar"
                onClick={() => setTime(null)}
              >
                Clear time
              </button>
            </div>
          )}
        </div>

        <div className="relative">
          <button
            type="button"
            className={`p-1.5 rounded-lg ${
              task.recurrence
                ? 'text-tt-blue bg-tt-blue-soft'
                : 'text-tt-secondary hover:bg-tt-sidebar'
            }`}
            title="Repeat"
            onClick={() => {
              setRepeatOpen((v) => !v);
              setDateOpen(false);
              setRemindOpen(false);
            }}
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          {repeatOpen && (
            <div className="absolute left-0 top-full mt-1 z-20 w-48 rounded-xl border border-tt-border bg-white shadow-lg p-2 space-y-0.5">
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar"
                onClick={() =>
                  setRepeat({
                    type: 'fixed_interval',
                    intervalValue: 1,
                    intervalUnit: 'days',
                  })
                }
              >
                Every day
              </button>
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar"
                onClick={() =>
                  setRepeat({
                    type: 'fixed_interval',
                    intervalValue: 1,
                    intervalUnit: 'weeks',
                  })
                }
              >
                Every week
              </button>
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-tt-sidebar"
                onClick={() =>
                  setRepeat({
                    type: 'after_completion',
                    intervalValue: 1,
                    intervalUnit: 'days',
                  })
                }
              >
                After completion (+1 day)
              </button>
              <button
                type="button"
                className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-tt-overdue hover:bg-tt-sidebar"
                onClick={() => setRepeat(null)}
              >
                Does not repeat
              </button>
            </div>
          )}
        </div>

        <div className="flex-1" />

        <button
          type="button"
          onClick={cyclePriority}
          className="p-1.5 rounded-lg hover:bg-tt-sidebar"
          title={`Priority: ${task.priority ?? 'none'} (click to cycle)`}
        >
          <Flag
            className="w-4 h-4"
            style={{
              color: checkColor === TT.priority.none ? TT.textMuted : checkColor,
            }}
            fill={task.priority && task.priority !== 'none' ? checkColor : 'none'}
          />
        </button>

        <button
          type="button"
          onClick={() => onTogglePin(task.id)}
          className={`p-1.5 rounded-lg hover:bg-tt-sidebar ${
            task.pinned ? 'text-tt-pri-med' : 'text-tt-secondary'
          }`}
          title={task.pinned ? 'Unpin' : 'Pin'}
        >
          <Pin className={`w-4 h-4 ${task.pinned ? 'fill-tt-pri-med/40' : ''}`} />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-tt-secondary hover:text-tt-text rounded-lg hover:bg-tt-sidebar xl:hidden"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <h2
          className={`text-xl font-semibold leading-snug ${
            completed ? 'text-tt-secondary line-through' : 'text-tt-text'
          }`}
        >
          {task.title}
        </h2>

        {task.recurrence && (
          <p className="text-xs text-tt-secondary inline-flex items-center gap-1">
            <RefreshCw className="w-3 h-3" />
            {formatRecurrenceLabel(task.recurrence)}
          </p>
        )}

        <div>
          <div className="text-[11px] font-medium text-tt-muted mb-1.5">Notes</div>
          {task.notes ? (
            <p className="text-sm text-tt-text/90 whitespace-pre-wrap leading-relaxed">
              {task.notes}
            </p>
          ) : (
            <button
              type="button"
              onClick={() => onEdit(task)}
              className="text-sm text-tt-muted hover:text-tt-blue"
            >
              Add notes…
            </button>
          )}
        </div>

        {task.subtasks && task.subtasks.length > 0 && (
          <div>
            <div className="text-[11px] font-medium text-tt-muted mb-2">
              Subtasks ({progress.done}/{progress.total})
            </div>
            <div className="space-y-1">
              {task.subtasks.map((st) => (
                <label
                  key={st.id}
                  className="flex items-center gap-2.5 text-sm text-tt-text cursor-pointer px-1 py-1.5 rounded-lg hover:bg-tt-sidebar"
                >
                  <input
                    type="checkbox"
                    checked={st.completed}
                    disabled={completed}
                    onChange={() => onToggleSubtask(task.id, st.id)}
                    className="rounded border-tt-border text-tt-blue focus:ring-tt-blue"
                  />
                  <span className={st.completed ? 'line-through text-tt-secondary' : ''}>
                    {st.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-tt-border flex items-center gap-2 flex-wrap">
        {listName && (
          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-tt-sidebar text-xs text-tt-secondary">
            <ListIcon className="w-3 h-3" />
            {listName}
          </span>
        )}
        {task.tags?.map((tag) => (
          <span
            key={tag}
            className="px-2 py-1 rounded-md bg-tt-blue-soft text-tt-blue text-xs font-medium"
          >
            {tag}
          </span>
        ))}
        <div className="flex-1" />
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="p-2 text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar rounded-lg"
          title="Full edit"
        >
          <Edit2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="p-2 text-tt-secondary hover:text-tt-overdue hover:bg-red-50 rounded-lg"
          title="Delete"
        >
          <Trash2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
