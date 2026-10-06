import { useEffect, useId, type ReactNode } from 'react';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: ReactNode;
  /** Right side of the title row (e.g. Done). */
  action?: ReactNode;
  children: ReactNode;
  /** Stacking: nested sheets pass a higher z. */
  z?: number;
  testId?: string;
}

/**
 * Bottom sheet on phones, centered card on desktop. Escape / scrim tap closes it
 * (Escape is swallowed so the app's global Escape chain doesn't also fire).
 */
export function Sheet({ open, onClose, title, action, children, z = 70, testId }: SheetProps) {
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 flex items-end lg:items-center justify-center bg-tt-scrim"
      style={{ zIndex: z }}
      onClick={onClose}
      data-testid={testId}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        onClick={(e) => e.stopPropagation()}
        className="w-full lg:max-w-[420px] max-h-[85dvh] overflow-y-auto bg-tt-elevated text-tt-text rounded-t-[20px] lg:rounded-2xl shadow-[0_-4px_24px_var(--tt-shadow)]"
        style={{ paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}
      >
        <div className="lg:hidden flex justify-center pt-2">
          <span className="w-9 h-1 rounded-full bg-tt-border" />
        </div>
        {(title || action) && (
          <div className="flex items-center gap-2 px-5 pt-3 pb-2">
            <h2 id={titleId} className="flex-1 text-[17px] font-bold">
              {title}
            </h2>
            {action}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

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
      className={`relative shrink-0 w-[42px] h-[24px] rounded-full transition-colors disabled:opacity-40 ${
        checked ? 'bg-tt-blue' : 'bg-tt-border'
      }`}
    >
      <span
        className={`absolute top-[2px] left-[2px] w-5 h-5 rounded-full bg-white shadow transition-transform ${
          checked ? 'translate-x-[18px]' : ''
        }`}
      />
    </button>
  );
}

/** Small confirm dialog (destructive actions). */
export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  message?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onCancel();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-8 bg-tt-scrim" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[320px] rounded-2xl bg-tt-elevated text-tt-text p-5 shadow-2xl"
      >
        <h2 className="text-[17px] font-bold">{title}</h2>
        {message && <p className="mt-2 text-[14px] text-tt-secondary">{message}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="px-4 py-2 rounded-lg text-[14px] font-medium text-tt-secondary hover:bg-tt-hover">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="px-4 py-2 rounded-lg text-[14px] font-semibold text-white bg-tt-overdue"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
