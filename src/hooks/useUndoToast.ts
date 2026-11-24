import { useCallback, useEffect, useRef, useState } from 'react';

export interface UndoToastState {
  id: number;
  message: string;
  /** False for a status message that has no Undo action. */
  offerUndo: boolean;
}

export interface ShowUndoMeta {
  taskId: string;
  title: string;
  baselineUpdatedAt: number;
}

export interface PendingUndo extends ShowUndoMeta {
  id: number;
  message: string;
  onUndo: () => Promise<void> | void;
}

const UNDO_TOAST_MS = 5000;

/**
 * Timed undo popup plus the last undo, which outlives the popup until it is
 * used, replaced, or the page reloads.
 */
export function useUndoToast() {
  const [undoToast, setUndoToast] = useState<UndoToastState | null>(null);
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const pendingRef = useRef<PendingUndo | null>(null);
  const undoTimerRef = useRef<number | null>(null);
  const idRef = useRef(0);
  const busyRef = useRef(false);

  const clearTimer = useCallback(() => {
    if (undoTimerRef.current != null) {
      window.clearTimeout(undoTimerRef.current);
      undoTimerRef.current = null;
    }
  }, []);

  const hideUndoToast = useCallback(() => {
    clearTimer();
    setUndoToast(null);
  }, [clearTimer]);

  const showTimedToast = useCallback((toast: UndoToastState) => {
    clearTimer();
    setUndoToast(toast);
    undoTimerRef.current = window.setTimeout(() => {
      undoTimerRef.current = null;
      setUndoToast((current) => (current?.id === toast.id ? null : current));
    }, UNDO_TOAST_MS);
  }, [clearTimer]);

  const showUndoToast = useCallback((
    message: string,
    onUndo: () => Promise<void> | void,
    meta: ShowUndoMeta,
  ) => {
    idRef.current += 1;
    const pending: PendingUndo = { id: idRef.current, message, onUndo, ...meta };
    pendingRef.current = pending;
    setPendingUndo(pending);
    showTimedToast({ id: pending.id, message, offerUndo: true });
  }, [showTimedToast]);

  const showInfoToast = useCallback((message: string) => {
    idRef.current += 1;
    showTimedToast({ id: idRef.current, message, offerUndo: false });
  }, [showTimedToast]);

  const takePendingUndo = useCallback((): PendingUndo | null => {
    if (busyRef.current) return null;
    const current = pendingRef.current;
    if (!current) return null;
    busyRef.current = true;
    pendingRef.current = null;
    setPendingUndo(null);
    clearTimer();
    setUndoToast(null);
    return current;
  }, [clearTimer]);

  const endUndoConsume = useCallback(() => {
    busyRef.current = false;
  }, []);

  useEffect(() => {
    return () => {
      if (undoTimerRef.current != null) {
        window.clearTimeout(undoTimerRef.current);
      }
    };
  }, []);

  return {
    undoToast,
    pendingUndo,
    showUndoToast,
    showInfoToast,
    hideUndoToast,
    takePendingUndo,
    endUndoConsume,
  };
}
