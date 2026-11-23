import { useId, type ReactNode } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

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
  useEscapeKey(open, onClose, { capture: true, stopPropagation: true });

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
  useEscapeKey(open, onCancel, { capture: true, stopPropagation: true });
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4 bg-tt-scrim" onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[400px] max-h-[85dvh] overflow-y-auto rounded-2xl bg-tt-elevated text-tt-text p-5 shadow-2xl"
      >
        <h2 className="text-[17px] font-bold">{title}</h2>
        {message &&
          (typeof message === 'string' ? (
            <p className="mt-2 text-[14px] text-tt-secondary leading-relaxed">{message}</p>
          ) : (
            <div className="mt-2.5 text-[13.5px] text-tt-secondary leading-relaxed space-y-2.5">{message}</div>
          ))}
        <div className="mt-5 flex justify-end gap-2">
          <button
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
    </div>
  );
}
