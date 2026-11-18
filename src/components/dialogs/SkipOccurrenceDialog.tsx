import React, { useEffect } from 'react';
import { SkipForward, X, ArrowRight, AlertCircle } from 'lucide-react';
import type { Task } from '../../types/task';
import {
  formatDate,
  formatDueLabel,
  getDueDatePart,
  getSkipOccurrenceDate,
  isRecurring,
} from '../../domain/recurrence';
import { usePrefs } from '../../prefs/prefs';

interface SkipOccurrenceDialogProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onConfirm: (task: Task, dateToSkip: string) => Promise<void> | void;
}

export const SkipOccurrenceDialog: React.FC<SkipOccurrenceDialogProps> = ({
  isOpen,
  task,
  onClose,
  onConfirm,
}) => {
  const [{ timeFormat }] = usePrefs();

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;

  const recurring = isRecurring(task);
  const curDateStr = task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date());
  const nextOccurrenceDueAt = recurring ? getSkipOccurrenceDate(task, curDateStr) : null;

  const currentLabel = task.dueAt ? formatDueLabel(task.dueAt, timeFormat) : formatDueLabel(curDateStr, timeFormat);
  const nextLabel = nextOccurrenceDueAt ? formatDueLabel(nextOccurrenceDueAt, timeFormat) : 'End of recurrence';

  const handleConfirm = async () => {
    await onConfirm(task, curDateStr);
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="skip-dialog-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden text-tt-text space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-tt-border">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-3 rounded-2xl bg-blue-500/15 text-blue-500 shrink-0">
              <SkipForward className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <h2 id="skip-dialog-title" className="text-xl sm:text-2xl font-bold text-tt-text truncate">
                Skip Occurrence
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
        {recurring ? (
          <div className="space-y-5">
            <p className="text-[18px] sm:text-[19px] text-tt-text leading-relaxed">
              Skip the scheduled occurrence for{' '}
              <span className="font-bold text-tt-text">"{task.title}"</span>? The task will advance to the next occurrence without being marked as completed.
            </p>

            {/* Date transition card */}
            <div className="flex items-center justify-between p-4 sm:p-5 rounded-2xl bg-tt-sidebar border border-tt-border">
              <div className="text-center flex-1">
                <span className="block text-xs sm:text-sm uppercase font-bold text-tt-muted tracking-wider mb-1">
                  Current
                </span>
                <span className="text-[18px] sm:text-[20px] font-bold text-tt-text block truncate">
                  {currentLabel}
                </span>
              </div>
              <ArrowRight className="w-6 h-6 text-tt-muted mx-3 shrink-0" />
              <div className="text-center flex-1">
                <span className="block text-xs sm:text-sm uppercase font-bold text-tt-muted tracking-wider mb-1">
                  Next
                </span>
                <span className="text-[18px] sm:text-[20px] font-bold text-tt-blue block truncate">
                  {nextLabel}
                </span>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400">
              <AlertCircle className="w-6 h-6 shrink-0 mt-0.5" />
              <p className="text-[18px] sm:text-[19px] leading-relaxed">
                This task is not a recurring task. Skipping an occurrence only applies to repeated tasks.
              </p>
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-tt-border">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-[17px] sm:text-[18px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors"
          >
            Cancel
          </button>
          {recurring && (
            <button
              type="button"
              onClick={handleConfirm}
              className="px-7 py-3 text-[17px] sm:text-[18px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg transition-colors active:scale-95"
            >
              Skip Occurrence
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default SkipOccurrenceDialog;
