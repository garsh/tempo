import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Task } from '../types/task';
import { moveItemToSlot } from '../domain/reorder';

const LONG_PRESS_MS = 350;
const MOVE_CANCEL_PX = 8;
const SETTLE_MS = 165;

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
}

interface PendingPress {
  taskId: string;
  pointerId: number;
  startX: number;
  startY: number;
  timerId: number;
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
 * Renders a list of tasks where long-pressing an item selects it for drag-and-drop
 * reordering between other items in the same list/day.
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
  const containerRef = useRef<HTMLDivElement | null>(null);
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const pendingRef = useRef<PendingPress | null>(null);
  const activeRef = useRef<ActiveDrag | null>(null);
  const settleTimerRef = useRef<number | null>(null);
  const suppressClickRef = useRef(false);

  const tasksRef = useRef(tasks);
  const onReorderRef = useRef(onReorder);
  const onDragActiveChangeRef = useRef(onDragActiveChange);

  useEffect(() => {
    tasksRef.current = tasks;
    onReorderRef.current = onReorder;
    onDragActiveChangeRef.current = onDragActiveChange;
  });

  // Clear optimistic pending order once `tasks` from Dexie reflects the new order (or after timeout)
  useEffect(() => {
    if (!pendingOrderIds) return;
    const sameOrder =
      tasks.length === pendingOrderIds.length &&
      tasks.every((t, i) => rowKey(t) === pendingOrderIds[i]);
    if (sameOrder) {
      setPendingOrderIds(null);
      return;
    }
    const timer = window.setTimeout(() => setPendingOrderIds(null), 1000);
    return () => window.clearTimeout(timer);
  }, [tasks, pendingOrderIds]);

  const displayTasks = useMemo(() => {
    if (!pendingOrderIds) return tasks;
    const byKey = new Map(tasks.map((t) => [rowKey(t), t]));
    const ordered: Task[] = [];
    for (const key of pendingOrderIds) {
      const t = byKey.get(key);
      if (t) {
        ordered.push(t);
        byKey.delete(key);
      }
    }
    for (const t of byKey.values()) ordered.push(t);
    return ordered;
  }, [tasks, pendingOrderIds]);

  const clearPending = useCallback(() => {
    const p = pendingRef.current;
    if (p) {
      window.clearTimeout(p.timerId);
      pendingRef.current = null;
    }
  }, []);

  const cleanupDragImmediate = useCallback(() => {
    clearPending();
    if (settleTimerRef.current !== null) {
      window.clearTimeout(settleTimerRef.current);
      settleTimerRef.current = null;
    }
    if (activeRef.current) {
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
        if (Math.hypot(dx, dy) > MOVE_CANCEL_PX) {
          clearPending();
        }
        return;
      }

      const active = activeRef.current;
      if (!active || e.pointerId !== active.pointerId) return;

      const offsetY = e.clientY - active.startY;
      const targetIndex = computeTargetIndex(e.clientY, active.snapshots);
      active.offsetY = offsetY;
      active.targetIndex = targetIndex;
      setDragState({
        taskId: active.taskId,
        fromIndex: active.fromIndex,
        targetIndex,
        offsetY,
        settling: false,
        draggedHeight: active.draggedHeight,
        indicatorTop: computeIndicatorTop(active, targetIndex),
      });
    };

    const onTouchMove = (e: TouchEvent) => {
      if (activeRef.current) {
        e.preventDefault();
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (p && e.pointerId === p.pointerId) {
        clearPending();
        return;
      }

      const active = activeRef.current;
      if (!active || e.pointerId !== active.pointerId) return;

      activeRef.current = null;
      const { taskId, fromIndex, targetIndex, draggedHeight, snapshots } = active;
      const insertAt = targetIndex > fromIndex ? targetIndex - 1 : targetIndex;
      const destOffsetY = computeDestOffsetY(snapshots, fromIndex, insertAt);
      const list = tasksRef.current;
      const reordered = moveItemToSlot(list, fromIndex, targetIndex);
      const reorderedIds = reordered !== list ? reordered.map((t) => t.id) : null;
      const reorderedKeys = reordered !== list ? reordered.map(rowKey) : null;

      if (reorderedIds) {
        onReorderRef.current(reorderedIds);
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
      });

      settleTimerRef.current = window.setTimeout(() => {
        settleTimerRef.current = null;
        if (reorderedKeys) {
          setPendingOrderIds(reorderedKeys);
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
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerCancel);
      window.removeEventListener('touchmove', onTouchMove);
    };
  }, [clearPending, cleanupDragImmediate]);

  const handleRowPointerDown = useCallback(
    (taskId: string, e: React.PointerEvent<HTMLDivElement>) => {
      if (!enabled || tasksRef.current.length < 2 || settleTimerRef.current !== null) return;
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      if ((e.target as HTMLElement).closest('button, input, a')) return;

      clearPending();
      const pointerId = e.pointerId;
      const startX = e.clientX;
      const startY = e.clientY;

      const timerId = window.setTimeout(() => {
        const current = pendingRef.current;
        if (!current || current.taskId !== taskId || current.pointerId !== pointerId) return;
        pendingRef.current = null;

        const list = tasksRef.current;
        const fromIndex = list.findIndex((t) => rowKey(t) === taskId);
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
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
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
        };
        activeRef.current = nextActive;
        onDragActiveChangeRef.current?.(true);
        setDragState({
          taskId,
          fromIndex,
          targetIndex: fromIndex,
          offsetY: 0,
          settling: false,
          draggedHeight,
          indicatorTop: null,
        });
      }, LONG_PRESS_MS);

      pendingRef.current = { taskId, pointerId, startX, startY, timerId };
    },
    [enabled, clearPending]
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
        return renderRow(task, {
          isDragging,
          isSettling: isDragging && dragState.settling,
          isDragActive,
          dragOffsetY: isDragging ? dragState.offsetY : 0,
          shiftY,
          rowRef: (el) => registerRow(key, el),
          onRowPointerDown: (e) => handleRowPointerDown(key, e),
          onRowClickCapture: handleRowClickCapture,
          onRowContextMenu: handleRowContextMenu,
        });
      })}
    </div>
  );
}
