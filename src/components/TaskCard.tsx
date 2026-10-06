import { useState } from 'react';
import type { Task } from '../types/task';
import {
  formatClockTime,
  formatDueLabel,
  getTaskUrgency,
  hasDueTime,
  isCompleted,
  isRecurring,
  subtaskProgress,
  splitDueAt,
} from '../domain/recurrence';
import { priorityCheckboxColor } from '../theme/ticktick';
import {
  Check,
  RefreshCw,
  Bell,
  ListTree,
  Pin,
} from 'lucide-react';
import { usePrefs, type TimeFormat } from '../prefs/prefs';

interface TaskCardProps {
  task: Task;
  listName?: string;
  showListName?: boolean;
  selected?: boolean;
  dense?: boolean;
  onComplete: (id: string) => void;
  onSelect?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
}

function dueTextClass(urgency: string): string {
  if (urgency === 'overdue') return 'text-tt-overdue';
  if (urgency === 'due_today') return 'text-tt-blue';
  return 'text-tt-secondary';
}

function formatRowDue(dueAt: string | null | undefined, timeFormat: TimeFormat): string | null {
  if (!dueAt) return null;
  const urgency = getTaskUrgency(dueAt);
  if (urgency === 'due_today' && hasDueTime(dueAt)) {
    const t = splitDueAt(dueAt).time;
    return t ? formatClockTime(t, timeFormat) : 'Today';
  }
  if (urgency === 'due_today') return 'Today';
  if (urgency === 'overdue') {
    return formatDueLabel(dueAt, timeFormat) || 'Overdue';
  }
  return formatDueLabel(dueAt, timeFormat);
}

export const TaskCard: React.FC<TaskCardProps> = ({
  task,
  listName,
  showListName = true,
  selected = false,
  dense = false,
  onComplete,
  onSelect,
  onEdit,
}) => {
  const [{ timeFormat }] = usePrefs();
  const [justCompleted, setJustCompleted] = useState(false);
  const completed = isCompleted(task);
  const recurring = isRecurring(task);
  const urgency = getTaskUrgency(task.dueAt);
  const borderColor = priorityCheckboxColor(task.priority);
  const dueLabel = formatRowDue(task.dueAt, timeFormat);
  const sub = task.subtasks?.length ? subtaskProgress(task.subtasks) : null;

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (completed) return;
    setJustCompleted(true);
    setTimeout(() => {
      onComplete(task.id);
      setJustCompleted(false);
    }, 220);
  };

  const rowPad = dense ? 'py-2.5 min-h-[40px]' : 'py-3 min-h-[48px]';

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onSelect?.(task)}
      onDoubleClick={() => onEdit?.(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect?.(task);
        }
      }}
      className={`group relative flex items-center gap-3 px-3 sm:px-4 border-b border-tt-border/80 cursor-pointer transition-colors ${rowPad} ${
        selected ? 'bg-tt-blue-soft/70' : 'bg-transparent hover:bg-tt-hover'
      } ${justCompleted ? 'opacity-50' : ''} ${completed ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={handleCheck}
        disabled={completed}
        title={completed ? 'Completed' : recurring ? 'Complete this occurrence' : 'Complete'}
        className="flex-shrink-0 w-[18px] h-[18px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors"
        style={{
          borderColor: completed || justCompleted ? '#34C759' : borderColor,
          backgroundColor: completed || justCompleted ? '#34C759' : 'transparent',
          color: '#fff',
        }}
      >
        {(completed || justCompleted) && <Check className="w-3 h-3 stroke-[3]" />}
      </button>

      <div className="flex-1 min-w-0 flex items-center gap-2">
        {task.pinned && (
          <Pin className="w-3 h-3 text-tt-pri-med flex-shrink-0 fill-tt-pri-med/40" />
        )}
        <span
          className={`text-[15px] leading-snug truncate ${
            completed ? 'text-tt-secondary line-through' : 'text-tt-text'
          }`}
        >
          {task.title}
        </span>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-[12px]">
        {task.tags?.slice(0, 2).map((tag) => (
          <span
            key={tag}
            className="hidden sm:inline-flex px-1.5 py-0.5 rounded bg-tt-blue-soft text-tt-blue text-[11px] font-medium"
          >
            {tag}
          </span>
        ))}

        {showListName && listName && (
          <span className="hidden md:inline text-tt-secondary truncate max-w-[7rem]">
            {listName}
          </span>
        )}

        {recurring && (
          <span title="Repeats"><RefreshCw className="w-3 h-3 text-tt-muted" /></span>
        )}
        {sub && (
          <span
            className="inline-flex items-center gap-0.5 text-tt-muted"
            title={`${sub.done}/${sub.total} subtasks`}
          >
            <ListTree className="w-3 h-3" />
            <span className="text-[10px] tabular-nums">
              {sub.done}/{sub.total}
            </span>
          </span>
        )}
        {task.dueAt && hasDueTime(task.dueAt) && (
          <Bell className="w-3 h-3 text-tt-muted hidden sm:block" />
        )}

        {dueLabel && (
          <span className={`tabular-nums font-medium ${dueTextClass(urgency)}`}>
            {dueLabel}
          </span>
        )}
      </div>
    </div>
  );
};
