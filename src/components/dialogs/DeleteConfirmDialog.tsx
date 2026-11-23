import type React from 'react';
import { Trash2, X, AlertTriangle, PauseCircle } from 'lucide-react';
import type { Task } from '../../types/task';
import { isRecurring } from '../../domain/recurrence';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onConfirm: (taskId: string) => Promise<void> | void;
  onStopRepeating?: (task: Task) => Promise<void> | void;
}

export const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  task,
  onClose,
  onConfirm,
  onStopRepeating,
}) => {
  useEscapeKey(isOpen, onClose, { preventDefault: true });

  if (!isOpen || !task) return null;

  const recurring = isRecurring(task);
  const canStopRepeating = recurring && (task.completionHistory?.length ?? 0) > 0 && !!onStopRepeating;

  const handleConfirm = () => {
    const taskId = task.id;
    onClose();
    void onConfirm(taskId);
  };

  const handleStop = () => {
    const target = task;
    onClose();
    void onStopRepeating?.(target);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
      className="fixed inset-0 z-[65] flex items-center justify-center p-4 compact-landscape:p-2 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl p-6 sm:p-8 compact-landscape:p-4 text-tt-text space-y-6 compact-landscape:space-y-3">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-tt-border">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`p-3 rounded-2xl shrink-0 ${
                canStopRepeating ? 'bg-amber-500/15 text-amber-500' : 'bg-red-500/15 text-red-500'
              }`}
            >
              {canStopRepeating ? (
                <PauseCircle className="w-6 h-6 sm:w-7 sm:h-7" />
              ) : (
                <Trash2 className="w-6 h-6 sm:w-7 sm:h-7" />
              )}
            </div>
            <div className="min-w-0">
              <h2 id="delete-dialog-title" className="text-xl sm:text-2xl font-bold text-tt-text truncate">
                {canStopRepeating
                  ? 'Stop or Delete Routine?'
                  : recurring
                    ? 'Delete Recurring Task?'
                    : 'Delete Task?'}
              </h2>
              <p className="text-base sm:text-lg text-tt-secondary font-medium truncate" title={task.title}>
                {task.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-xl text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        {canStopRepeating ? (
          <div className="space-y-4">
            <p className="text-[17px] sm:text-[18px] text-tt-text leading-relaxed">
              <span className="font-bold text-tt-text">&ldquo;{task.title}&rdquo;</span> has{' '}
              {task.completionHistory.length}{' '}
              {task.completionHistory.length === 1 ? 'past completion' : 'past completions'}.
            </p>
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-tt-blue-soft/60 border border-tt-blue/25 text-tt-text">
              <PauseCircle className="w-6 h-6 text-tt-blue shrink-0 mt-0.5" />
              <p className="text-[15px] sm:text-[16px] leading-relaxed">
                <strong>Stop Repeating</strong> ends future occurrences while keeping your completed dates on the Calendar.{' '}
                <strong>Delete Everything</strong> removes the entire history permanently.
              </p>
            </div>
          </div>
        ) : recurring ? (
          <div className="space-y-4">
            <p className="text-[18px] sm:text-[19px] text-tt-text leading-relaxed">
              Are you sure you want to delete{' '}
              <span className="font-bold text-tt-text">&ldquo;{task.title}&rdquo;</span>?
            </p>
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-red-500/10 border border-red-500/25 text-red-600 dark:text-red-400">
              <AlertTriangle className="w-6 h-6 shrink-0 mt-0.5" />
              <p className="text-[17px] sm:text-[18px] font-semibold leading-relaxed">
                This is a recurring task. Deleting it will remove all scheduled occurrences.
              </p>
            </div>
          </div>
        ) : (
          <p className="text-[18px] sm:text-[19px] text-tt-text leading-relaxed">
            Are you sure you want to delete{' '}
            <span className="font-bold text-tt-text">&ldquo;{task.title}&rdquo;</span>? This task will be removed from your list.
          </p>
        )}

        {/* Actions */}
        {canStopRepeating ? (
          <div className="flex flex-wrap items-center justify-end gap-2.5 pt-4 border-t border-tt-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-[15px] sm:text-[16px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-4 py-2.5 text-[15px] sm:text-[16px] font-bold text-red-600 dark:text-red-400 bg-red-500/10 hover:bg-red-500/20 rounded-2xl transition-colors active:scale-95 cursor-pointer"
            >
              Delete Everything
            </button>
            <button
              type="button"
              onClick={handleStop}
              className="px-5 py-2.5 text-[15px] sm:text-[16px] font-bold bg-tt-blue hover:bg-tt-blue-hover text-white rounded-2xl shadow-lg transition-colors active:scale-95 cursor-pointer"
            >
              Stop Repeating (Keep History)
            </button>
          </div>
        ) : (
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-tt-border">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-3 text-[17px] sm:text-[18px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              className="px-7 py-3 text-[17px] sm:text-[18px] font-bold bg-red-600 hover:bg-red-700 text-white rounded-2xl shadow-lg transition-colors active:scale-95"
            >
              {recurring ? 'Delete All Occurrences' : 'Delete'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default DeleteConfirmDialog;
