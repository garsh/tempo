import { useLayoutEffect, useRef } from 'react';
import { X } from 'lucide-react';
import type { UndoToastState } from '../../hooks/useUndoToast';

interface UndoToastProps {
  toast: UndoToastState | null;
  onDismiss: () => void;
}

/**
 * Floating bottom-aligned status toast with Undo action (promoted to top-layer popover when supported).
 */
export function UndoToast({ toast, onDismiss }: UndoToastProps) {
  const popoverRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    const el = popoverRef.current;
    if (!el || !toast) return;
    if (typeof el.showPopover === 'function') {
      try {
        if (!el.matches(':popover-open')) {
          el.showPopover();
        }
      } catch {
        // Ignore environments without popover support
      }
    }
  }, [toast]);

  if (!toast) return null;

  return (
    <div
      ref={popoverRef}
      key={toast.id}
      role="status"
      aria-live="polite"
      data-testid="undo-toast"
      {...(typeof HTMLElement !== 'undefined' && 'popover' in HTMLElement.prototype
        ? { popover: 'manual' as const }
        : {})}
      className="fixed top-auto left-4 right-20 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 m-0 p-0 border-0 bg-transparent z-50"
      style={{ bottom: 'calc(20px + env(safe-area-inset-bottom))' }}
    >
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 rounded-2xl bg-tt-rail text-white shadow-xl border border-white/10">
        <span className="text-sm font-medium truncate">{toast.message}</span>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              const fn = toast.onUndo;
              onDismiss();
              void fn();
            }}
            className="px-2.5 py-1 text-sm font-bold text-blue-300 hover:text-blue-200 rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Dismiss notification"
            className="p-1 text-white/60 hover:text-white rounded-lg hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
