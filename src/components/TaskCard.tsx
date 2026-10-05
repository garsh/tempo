import { useState } from 'react';
import type { Task, TaskPriority } from '../types/task';
import {
  formatDueLabel,
  formatRecurrenceLabel,
  getDaysDifference,
  getTaskUrgency,
  hasDueTime,
  isCompleted,
  isRecurring,
  subtaskProgress,
} from '../domain/recurrence';
import {
  Check,
  Clock,
  Calendar,
  RefreshCw,
  MoreVertical,
  Edit2,
  Trash2,
  RotateCcw,
  List as ListIcon,
  Flag,
  Pin,
  CheckSquare,
} from 'lucide-react';

interface TaskCardProps {
  task: Task;
  listName?: string;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
}

const PRIORITY_STYLE: Record<
  TaskPriority,
  { label: string; className: string }
> = {
  high: {
    label: 'High',
    className: 'bg-rose-500/15 text-rose-400 border-rose-500/30',
  },
  medium: {
    label: 'Med',
    className: 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  },
  low: {
    label: 'Low',
    className: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  },
  none: {
    label: '',
    className: '',
  },
};

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  listName,
  onComplete,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleSubtask,
}) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const completed = isCompleted(task);
  const recurring = isRecurring(task);
  const urgency = getTaskUrgency(task.dueAt);
  const diffDays = task.dueAt ? getDaysDifference(task.dueAt) : 0;
  const priority = task.priority ?? 'none';

  const handleCheck = () => {
    if (completed) return;
    setJustCompleted(true);
    setTimeout(() => {
      onComplete(task.id);
      setJustCompleted(false);
    }, 300);
  };

  const getUrgencyBadge = () => {
    if (completed) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <Check className="w-3 h-3" />
          Completed
        </span>
      );
    }

    switch (urgency) {
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Clock className="w-3 h-3" />
            {task.dueAt && hasDueTime(task.dueAt) && diffDays === 0
              ? `Overdue · ${formatDueLabel(task.dueAt).split(' ').slice(1).join(' ')}`
              : `${Math.abs(diffDays)} ${Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue`}
          </span>
        );
      case 'due_today':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            {task.dueAt && hasDueTime(task.dueAt)
              ? `Today · ${formatDueLabel(task.dueAt).split(' ').slice(1).join(' ')}`
              : 'Due today'}
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Calendar className="w-3 h-3" />
            {formatDueLabel(task.dueAt) || `Due in ${diffDays}d`}
          </span>
        );
      case 'later':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Calendar className="w-3 h-3" />
            {formatDueLabel(task.dueAt)}
          </span>
        );
      default:
        return null;
    }
  };

  const lastCompletedDate =
    task.completionHistory.length > 0
      ? new Date(task.completionHistory[task.completionHistory.length - 1]).toLocaleDateString(
          undefined,
          { month: 'short', day: 'numeric' }
        )
      : null;

  const borderClass = completed
    ? 'border-slate-800 opacity-70'
    : urgency === 'overdue'
      ? 'border-rose-900/40 hover:border-rose-700/60 shadow-lg shadow-rose-950/20'
      : urgency === 'due_today'
        ? 'border-amber-900/40 hover:border-amber-700/60 shadow-lg shadow-amber-950/20'
        : 'border-slate-800 hover:border-slate-700';

  return (
    <div
      className={`relative group bg-slate-900/80 hover:bg-slate-900 border rounded-2xl p-4 sm:p-5 transition-all duration-200 ${borderClass} ${
        justCompleted ? 'scale-[0.98] opacity-60' : ''
      }`}
    >
      <div className="flex items-start gap-3.5">
        <button
          onClick={handleCheck}
          disabled={completed}
          title={
            completed
              ? 'Already completed'
              : recurring
                ? 'Mark complete for this period'
                : 'Mark complete'
          }
          className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            completed || justCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : urgency === 'overdue'
                ? 'border-rose-500/60 hover:bg-rose-500/20 text-transparent hover:text-rose-400'
                : urgency === 'due_today'
                  ? 'border-amber-500/60 hover:bg-amber-500/20 text-transparent hover:text-amber-400'
                  : 'border-slate-600 hover:border-indigo-400 hover:bg-indigo-500/10 text-transparent hover:text-indigo-400'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-1.5 min-w-0 pr-2">
              {task.pinned && (
                <Pin className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 fill-amber-400/30" />
              )}
              <h3
                className={`text-base font-semibold truncate ${
                  completed ? 'text-slate-400 line-through' : 'text-slate-100'
                }`}
              >
                {task.title}
              </h3>
            </div>

            <div className="relative flex items-center gap-0.5">
              {onTogglePin && (
                <button
                  onClick={() => onTogglePin(task.id)}
                  className={`p-1 rounded-lg transition-colors ${
                    task.pinned
                      ? 'text-amber-400 hover:bg-amber-500/10'
                      : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
                  }`}
                  title={task.pinned ? 'Unpin' : 'Pin'}
                >
                  <Pin className={`w-3.5 h-3.5 ${task.pinned ? 'fill-amber-400/40' : ''}`} />
                </button>
              )}
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                title="Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <div className="absolute right-0 mt-1 w-36 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 z-20">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(task);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700/60"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                      Edit task
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(task.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      Delete task
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {task.notes && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">{task.notes}</p>
          )}

          {task.subtasks && task.subtasks.length > 0 && (
            <div className="mt-2 space-y-1">
              {task.subtasks.map((st) => (
                <label
                  key={st.id}
                  className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={st.completed}
                    disabled={!onToggleSubtask || completed}
                    onChange={() => onToggleSubtask?.(task.id, st.id)}
                    className="rounded border-slate-600"
                  />
                  <span className={st.completed ? 'line-through text-slate-500' : ''}>
                    {st.title}
                  </span>
                </label>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            {getUrgencyBadge()}

            {priority !== 'none' && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${PRIORITY_STYLE[priority].className}`}
              >
                <Flag className="w-2.5 h-2.5" />
                {PRIORITY_STYLE[priority].label}
              </span>
            )}

            {task.subtasks && task.subtasks.length > 0 && (() => {
              const { done, total } = subtaskProgress(task.subtasks);
              return (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                  <CheckSquare className="w-2.5 h-2.5" />
                  {done}/{total}
                </span>
              );
            })()}

            {listName && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700">
                <ListIcon className="w-2.5 h-2.5" />
                {listName}
              </span>
            )}

            {task.recurrence && (
              <span
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                  task.recurrence.type === 'after_completion'
                    ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/40'
                    : 'bg-cyan-950/50 text-cyan-300 border-cyan-800/40'
                }`}
              >
                <RefreshCw className="w-2.5 h-2.5" />
                {formatRecurrenceLabel(task.recurrence)}
              </span>
            )}

            {task.tags?.map((tag) => (
              <span
                key={tag}
                className="inline-flex px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700/80 text-[11px]"
              >
                #{tag}
              </span>
            ))}

            {task.completionHistory.length > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                <RotateCcw className="w-3 h-3 text-slate-500" />
                Done {task.completionHistory.length}x
                {lastCompletedDate && ` (last ${lastCompletedDate})`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
