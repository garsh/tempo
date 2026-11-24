import { useRef, type FC } from 'react';
import { SkipForward, X, ArrowRight, AlertCircle } from 'lucide-react';
import type { Task } from '../../types/task';
import {
  formatDate,
  formatDueLabel,
  getDueDatePart,
  getSkipOccurrenceDate,
  isFixedRecurring,
} from '../../domain/recurrence';
import { ModalDialog } from '../ui/ModalDialog';

interface SkipOccurrenceDialogProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onConfirm: (task: Task, dateToSkip: string) => Promise<void> | void;
}

export const SkipOccurrenceDialog: FC<SkipOccurrenceDialogProps> = ({
  isOpen,
  task,
  onClose,
  onConfirm,
}) => {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  if (!isOpen || !task) return null;

  const recurring = isFixedRecurring(task);
  const curDateStr = task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date());
  const nextOccurrenceDueAt = recurring ? getSkipOccurrenceDate(task, curDateStr) : null;

  const currentLabel = task.dueAt ? formatDueLabel(task.dueAt) : formatDueLabel(curDateStr);
  const nextLabel = nextOccurrenceDueAt ? formatDueLabel(nextOccurrenceDueAt) : 'End of recurrence';

  const handleConfirm = async () => {
    await onConfirm(task, curDateStr);
    onClose();
  };

  return (
    <ModalDialog
      open={true}
      onClose={onClose}
      ariaLabelledBy="skip-dialog-title"
      initialFocusRef={cancelBtnRef}
      className="m-auto p-0 w-[min(calc(100dvw-2rem),32rem)] max-w-none max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl text-tt-text"
    >
      <div className="p-6 sm:p-8 compact-landscape:p-4 space-y-6 compact-landscape:space-y-3">
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
            className="p-2 rounded-xl text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        {recurring ? (
          <div className="space-y-5">
            <p className="text-[18px] sm:text-[19px] text-tt-text leading-relaxed">
              Skip the scheduled occurrence for{' '}
              <span className="font-bold text-tt-text">&ldquo;{task.title}&rdquo;</span>? The task will advance to the next occurrence without being marked as completed.
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
            ref={cancelBtnRef}
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-[17px] sm:text-[18px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors cursor-pointer"
          >
            Cancel
          </button>
          {recurring && (
            <button
              type="button"
              onClick={handleConfirm}
              className="px-7 py-3 text-[17px] sm:text-[18px] font-bold bg-blue-600 hover:bg-blue-700 text-white rounded-2xl shadow-lg transition-colors active:scale-95 cursor-pointer"
            >
              Skip Occurrence
            </button>
          )}
        </div>
      </div>
    </ModalDialog>
  );
};

export default SkipOccurrenceDialog;
