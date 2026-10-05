import type { Task } from '../types/task';
import {
  formatDueLabel,
  formatRecurrenceLabel,
  isCompleted,
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

export function TaskDetailPane({
  task,
  listName,
  onClose,
  onComplete,
  onEdit,
  onDelete,
  onToggleSubtask,
}: TaskDetailPaneProps) {
  if (!task) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-center p-8 bg-tt-surface">
        <div className="relative mb-4">
          <Sparkles className="w-16 h-16 text-tt-border" strokeWidth={1} />
        </div>
        <p className="text-sm text-tt-muted">Select a task to see details</p>
      </div>
    );
  }

  const completed = isCompleted(task);
  const progress = subtaskProgress(task.subtasks);
  const checkColor = priorityCheckboxColor(task.priority);

  return (
    <div className="h-full flex flex-col bg-tt-surface">
      <div className="flex items-center gap-3 px-4 py-3 border-b border-tt-border">
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

        <button
          type="button"
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-tt-sidebar text-xs font-medium text-tt-text border border-tt-border"
          onClick={() => onEdit(task)}
          title="Edit due date"
        >
          {task.dueAt ? formatDueLabel(task.dueAt) : 'No date'}
        </button>

        <div className="flex-1" />

        <Flag
          className="w-4 h-4"
          style={{ color: checkColor === TT.priority.none ? TT.textMuted : checkColor }}
          fill={task.priority && task.priority !== 'none' ? checkColor : 'none'}
        />

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

        {task.recurrence && (
          <p className="text-xs text-tt-secondary">
            Repeats · {formatRecurrenceLabel(task.recurrence)}
          </p>
        )}

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
          title="Edit"
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
