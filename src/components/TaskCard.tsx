import { useEffect, useRef, useState } from 'react';
import type { Task } from '../types/task';
import {
  formatClockTime,
  formatDueLabel,
  getDueDatePart,
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
  onComplete: (id: string, dateStr?: string) => void;
  onUncomplete?: (id: string, dateStr?: string) => void;
  onSelect?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  onTogglePin?: (id: string) => void;
  onToggleSubtask?: (taskId: string, subtaskId: string) => void;
  /** ⋮ › Show Details: notes + subtask preview under the title. */
  showDetails?: boolean;
  /** ⋮ › Select: rows toggle selection instead of opening / completing. */
  selectMode?: boolean;
  checked?: boolean;
  onToggleCheck?: (id: string) => void;
  /** Long-press drag-to-reorder support. */
  reorderEnabled?: boolean;
  isDragging?: boolean;
  isSettling?: boolean;
  isDragActive?: boolean;
  dragOffsetY?: number;
  shiftY?: number;
  rowRef?: (el: HTMLDivElement | null) => void;
  onRowPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRowClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
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
  onUncomplete,
  onSelect,
  onEdit,
  showDetails = false,
  selectMode = false,
  checked = false,
  onToggleCheck,
  reorderEnabled = false,
  isDragging = false,
  isSettling = false,
  isDragActive = false,
  dragOffsetY = 0,
  shiftY = 0,
  rowRef,
  onRowPointerDown,
  onRowClickCapture,
  onRowContextMenu,
}) => {
  const [{ timeFormat }] = usePrefs();
  const [pendingSnapshot, setPendingSnapshot] = useState<{
    id: string;
    dueAt?: string | null;
    completedAt?: number | null;
    updatedAt: number;
  } | null>(null);
  const completeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const completed = isCompleted(task);
  const taskChangedSinceClick =
    pendingSnapshot !== null &&
    (task.id !== pendingSnapshot.id ||
      task.dueAt !== pendingSnapshot.dueAt ||
      task.completedAt !== pendingSnapshot.completedAt ||
      task.updatedAt !== pendingSnapshot.updatedAt);
  const justCompleted = pendingSnapshot !== null && !taskChangedSinceClick;
  const recurring = isRecurring(task);
  const urgency = getTaskUrgency(task.dueAt);
  const borderColor = priorityCheckboxColor(task.priority);
  const dueLabel = formatRowDue(task.dueAt, timeFormat);
  const sub = task.subtasks?.length ? subtaskProgress(task.subtasks) : null;

  useEffect(() => {
    if (taskChangedSinceClick) {
      if (fallbackTimerRef.current) {
        clearTimeout(fallbackTimerRef.current);
        fallbackTimerRef.current = null;
      }
      setPendingSnapshot(null);
    }
  }, [taskChangedSinceClick]);

  useEffect(() => {
    return () => {
      if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
      if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    };
  }, []);

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (pendingSnapshot !== null && !taskChangedSinceClick) return;
    const dateStr = task.dueAt ? getDueDatePart(task.dueAt) : undefined;
    if (completed) {
      onUncomplete?.(task.id, dateStr);
      return;
    }
    setPendingSnapshot({
      id: task.id,
      dueAt: task.dueAt,
      completedAt: task.completedAt,
      updatedAt: task.updatedAt,
    });
    if (completeTimerRef.current) clearTimeout(completeTimerRef.current);
    if (fallbackTimerRef.current) clearTimeout(fallbackTimerRef.current);
    completeTimerRef.current = setTimeout(() => {
      completeTimerRef.current = null;
      onComplete(task.id, dateStr);
    }, 120);
    fallbackTimerRef.current = setTimeout(() => {
      fallbackTimerRef.current = null;
      setPendingSnapshot(null);
    }, 2500);
  };

  const rowPad = dense ? 'py-2.5 min-h-[44px]' : 'py-3 min-h-[50px]';
  const notesPreview = showDetails ? task.notes?.trim().split('\n').find((l) => l.trim()) : undefined;
  const subPreview = showDetails ? (task.subtasks ?? []).slice(0, 3) : [];
  const activate = () => (selectMode ? onToggleCheck?.(task.id) : onSelect?.(task));

  return (
    <div
      ref={rowRef}
      role="button"
      tabIndex={0}
      aria-pressed={selectMode ? checked : undefined}
      data-dragging={isDragging ? 'true' : undefined}
      onPointerDown={onRowPointerDown}
      onClickCapture={onRowClickCapture}
      onContextMenu={onRowContextMenu}
      onClick={activate}
      onDoubleClick={() => !selectMode && onEdit?.(task)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          activate();
        }
      }}
      style={
        isDragging
          ? {
              transform: `translateY(${dragOffsetY}px)`,
              transition: isSettling
                ? 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease'
                : 'none',
              touchAction: 'none',
            }
          : isDragActive
            ? {
                transform: `translateY(${shiftY}px)`,
                transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
              }
            : undefined
      }
      className={`group relative flex items-center gap-3 px-3 sm:px-4 border-b border-tt-border/80 cursor-pointer ${
        isDragging
          ? 'z-20 bg-tt-elevated/45 backdrop-blur-[1px] shadow-md ring-2 ring-tt-blue/60 rounded-xl opacity-60 select-none'
          : `transition-colors ${reorderEnabled ? 'select-none' : ''} ${
              selected || (selectMode && checked)
                ? 'bg-tt-blue-soft/70'
                : 'bg-transparent hover:bg-tt-hover'
            }`
      } ${rowPad} ${justCompleted ? 'opacity-50' : ''} ${completed ? 'opacity-60' : ''}`}
    >
      {selectMode ? (
        <span
          aria-hidden
          data-testid="select-check"
          className={`flex-shrink-0 w-[20px] h-[20px] rounded-full border-[1.5px] flex items-center justify-center ${
            checked ? 'bg-tt-blue border-tt-blue text-white' : 'border-tt-pri-none'
          }`}
        >
          {checked && <Check className="w-3 h-3 stroke-[3]" />}
        </span>
      ) : (
      <button
        type="button"
        onClick={handleCheck}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
        disabled={completed && !onUncomplete}
        title={completed ? 'Mark incomplete' : recurring ? 'Complete this occurrence' : 'Complete'}
        className="relative flex-shrink-0 w-[21px] h-[21px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors after:absolute after:-inset-2 after:content-['']"
        style={{
          borderColor: completed || justCompleted ? '#34C759' : borderColor,
          backgroundColor: completed || justCompleted ? '#34C759' : 'transparent',
          color: '#fff',
        }}
      >
        {(completed || justCompleted) && <Check className="w-3 h-3 stroke-[3]" />}
      </button>
      )}

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          {task.pinned && (
            <Pin className="w-3 h-3 text-tt-pri-med flex-shrink-0 fill-tt-pri-med/40" />
          )}
          <span
            className={`text-[19px] leading-snug truncate ${
              completed ? 'text-tt-secondary line-through' : 'text-tt-text'
            }`}
          >
            {task.title}
          </span>
        </div>
        {notesPreview && (
          <p className="mt-0.5 text-[13px] leading-snug text-tt-secondary truncate" data-testid="task-notes-preview">
            {notesPreview}
          </p>
        )}
        {subPreview.length > 0 && (
          <ul className="mt-1 space-y-0.5" data-testid="task-subtask-preview">
            {subPreview.map((st) => (
              <li key={st.id} className="flex items-center gap-1.5 text-[13px] text-tt-secondary min-w-0">
                <span
                  className={`w-[11px] h-[11px] rounded-[3px] border flex-shrink-0 ${
                    st.completed ? 'bg-tt-muted border-tt-muted' : 'border-tt-muted'
                  }`}
                />
                <span className={`truncate ${st.completed ? 'line-through' : ''}`}>{st.title}</span>
              </li>
            ))}
            {(task.subtasks?.length ?? 0) > 3 && (
              <li className="text-[12px] text-tt-muted pl-[17px]">+{(task.subtasks?.length ?? 0) - 3} more</li>
            )}
          </ul>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-[15px]">
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
