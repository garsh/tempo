import { useEffect, useImperativeHandle, useRef, type Ref } from 'react';
import type { Task } from '../../types/task';
import { combineDueAt, splitDueAt } from '../../domain/recurrence';

export interface ChangeDatePickerHandle {
  open: (
    task: Task,
    anchorRect?: Pick<DOMRect, 'top' | 'bottom' | 'left' | 'right' | 'width' | 'height'>,
  ) => void;
}

export interface ChangeDatePickerProps {
  ref?: Ref<ChangeDatePickerHandle>;
  onSave?: (taskId: string, newDueAt: string | null) => Promise<void> | void;
  onSaveTask?: (task: Task, newDueAt: string | null) => Promise<void> | void;
  maxDate?: string;
  ariaLabel?: string;
  testId?: string;
}

const VIEWPORT_MARGIN = 8;

/**
 * Imperative native `<input type="date">` trigger used by task swipe Change Date.
 * Opens the browser's native date picker synchronously on user activation and saves immediately on change.
 */
export function ChangeDatePicker({
  ref,
  onSave,
  onSaveTask,
  maxDate,
  ariaLabel = 'Change date',
  testId = 'change-date-native-input',
}: ChangeDatePickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const pendingRef = useRef<{ id: string; task: Task; existingTime: string | null } | null>(null);
  const onSaveRef = useRef(onSave);
  const onSaveTaskRef = useRef(onSaveTask);

  useEffect(() => {
    onSaveRef.current = onSave;
    onSaveTaskRef.current = onSaveTask;
  });

  useEffect(() => {
    const input = inputRef.current;
    if (!input) return;

    const handleChange = () => {
      const pickedDate = input.value;
      const pending = pendingRef.current;
      if (!pending || !pickedDate) return;
      const nextDueAt = combineDueAt(pickedDate, pending.existingTime);
      if (onSaveTaskRef.current) {
        void onSaveTaskRef.current(pending.task, nextDueAt);
      } else {
        void onSaveRef.current?.(pending.id, nextDueAt);
      }
    };

    const handleCancel = () => {
      pendingRef.current = null;
    };

    input.addEventListener('change', handleChange);
    input.addEventListener('cancel', handleCancel);
    return () => {
      input.removeEventListener('change', handleChange);
      input.removeEventListener('cancel', handleCancel);
    };
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      open(task, anchorRect) {
        const input = inputRef.current;
        if (!input) return;

        const parts = task.dueAt ? splitDueAt(task.dueAt) : null;
        pendingRef.current = {
          id: task.id,
          task,
          existingTime: parts?.time ?? null,
        };

        if (anchorRect) {
          const vw = window.innerWidth;
          const vh = window.innerHeight;
          const left =
            vw > 0
              ? Math.max(VIEWPORT_MARGIN, Math.min(anchorRect.left, vw - VIEWPORT_MARGIN - 1))
              : Math.max(VIEWPORT_MARGIN, anchorRect.left);
          const top =
            vh > 0
              ? Math.max(VIEWPORT_MARGIN, Math.min(anchorRect.bottom, vh - VIEWPORT_MARGIN - 1))
              : Math.max(VIEWPORT_MARGIN, anchorRect.bottom);
          input.style.left = `${left}px`;
          input.style.top = `${top}px`;
        }

        input.value = parts?.date ?? '';

        if (typeof input.showPicker === 'function') {
          try {
            input.showPicker();
            return;
          } catch {
            /* Fall back to focus + click when showPicker throws */
          }
        }
        input.focus({ preventScroll: true });
        input.click();
      },
    }),
    [],
  );

  return (
    <input
      ref={inputRef}
      type="date"
      max={maxDate}
      tabIndex={-1}
      aria-hidden="true"
      aria-label={ariaLabel}
      data-testid={testId}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '1px',
        height: '1px',
        margin: 0,
        padding: 0,
        border: 0,
        overflow: 'hidden',
        clipPath: 'inset(50%)',
        opacity: 0,
        pointerEvents: 'none',
        fontSize: '16px',
      }}
    />
  );
}

export default ChangeDatePicker;
