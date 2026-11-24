import { useEffect, useLayoutEffect, useRef, type ReactNode, type RefObject } from 'react';

interface ModalDialogProps {
  open: boolean;
  onClose: () => void;
  ariaLabelledBy?: string;
  ariaLabel?: string;
  role?: 'alertdialog';
  className?: string;
  initialFocusRef?: RefObject<HTMLElement | null>;
  testId?: string;
  children: ReactNode;
}

function isOutsideDialog(e: PointerEvent, dialog: HTMLDialogElement): boolean {
  const r = dialog.getBoundingClientRect();
  return e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom;
}

/**
 * Shared native modal `<dialog>` shell providing top-layer rendering, inert background,
 * focus restoration, light-dismiss fallback, and synthetic Escape handling for tests.
 */
export function ModalDialog({
  open,
  onClose,
  ariaLabelledBy,
  ariaLabel,
  role,
  className = '',
  initialFocusRef,
  testId,
  children,
}: ModalDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const onCloseRef = useRef(onClose);
  const closingFromUnmountRef = useRef(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const handleNativeClose = () => {
      dialog.returnValue = '';
      if (!closingFromUnmountRef.current) {
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

    // Synthetic Escape fallback for non-browser DOM environments (e.g. happy-dom).
    // Register on `window` (capture) so events dispatched on either `window` or `document`
    // reach the topmost native modal before page-level Escape handlers.
    // Real user Esc presses (`e.isTrusted === true`) are handled natively by `<dialog>`.
    const handleSyntheticEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.isTrusted && dialog.open) {
        e.preventDefault();
        e.stopImmediatePropagation();
        dialog.close();
      }
    };
    window.addEventListener('keydown', handleSyntheticEscape, true);

    return () => {
      dialog.removeEventListener('close', handleNativeClose);
      cleanupDismissFallback?.();
      window.removeEventListener('keydown', handleSyntheticEscape, true);
    };
  }, [open]);

  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    closingFromUnmountRef.current = false;
    if (!dialog.open) {
      dialog.showModal();
    }
    initialFocusRef?.current?.focus({ preventScroll: true });

    return () => {
      closingFromUnmountRef.current = true;
      if (dialog.open) {
        dialog.close();
      }
    };
  }, [open, initialFocusRef]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      role={role}
      aria-labelledby={ariaLabelledBy}
      aria-label={ariaLabel}
      data-testid={testId}
      {...({ closedby: 'any' } as Record<string, string>)}
      className={className}
    >
      {children}
    </dialog>
  );
}
