import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { moveItemToSlot } from '../domain/reorder';

const LONG_PRESS_MS = 350;
const MOVE_SLOP_PX = 8;
const SETTLE_MS = 165;

function nearestScrollport(start: HTMLElement | null): HTMLElement | null {
  let el = start?.parentElement ?? null;
  while (el) {
    const overflowY = window.getComputedStyle(el).overflowY;
    if (overflowY === 'auto' || overflowY === 'scroll' || overflowY === 'overlay') return el;
    el = el.parentElement;
  }
  return null;
}

function listCanScroll(start: HTMLElement | null): boolean {
  const port = nearestScrollport(start);
  if (!port) return false;
  return port.scrollHeight - port.clientHeight > 1;
}

function rowKey(task: Task): string {
  return task.dueAt ? `${task.id}:${task.dueAt}` : task.id;
}

export interface RowDragProps {
  isDragging: boolean;
  isSettling: boolean;
  isDragActive: boolean;
  dragOffsetY: number;
  shiftY: number;
  rowRef: (el: HTMLDivElement | null) => void;
  onRowPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRowClickCapture: (e: React.MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu: (e: React.MouseEvent<HTMLDivElement>) => void;
  /**
   * `none` when this list cannot scroll, so a touch can move the row.
   * `pan-y` while the list can scroll, so the same touch still scrolls.
   */
  reorderTouchAction: 'pan-y' | 'none';
}

interface ReorderableTaskListProps {
  tasks: Task[];
  enabled: boolean;
  onReorder: (orderedIds: string[]) => void;
  onDragActiveChange?: (active: boolean) => void;
  renderRow: (task: Task, dragProps: RowDragProps) => React.ReactNode;
}

interface RowSnapshot {
  id: string;
  top: number;
  height: number;
  midpoint: number;
}

interface DragState {
  taskId: string;
  fromIndex: number;
  targetIndex: number;
  offsetY: number;
  settling: boolean;
  draggedHeight: number;
  indicatorTop: number | null;
  orderKeys: string[];
}

interface PendingPress {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  timerId: number;
  requiresLongPress: boolean;
}

interface ActiveDrag {
  taskId: string;
  pointerId: number;
  fromIndex: number;
  startY: number;
  targetIndex: number;
  offsetY: number;
  draggedHeight: number;
  containerTop: number;
  snapshots: RowSnapshot[];
  orderKeys: string[];
}

function computeDestOffsetY(
  snapshots: RowSnapshot[],
  fromIndex: number,
  insertAt: number
): number {
  if (insertAt === fromIndex) return 0;
  let sum = 0;
  if (insertAt > fromIndex) {
    for (let k = fromIndex + 1; k <= insertAt; k++) {
      sum += snapshots[k]?.height ?? 0;
    }
    return sum;
  }
  for (let k = insertAt; k < fromIndex; k++) {
    sum += snapshots[k]?.height ?? 0;
  }
  return -sum;
}

function DropIndicator({ top }: { top: number }) {
  return (
    <div
      aria-hidden
      data-testid="drop-indicator"
      style={{ top }}
      className="absolute left-3 right-3 sm:left-4 sm:right-4 -translate-y-1/2 h-0.5 bg-tt-blue rounded-full pointer-events-none z-10"
    >
      <span className="absolute -left-1 -top-[3px] w-2 h-2 rounded-full bg-tt-blue" />
    </div>
  );
}

/**
 * Renders a list of tasks that can be reordered by dragging.
 * A scrollable list still requires a long press, so a vertical drag can scroll.
 * A list that cannot scroll also starts the drag as soon as the press moves.
 * A short press that does not move stays a tap.
 */
export function ReorderableTaskList({
  tasks,
  enabled,
  onReorder,
  onDragActiveChange,
  renderRow,
}: ReorderableTaskListProps) {
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [pendingOrderIds, setPendingOrderIds] = useState<string[] | null>(null);
  const [canScroll, setCanScroll] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingRef = useRef<PendingPress | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);
  const attachDragTouchRef = useRef<() => void>(() => {});
  const detachDragTouchRef = useRef<() => void>(() => {});
  const beginDragRef = useRef<
    (taskId: string, pointerId: number, startY: number, vibrate: boolean) => void
  >(() => {});

  const tasksRef = useRef(tasks);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const onReorderRef = useRef(onReorder);
  const onDragActiveChangeRef = useRef(onDragActiveChange);
  const rowCallbacksRef = useRef<
    Map<
      string,
      {
        rowRef: (el: HTMLDivElement | null) => void;
        onRowPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
      }
    >
  >(new Map());

