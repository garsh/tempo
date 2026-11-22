import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Calendar, CalendarClock, RefreshCw, X } from 'lucide-react';
import type { Task } from '../../types/task';
import { isFixedRecurring, parseDate } from '../../domain/recurrence';
import { analyzeRecurringDateMove } from '../../domain/moveRecurring';

export interface MoveRecurringDialogProps {
  isOpen: boolean;
  task: Task | null;
  fromDate: string | null;
  toDate: string | null;
  textChanged?: boolean;
  today?: Date;
  onClose: () => void;
  onMoveOccurrence: () => Promise<void> | void;
  onMoveSeries: () => Promise<void> | void;
}

function isOutsideDialog(e: PointerEvent, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

function formatShortDate(dateStr: string, includeYear: boolean): string {
  return parseDate(dateStr).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

/**
 * Native modal `<dialog>` asking whether changing a recurring task's date should move
 * only the selected occurrence (or completion) or move the recurring schedule itself.
 */
export function MoveRecurringDialog({
  isOpen,
  task,
  fromDate,
  toDate,
  textChanged = false,
  today,
  onClose,
  onMoveOccurrence,
  onMoveSeries,
}: MoveRecurringDialogProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const isOpenRef = useRef(isOpen);
  const onCloseRef = useRef(onClose);
  const [isApplying, setIsApplying] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      setIsApplying(false);
      if (isOpenRef.current) {
        onCloseRef.current();
      }
    };
    dialog.addEventListener('close', handleNativeClose);

    // Light-dismiss fallback where <dialog closedby> is unsupported (e.g. Safari, happy-dom).
    let cleanupDismissFallback: (() => void) | undefined;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
      let pressedOutside = false;
      const onPointerDown = (e: PointerEvent) => {
        pressedOutside = dialog.open && isOutsideDialog(e, dialog);
      };
      const onPointerUp = (e: PointerEvent) => {
        const shouldClose = pressedOutside && dialog.open && isOutsideDialog(e, dialog);
        pressedOutside = false;
        if (shouldClose) {
          dialog.close();
        }
      };
      const onPointerCancel = () => {
        pressedOutside = false;
      };
      dialog.addEventListener('pointerdown', onPointerDown);
      dialog.addEventListener('pointerup', onPointerUp);
      dialog.addEventListener('pointercancel', onPointerCancel);
      cleanupDismissFallback = () => {
        dialog.removeEventListener('pointerdown', onPointerDown);
        dialog.removeEventListener('pointerup', onPointerUp);
        dialog.removeEventListener('pointercancel', onPointerCancel);
      };
    }

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanupDismissFallback?.();
    };
  }, []);

  useLayoutEffect(() => {
    isOpenRef.current = isOpen;
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen) {
      setIsApplying(false);
      if (!dialog.open) {
        dialog.showModal();
      }
      cancelBtnRef.current?.focus({ preventScroll: true });
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen]);

  const analysis = useMemo(() => {
    if (!task || !fromDate || !toDate || !isFixedRecurring(task) || !task.recurrence) {
      return null;
    }
    return analyzeRecurringDateMove(task, fromDate, toDate, today);
  }, [task, fromDate, toDate, today]);

  const includeYear = Boolean(fromDate && toDate && fromDate.slice(0, 4) !== toDate.slice(0, 4));
  const fromLabel = fromDate ? formatShortDate(fromDate, includeYear) : '';
  const toLabel = toDate ? formatShortDate(toDate, includeYear) : '';

  const handleCancel = () => {
    if (isApplying) return;
    dialogRef.current?.close();
  };

  const handleChoose = async (action: () => Promise<void> | void) => {
    if (isApplying) return;
    setIsApplying(true);
    try {
      await action();
      if (isOpenRef.current && dialogRef.current?.open) {
        dialogRef.current.close();
      }
    } finally {
      setIsApplying(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto p-0 w-[min(calc(100vw-2rem),32rem)] max-w-none max-h-[calc(100dvh-2rem)] bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl text-tt-text overflow-y-auto"
    >
      {task && analysis && fromDate && toDate && (
        <div className="p-6 sm:p-7 space-y-5">
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-tt-border">
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="p-3 rounded-2xl bg-tt-blue/15 text-tt-blue shrink-0">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div className="min-w-0">
                <h2 id={headingId} className="text-xl sm:text-2xl font-bold text-tt-text truncate">
                  Move Recurring Task
                </h2>
                <p
                  className="text-sm sm:text-base text-tt-secondary font-medium truncate"
                  title={task.title}
                >
                  {task.title}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleCancel}
              disabled={isApplying}
              aria-label="Close dialog"
              className="p-2 rounded-xl text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer disabled:opacity-50"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Date transition strip */}
          <div className="flex items-center justify-between px-4 py-3 rounded-2xl bg-tt-sidebar border border-tt-border">
            <div className="text-center flex-1 min-w-0">
              <span className="block text-[11px] uppercase font-bold text-tt-muted tracking-wider mb-0.5">
                From
              </span>
              <span className="text-base sm:text-lg font-bold text-tt-text block truncate">
                {fromLabel}
              </span>
            </div>
            <ArrowRight className="w-5 h-5 text-tt-muted mx-3 shrink-0" />
            <div className="text-center flex-1 min-w-0">
              <span className="block text-[11px] uppercase font-bold text-tt-muted tracking-wider mb-0.5">
                To
              </span>
              <span className="text-base sm:text-lg font-bold text-tt-blue block truncate">
                {toLabel}
              </span>
            </div>
          </div>

          {/* Choices */}
          <div className="space-y-3">
            <button
              type="button"
              disabled={isApplying || (analysis.isCompletedOccurrence && !analysis.canMoveCompletedOccurrence)}
              onClick={() => void handleChoose(onMoveOccurrence)}
              data-testid="move-occurrence-only-btn"
              className="w-full text-left flex items-start gap-3.5 p-4 rounded-2xl border border-tt-border bg-tt-surface hover:bg-tt-hover hover:border-tt-blue/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 shrink-0 mt-0.5">
                <Calendar className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-base sm:text-lg font-bold text-tt-text">
                  {analysis.isCompletedOccurrence ? 'Move this completion' : 'Only this occurrence'}
                </div>
                <p className="text-sm text-tt-secondary leading-snug">
                  {analysis.isCompletedOccurrence
                    ? analysis.canMoveCompletedOccurrence
                      ? `Move completion from ${fromLabel} to ${toLabel}. Repeats stay ${analysis.currentScheduleLabel}.`
                      : 'Completions cannot be moved to a future date.'
                    : `Move ${fromLabel} to ${toLabel}. Repeats stay ${analysis.currentScheduleLabel}.`}
                </p>
                {analysis.hasCollisionOnTarget && (
                  <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
                    Already scheduled on {toLabel} — this will combine with that occurrence.
                  </p>
                )}
                {textChanged && (
                  <p className="text-xs text-tt-muted">
                    Title and notes changes will apply to the recurring task.
                  </p>
                )}
              </div>
            </button>

            <button
              type="button"
              disabled={isApplying}
              onClick={() => void handleChoose(onMoveSeries)}
              data-testid="move-recurring-series-btn"
              className="w-full text-left flex items-start gap-3.5 p-4 rounded-2xl border border-tt-border bg-tt-surface hover:bg-tt-hover hover:border-tt-blue/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <div className="p-2.5 rounded-xl bg-tt-blue/15 text-tt-blue shrink-0 mt-0.5">
                <CalendarClock className="w-5 h-5" />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="text-base sm:text-lg font-bold text-tt-text">
                  Move recurring task
                </div>
                <p className="text-sm text-tt-secondary leading-snug">
                  {analysis.isDaily
                    ? `Start daily schedule on ${toLabel}. Past occurrences stay in history.`
                    : `Change schedule to ${analysis.nextScheduleLabel}, starting ${toLabel}. Past occurrences stay in history.`}
                </p>
                {analysis.endDateExtendedTo && (
                  <p className="text-xs font-medium text-tt-blue">
                    End date extends to {analysis.endDateExtendedTo}.
                  </p>
                )}
              </div>
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end pt-3 border-t border-tt-border">
            <button
              ref={cancelBtnRef}
              type="button"
              autoFocus
              disabled={isApplying}
              onClick={handleCancel}
              className="px-5 py-2.5 text-base font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </dialog>
  );
}

export default MoveRecurringDialog;
