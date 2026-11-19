import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import {
  buildPickerYears,
  calendarHeaderTitle,
  pickerDefaultScrollYear,
  shortMonthNames,
} from '../../domain/calendarUi';

export interface MonthYearPickerDialogProps {
  isOpen: boolean;
  year: number;
  monthIndex: number;
  today?: Date;
  onSelect: (year: number, monthIndex: number) => void;
  onJumpToToday: () => void;
  onClose: () => void;
}

function isOutsideDialog(e: PointerEvent, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/**
 * Native modal `<dialog>` for picking any month and year, anchored on open so the
 * current and future years appear first while allowing scrolling back to past years.
 */
export function MonthYearPickerDialog({
  isOpen,
  year,
  monthIndex,
  today,
  onSelect,
  onJumpToToday,
  onClose,
}: MonthYearPickerDialogProps) {
  const headingId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const yearListRef = useRef<HTMLDivElement>(null);
  const isOpenRef = useRef(isOpen);
  const onCloseRef = useRef(onClose);

  const [draft, setDraft] = useState<{ year: number; monthIndex: number } | null>(null);
  const draftYear = draft?.year ?? year;
  const draftMonth = draft?.monthIndex ?? monthIndex;

  const currentDate = today ?? new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth();

  const years = useMemo(() => buildPickerYears(currentYear, year), [currentYear, year]);
  const months = useMemo(() => shortMonthNames(), []);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      setDraft(null);
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
      if (!dialog.open) {
        dialog.showModal();
      }
      const list = yearListRef.current;
      if (list) {
        const selectedBtn = list.querySelector<HTMLButtonElement>(`button[data-year="${year}"]`);
        selectedBtn?.focus({ preventScroll: true });

        const anchorYear = pickerDefaultScrollYear(year, currentYear);
        const anchorBtn = list.querySelector<HTMLButtonElement>(`button[data-year="${anchorYear}"]`);
        if (anchorBtn) {
          const paddingTop = Number.parseFloat(getComputedStyle(list).paddingTop) || 0;
          list.scrollTop = Math.max(0, anchorBtn.offsetTop - list.offsetTop - paddingTop);
        }
      }
    } else if (dialog.open) {
      dialog.close();
    }
  }, [isOpen, year, currentYear]);

  const handleCancel = () => {
    dialogRef.current?.close();
  };

  const handleDone = () => {
    onSelect(draftYear, draftMonth);
    dialogRef.current?.close();
  };

  const handleToday = () => {
    onJumpToToday();
    dialogRef.current?.close();
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={headingId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className="m-auto p-0 w-[min(calc(100vw-2rem),340px)] max-w-none rounded-3xl bg-tt-elevated border border-tt-border shadow-2xl text-tt-text overflow-hidden"
    >
      <div className="flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-3 border-b border-tt-border">
          <h2 id={headingId} className="text-lg font-bold text-tt-text">
            {calendarHeaderTitle(draftYear, draftMonth)}
          </h2>
          <button
            type="button"
            onClick={handleCancel}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-4">
          {/* Year grid */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-2">
              Year
            </div>
            <div
              ref={yearListRef}
              data-testid="month-year-picker-years"
              className="max-h-[148px] overflow-y-auto overscroll-contain rounded-xl bg-tt-bg/60 p-1.5 grid grid-cols-4 gap-1.5"
            >
              {years.map((y) => {
                const isSelected = y === draftYear;
                const isCurrent = y === currentYear && !isSelected;
                return (
                  <button
                    key={y}
                    type="button"
                    data-year={y}
                    aria-pressed={isSelected}
                    onClick={() =>
                      setDraft((prev) => ({
                        year: y,
                        monthIndex: prev?.monthIndex ?? monthIndex,
                      }))
                    }
                    className={`h-9 rounded-lg text-sm transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-tt-blue text-white font-semibold'
                        : isCurrent
                          ? 'ring-1 ring-inset ring-tt-blue text-tt-blue font-semibold hover:bg-tt-blue-soft'
                          : 'text-tt-text hover:bg-tt-hover'
                    }`}
                  >
                    {y}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Month grid */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-2">
              Month
            </div>
            <div data-testid="month-year-picker-months" className="grid grid-cols-4 gap-1.5">
              {months.map((label, m) => {
                const isSelected = m === draftMonth;
                const isCurrent = draftYear === currentYear && m === currentMonth && !isSelected;
                return (
                  <button
                    key={m}
                    type="button"
                    data-month={m}
                    aria-pressed={isSelected}
                    onClick={() =>
                      setDraft((prev) => ({
                        year: prev?.year ?? year,
                        monthIndex: m,
                      }))
                    }
                    className={`h-9 rounded-lg text-sm transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-tt-blue text-white font-semibold'
                        : isCurrent
                          ? 'ring-1 ring-inset ring-tt-blue text-tt-blue font-semibold hover:bg-tt-blue-soft'
                          : 'text-tt-text hover:bg-tt-hover'
                    }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-tt-border flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleToday}
            className="px-3 py-1.5 rounded-xl text-sm font-semibold text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
          >
            Today
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCancel}
              className="px-3.5 py-1.5 rounded-xl text-sm font-medium text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDone}
              className="px-4 py-1.5 rounded-xl text-sm font-semibold bg-tt-blue hover:bg-tt-blue-hover text-white transition-colors cursor-pointer"
            >
              Done
            </button>
          </div>
        </div>
      </div>
    </dialog>
  );
}
