import type { Task } from '../types/task';
import {
  formatDueLabel,
  formatRecurrenceLabel,
  getTaskUrgency,
  isCompleted,
  subtaskProgress,
} from '../domain/recurrence';
import {
  X,
  Check,
  Edit2,
  Trash2,
  Pin,
  Flag,
  Calendar,
  RefreshCw,
  List as ListIcon,
  CheckSquare,
} from 'lucide-react';

interface TaskDetailPaneProps {
  task: Task | null;
  listName?: string;
  onClose: () => void;
  onComplete: (id: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleSubtask: (taskId: string, subtaskId: string) => void;
}

const PRIORITY_LABEL: Record<string, string> = {
  high: 'High',
  medium: 'Medium',
  low: 'Low',
  none: 'None',
};

export function TaskDetailPane({
  task,
  listName,
  onClose,
  onComplete,
  onEdit,
  onDelete,
  onTogglePin,
  onToggleSubtask,
}: TaskDetailPaneProps) {
  if (!task) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
        <ListIcon className="w-8 h-8 mb-3 opacity-40" />
        <p className="text-sm font-medium text-slate-400">No task selected</p>
        <p className="text-xs mt-1 max-w-[12rem]">
          Click a task to inspect details, or press <kbd className="px-1 rounded bg-slate-800 text-slate-300">j</kbd>/
          <kbd className="px-1 rounded bg-slate-800 text-slate-300">k</kbd> to move.
        </p>
      </div>
    );
  }

  const completed = isCompleted(task);
  const urgency = getTaskUrgency(task.dueAt);
  const progress = subtaskProgress(task.subtasks);

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-800">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 mb-1">
            {task.pinned && <Pin className="w-3.5 h-3.5 text-amber-400 fill-amber-400/30" />}
            <h2
              className={`text-base font-bold truncate ${
                completed ? 'text-slate-400 line-through' : 'text-slate-100'
              }`}
            >
              {task.title}
            </h2>
          </div>
          {listName && (
            <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
              <ListIcon className="w-3 h-3" />
              {listName}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          title="Close detail (Esc)"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {task.notes && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1">
              Notes
            </div>
            <p className="text-sm text-slate-300 whitespace-pre-wrap leading-relaxed">{task.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-500 mb-0.5 inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Due
            </div>
            <div className="text-slate-200 font-medium">
              {task.dueAt ? formatDueLabel(task.dueAt) : 'None'}
            </div>
            {urgency !== 'none' && (
              <div className="text-[10px] text-slate-500 mt-0.5 capitalize">
                {urgency.replace('_', ' ')}
              </div>
            )}
          </div>
          <div className="p-2.5 rounded-xl bg-slate-900/80 border border-slate-800">
            <div className="text-[10px] text-slate-500 mb-0.5 inline-flex items-center gap-1">
              <Flag className="w-3 h-3" /> Priority
            </div>
            <div className="text-slate-200 font-medium">
              {PRIORITY_LABEL[task.priority ?? 'none']}
            </div>
          </div>
        </div>

        {task.recurrence && (
          <div className="p-2.5 rounded-xl bg-indigo-950/30 border border-indigo-900/40 text-xs">
            <div className="text-[10px] text-indigo-400 mb-0.5 inline-flex items-center gap-1">
              <RefreshCw className="w-3 h-3" /> Recurrence
            </div>
            <div className="text-indigo-100">{formatRecurrenceLabel(task.recurrence)}</div>
          </div>
        )}

        {task.subtasks && task.subtasks.length > 0 && (
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-2 inline-flex items-center gap-1">
              <CheckSquare className="w-3 h-3" />
              Check items ({progress.done}/{progress.total})
            </div>
            <div className="space-y-1.5">
              {task.subtasks.map((st) => (
                <label
                  key={st.id}
                  className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer px-2 py-1.5 rounded-lg hover:bg-slate-900"
                >
                  <input
                    type="checkbox"
                    checked={st.completed}
                    disabled={completed}
                    onChange={() => onToggleSubtask(task.id, st.id)}
                    className="rounded border-slate-600"
                  />
                  <span className={st.completed ? 'line-through text-slate-500' : ''}>
                    {st.title}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {task.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-full text-[11px] bg-slate-800 text-slate-400 border border-slate-700"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}
      </div>

      <div className="px-4 py-3 border-t border-slate-800 flex flex-wrap gap-2">
        {!completed && (
          <button
            type="button"
            onClick={() => onComplete(task.id)}
            className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold"
            title="Complete (x)"
          >
            <Check className="w-3.5 h-3.5" />
            Complete
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          title="Edit (e)"
        >
          <Edit2 className="w-3.5 h-3.5" />
          Edit
        </button>
        <button
          type="button"
          onClick={() => onTogglePin(task.id)}
          className={`inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border ${
            task.pinned
              ? 'bg-amber-950/40 border-amber-500/40 text-amber-300'
              : 'bg-slate-800 border-slate-700 text-slate-300'
          }`}
        >
          <Pin className="w-3.5 h-3.5" />
        </button>
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 text-xs font-semibold border border-rose-900/40"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

