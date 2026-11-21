import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoToastState {
  id: number;
  message: string;
  onUndo: () => Promise<void> | void;
}

/**
 * Manages the timed undo notification toast (auto-dismisses after 5 seconds).
 */
export function useUndoToast() {
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const undoTimerRef = useRef<number | null>(null);

  const dismissUndoToast = useCallback(() => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
    setUndoToast(null);
  }, []);

  const showUndoToast = useCallback((message: string, onUndo: () => Promise<void> | void) => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
    }
    setUndoToast({ id: Date.now(), message, onUndo });
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      setUndoToast(null);
    }, 5000);
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  return { undoToast, showUndoToast, dismissUndoToast };
}
