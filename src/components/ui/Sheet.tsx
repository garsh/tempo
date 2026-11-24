import { useRef, type ReactNode } from 'react';
import { ModalDialog } from './ModalDialog';

export function Switch({
  checked,
  onChange,
  label,
  disabled,
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative shrink-0 w-[44px] h-[26px] rounded-full transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
        checked ? 'bg-tt-blue' : 'bg-zinc-300 dark:bg-zinc-700'
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-5 h-5 rounded-full bg-white shadow-sm transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );
}

/** Confirm dialog with optional multi-section details (destructive or primary confirmation). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  tone = 'danger',
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: ReactNode;
  confirmLabel: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const cancelBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      open={open}
      onClose={onCancel}
      role="alertdialog"
      ariaLabel={title}
      initialFocusRef={cancelBtnRef}
      className="m-auto p-0 w-[min(calc(100dvw-2rem),400px)] max-w-none max-h-[85dvh] overflow-y-auto rounded-2xl bg-tt-elevated text-tt-text border border-tt-border shadow-2xl"
    >
      <div className="p-5">
        <h2 className="text-[17px] font-bold">{title}</h2>
        {message &&
          (typeof message === 'string' ? (
            <p className="mt-2 text-[14px] text-tt-secondary leading-relaxed">{message}</p>
          ) : (
            <div className="mt-2.5 text-[13.5px] text-tt-secondary leading-relaxed space-y-2.5">{message}</div>
          ))}
        <div className="mt-5 flex justify-end gap-2">
          <button
            ref={cancelBtnRef}
            autoFocus
            type="button"
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-[14px] font-medium text-tt-secondary hover:bg-tt-hover cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 rounded-lg text-[14px] font-semibold text-white cursor-pointer ${
              tone === 'primary' ? 'bg-tt-blue hover:bg-tt-blue-hover' : 'bg-tt-overdue hover:opacity-95'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