  useEffect(() => {
    onReorderRef.current = onReorder;
    onDragActiveChangeRef.current = onDragActiveChange;
  });

  // Clear optimistic pending order once `tasks` reflects the new order or the item set changes
  useEffect(() => {
    if (!pendingOrderIds) return;
    const sameOrder =
      tasks.length === pendingOrderIds.length &&
      tasks.every((t, i) => rowKey(t) === pendingOrderIds[i]);
    if (sameOrder) {
      setPendingOrderIds(null);
      return;
    }
    const pendingSet = new Set(pendingOrderIds);
    const sameKeys =
      tasks.length === pendingOrderIds.length &&
      tasks.every((t) => pendingSet.has(rowKey(t)));
    if (!sameKeys) {
      setPendingOrderIds(null);
    }
  }, [tasks, pendingOrderIds]);

  const displayTasks = useMemo(() => {
    const activeOrderIds = dragState?.orderKeys ?? pendingOrderIds;
    if (!activeOrderIds) return tasks;
    const byKey = new Map(tasks.map((t) => [rowKey(t), t]));
    const ordered: Task[] = [];
    for (const key of activeOrderIds) {
      const t = byKey.get(key);
      if (t) {
        ordered.push(t);
        byKey.delete(key);
      }
    }
    for (const t of byKey.values()) ordered.push(t);
    return ordered;
  }, [tasks, pendingOrderIds, dragState?.orderKeys]);

  useEffect(() => {
    tasksRef.current = displayTasks;
  }, [displayTasks]);

  useLayoutEffect(() => {
    const root = containerRef.current;
    if (!root) return;
    const measure = () => {
      const next = enabled && listCanScroll(root);
      setCanScroll((prev) => (prev === next ? prev : next));
    };
    measure();
    const port = nearestScrollport(root);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(measure);
      observer.observe(root);
      if (port) observer.observe(port);
    }
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled, tasks.length]);

  useLayoutEffect(() => {
    const active = activeRef.current;
    if (!active) return;
    const draggedEl = rowRefs.current.get(active.taskId);
    if (draggedEl) {
      draggedEl.style.transform = `translateY(${active.offsetY}px)`;
      draggedEl.style.transition = 'none';
    }
  }, [dragState]);

  const clearPending = useCallback(() => {
    const p = pendingRef.current;
    if (p) {
      window.clearTimeout(p.timerId);
      pendingRef.current = null;
    }
  }, []);

  const cleanupDragImmediate = useCallback(() => {
    detachDragTouchRef.current();
    clearPending();
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (activeRef.current) {
      const draggedEl = rowRefs.current.get(activeRef.current.taskId);
      if (draggedEl) {
        draggedEl.style.transform = '';
        draggedEl.style.transition = '';
      }
      activeRef.current = null;
      setDragState(null);
      onDragActiveChangeRef.current?.(false);
    }
    window.setTimeout(() => {
      suppressClickRef.current = false;
    }, 150);
  }, [clearPending]);

  useEffect(() => {
    return () => {
      clearPending();
      if (settleTimerRef.current !== null) {
        window.clearTimeout(settleTimerRef.current);
      }
      if (activeRef.current) {
        activeRef.current = null;
        onDragActiveChangeRef.current?.(false);
      }
    };
  }, [clearPending]);

  useEffect(() => {
    const computeTargetIndex = (clientY: number, snapshots: RowSnapshot[]): number => {
      for (let i = 0; i < snapshots.length; i++) {
        if (clientY < snapshots[i].midpoint) {
          return i;
        }
      }
      return snapshots.length;
    };

    const computeIndicatorTop = (active: ActiveDrag, targetIndex: number): number | null => {
      const insertAt = targetIndex > active.fromIndex ? targetIndex - 1 : targetIndex;
      if (insertAt === active.fromIndex) return null;
      const destOffsetY = computeDestOffsetY(active.snapshots, active.fromIndex, insertAt);
      const fromSnap = active.snapshots[active.fromIndex];
      if (!fromSnap) return null;
      return fromSnap.top - active.containerTop + destOffsetY + active.draggedHeight / 2;
    };

    const onPointerMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (p && e.pointerId === p.pointerId) {
        const dx = e.clientX - p.startX;
        const dy = e.clientY - p.startY;
        if (Math.hypot(dx, dy) <= MOVE_SLOP_PX) return;

        // Scrollable lists ignore movement so the page can scroll.
        // Short lists start a reorder on a vertical move and leave a horizontal move for the action tray.
        const startReorder = !p.requiresLongPress && Math.abs(dy) >= Math.abs(dx);
        const taskId = p.taskId;
        const pointerId = p.pointerId;
        const startY = p.startY;
        clearPending();
        if (!startReorder) return;
        beginDragRef.current(taskId, pointerId, startY, true);
      }

      const active = activeRef.current;
      if (!active || e.pointerId !== active.pointerId) return;

      const offsetY = e.clientY - active.startY;
      const fromSnap = active.snapshots[active.fromIndex];
      const probeY =
        fromSnap && fromSnap.height > 0
          ? offsetY < 0
            ? fromSnap.top + offsetY
            : offsetY > 0
              ? fromSnap.top + fromSnap.height + offsetY
              : fromSnap.midpoint
          : e.clientY;
      const targetIndex = computeTargetIndex(probeY, active.snapshots);
      const prevTargetIndex = active.targetIndex;
      active.offsetY = offsetY;
      active.targetIndex = targetIndex;
      const draggedEl = rowRefs.current.get(active.taskId);
      if (draggedEl) {
        draggedEl.style.transform = `translateY(${offsetY}px)`;
        draggedEl.style.transition = 'none';
      }
      if (targetIndex !== prevTargetIndex) {
        setDragState({
          taskId: active.taskId,
          fromIndex: active.fromIndex,
          targetIndex,
          offsetY,
          settling: false,
          draggedHeight: active.draggedHeight,
          indicatorTop: computeIndicatorTop(active, targetIndex),
          orderKeys: active.orderKeys,
        });
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeRef.current && e.cancelable) e.preventDefault();
    };
    let dragTouchAttached = false;
    const attachDragTouch = () => {
      if (dragTouchAttached) return;
      dragTouchAttached = true;
      window.addEventListener('touchmove', onTouchMove, { passive: false });
    };
    const detachDragTouch = () => {
      if (!dragTouchAttached) return;
      dragTouchAttached = false;
      window.removeEventListener('touchmove', onTouchMove);
    };
    attachDragTouchRef.current = attachDragTouch;
    detachDragTouchRef.current = detachDragTouch;

    const onPointerUp = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (p && e.pointerId === p.pointerId) {
        clearPending();
        return;
      }

      const active = activeRef.current;
      if (!active || e.pointerId !== active.pointerId) return;

      detachDragTouch();
      activeRef.current = null;
      const { taskId, fromIndex, targetIndex, draggedHeight, snapshots } = active;
      const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
      const destOffsetY = computeDestOffsetY(snapshots, fromIndex, insertAt);
      const list = tasksRef.current;
      const reordered = moveItemToSlot(list, fromIndex, targetIndex);
      const reorderedIds = reordered !== list ? reordered.map((t) => t.id) : null;
      const reorderedKeys = reordered !== list ? reordered.map(rowKey) : null;

      if (reorderedKeys) {
        setPendingOrderIds(reorderedKeys);
      }
      if (reorderedIds) {
        onReorderRef.current(reorderedIds);
      }

      const draggedEl = rowRefs.current.get(taskId);
      if (draggedEl) {
        draggedEl.style.transition = 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease';
        draggedEl.style.transform = `translateY(${destOffsetY}px)`;
      }

      // Smoothly drop the dragged item into the now-empty slot before clearing transforms
      setDragState({
        taskId,
        fromIndex,
        targetIndex,
        offsetY: destOffsetY,
        settling: true,
        draggedHeight,
        indicatorTop: null,
        orderKeys: active.orderKeys,
      });

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        const settledEl = rowRefs.current.get(taskId);
        if (settledEl) {
          settledEl.style.transform = '';
          settledEl.style.transition = '';
        }
        setDragState(null);
        onDragActiveChangeRef.current?.(false);
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 50);
      }, SETTLE_MS);
    };

    const onPointerCancel = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (p && e.pointerId === p.pointerId) {
        clearPending();
        return;
      }
      if (activeRef.current && e.pointerId === activeRef.current.pointerId) {
        cleanupDragImmediate();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    return () => {
      detachDragTouch();
      attachDragTouchRef.current = () => {};
      detachDragTouchRef.current = () => {};
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
    };
  }, [clearPending, cleanupDragImmediate]);

  const beginDrag = useCallback(
    (taskId: string, pointerId: number, startY: number, vibrate: boolean) => {
      const list = tasksRef.current;
      const fromIndex = list.findIndex((t) => rowKey(t) === taskId);
      const orderKeys = list.map(rowKey);
      if (fromIndex === -1) return;

      const containerTop = containerRef.current?.getBoundingClientRect().top ?? 0;
      const snapshots: RowSnapshot[] = list.map((t) => {
        const key = rowKey(t);
        const rect = rowRefs.current.get(key)?.getBoundingClientRect();
        const top = rect?.top ?? 0;
        const height = rect?.height ?? 0;
        return { id: key, top, height, midpoint: top + height / 2 };
      });
      const draggedHeight = snapshots[fromIndex]?.height ?? 0;

      suppressClickRef.current = true;
      if (vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(15);
      }

      const nextActive: ActiveDrag = {
        taskId,
        pointerId,
        fromIndex,
        startY,
        targetIndex: fromIndex,
        offsetY: 0,
        draggedHeight,
        containerTop,
        snapshots,
        orderKeys,
      };
      activeRef.current = nextActive;
      attachDragTouchRef.current();
      onDragActiveChangeRef.current?.(true);
      setDragState({
        taskId,
        fromIndex,
        targetIndex: fromIndex,
        offsetY: 0,
        settling: false,
        draggedHeight,
        indicatorTop: null,
        orderKeys,
      });
    },
    []
  );
  beginDragRef.current = beginDrag;

  const handleRowPointerDown = useCallback(
    (taskId: string, e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabledRef.current || tasksRef.current.length < 2 || settleTimerRef.current !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, a')) return;

      clearPending();
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;
      const isDragHandle = Boolean((e.target as HTMLElement).closest('[data-drag-handle="true"]'));

      if (isDragHandle && e.pointerType === 'mouse') {
        beginDrag(taskId, pointerId, startY, false);
        return;
      }

      // A list that fits starts reorder on move. A list that overflows keeps the
      // long press so the same move can scroll. The timer still runs either way,
      // so a still hold picks the row up on touch as well as with a mouse.
      const requiresLongPress = listCanScroll(containerRef.current);
      const timerId = window.setTimeout(() => {
        const current = pendingRef.current;
        if (!current || current.taskId !== taskId || current.pointerId !== pointerId) return;
        pendingRef.current = null;
        beginDrag(taskId, pointerId, startY, true);
      }, LONG_PRESS_MS);

      pendingRef.current = { taskId, pointerId, startX, startY, timerId, requiresLongPress };
    },
    [beginDrag, clearPending]
  );

  const handleRowClickCapture = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current || activeRef.current) {
      e.preventDefault();
      e.stopPropagation();
    }
  }, []);

  const handleRowContextMenu = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (suppressClickRef.current || activeRef.current) {
      e.preventDefault();
    }
  }, []);

  const registerRow = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) rowRefs.current.set(id, el);
    else rowRefs.current.delete(id);
  }, []);

  const getRowCallbacks = (key: string) => {
    let entry = rowCallbacksRef.current.get(key);
    if (!entry) {
      entry = {
        rowRef: (el: HTMLDivElement | null) => registerRow(key, el),
        onRowPointerDown: (e: React.PointerEvent<HTMLDivElement>) => handleRowPointerDown(key, e),
      };
      rowCallbacksRef.current.set(key, entry);
    }
    return entry;
  };

  useEffect(() => {
    const activeKeys = new Set(displayTasks.map(rowKey));
    for (const k of rowCallbacksRef.current.keys()) {
      if (!activeKeys.has(k)) rowCallbacksRef.current.delete(k);
    }
  }, [displayTasks]);

  const isDragActive = dragState !== null;
  const insertAt = dragState
    ? dragState.targetIndex > dragState.fromIndex
      ? dragState.targetIndex - 1
      : dragState.targetIndex
    : -1;

  return (
    <div ref={containerRef} className="relative">
      {dragState?.indicatorTop != null && <DropIndicator top={dragState.indicatorTop} />}
      {displayTasks.map((task, idx) => {
        const key = rowKey(task);
        const isDragging = dragState?.taskId === key;
        let shiftY = 0;
        if (dragState && !isDragging) {
          if (dragState.fromIndex < insertAt && idx > dragState.fromIndex && idx <= insertAt) {
            shiftY = -dragState.draggedHeight;
          } else if (
            insertAt < dragState.fromIndex &&
            idx >= insertAt &&
            idx < dragState.fromIndex
          ) {
            shiftY = dragState.draggedHeight;
          }
        }
        const { rowRef, onRowPointerDown } = getRowCallbacks(key);
        return renderRow(task, {
          isDragging,
          isSettling: isDragging && dragState.settling,
          isDragActive,
          dragOffsetY: isDragging ? dragState.offsetY : 0,
          shiftY,
          rowRef,
          onRowPointerDown,
          onRowClickCapture: handleRowClickCapture,
          onRowContextMenu: handleRowContextMenu,
          reorderTouchAction: enabled && tasks.length >= 2 && !canScroll ? 'none' : 'pan-y',
        });
      })}
    </div>
  );
}
