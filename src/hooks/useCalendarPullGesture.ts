import { useCallback, useEffect, useRef, type PointerEvent, type RefObject } from 'react';
import {
  calendarExpandProgress,
  classifyCalendarPull,
  commitCalendarExpanded,
} from '../domain/calendarUi';
import { CALENDAR_EXPAND_DELTA, type CalendarMonthHandle } from '../components/CalendarMonthView';

interface PullGestureState {
  startY: number;
  startX: number;
  startProgress: number;
  latestProgress: number;
  mode: 'pending' | 'drag' | 'scroll';
}

interface UseCalendarPullGestureOptions {
  calAreaRef: RefObject<HTMLDivElement | null>;
  calScrollRef: RefObject<HTMLDivElement | null>;
  monthViewRef: RefObject<CalendarMonthHandle | null>;
  calExpanded: boolean;
  setCalExpanded: (expanded: boolean) => void;
  active: boolean;
}

/**
 * Unifies touch and mouse pull-to-expand/collapse gestures on the calendar container
 * while coordinating with task drag-to-reorder so the two gestures never conflict.
 */
export function useCalendarPullGesture({
  calAreaRef,
  calScrollRef,
  monthViewRef,
  calExpanded,
  setCalExpanded,
  active,
}: UseCalendarPullGestureOptions) {
  const gestureRef = useRef<PullGestureState | null>(null);
  const pointerCleanupRef = useRef<(() => void) | null>(null);
  const isTaskReorderingRef = useRef(false);
  const calExpandedRef = useRef(calExpanded);
  calExpandedRef.current = calExpanded;
  const setCalExpandedRef = useRef(setCalExpanded);
  setCalExpandedRef.current = setCalExpanded;

  const stopWindowTracking = useCallback(() => {
    const cleanup = pointerCleanupRef.current;
    if (cleanup) {
      pointerCleanupRef.current = null;
      cleanup();
    }
  }, []);

  useEffect(() => stopWindowTracking, [stopWindowTracking]);

  const startPull = useCallback((clientX: number, clientY: number) => {
    if (isTaskReorderingRef.current) return;
    const startProgress = calExpandedRef.current ? 1 : 0;
    gestureRef.current = {
      startY: clientY,
      startX: clientX,
      startProgress,
      latestProgress: startProgress,
      mode: 'pending',
    };
  }, []);

  const movePull = useCallback(
    (clientX: number, clientY: number, target: EventTarget | null, onDrag?: () => void) => {
      if (isTaskReorderingRef.current) return;
      const g = gestureRef.current;
      if (!g) return;

      const dy = clientY - g.startY;
      const dx = clientX - g.startX;

      if (g.mode === 'pending') {
        const scroller = calScrollRef.current;
        const nextMode = classifyCalendarPull({
          mode: g.mode,
          dx,
          dy,
          atTop: !scroller || scroller.scrollTop <= 1,
          onHeader: scroller ? !scroller.contains(target as Node) : true,
          expanded: calExpandedRef.current,
        });
        if (nextMode === 'pending') return;
        if (nextMode === 'scroll') {
          gestureRef.current = null;
          return;
        }
        g.mode = 'drag';
      }

      if (g.mode === 'drag') {
        onDrag?.();
        const next = calendarExpandProgress(g.startProgress, dy, CALENDAR_EXPAND_DELTA);
        g.latestProgress = next;
        monthViewRef.current?.setPullProgress(next);
      }
    },
    [calScrollRef, monthViewRef],
  );

  const endPull = useCallback(() => {
    if (isTaskReorderingRef.current) {
      gestureRef.current = null;
      return;
    }
    const g = gestureRef.current;
    gestureRef.current = null;
    if (!g || g.mode !== 'drag') return;
    const shouldExpand = commitCalendarExpanded(g.startProgress, g.latestProgress);
    monthViewRef.current?.releasePull(() => {
      setCalExpandedRef.current(shouldExpand);
    });
  }, [monthViewRef]);

  const cancelPull = useCallback(() => {
    stopWindowTracking();
    gestureRef.current = null;
  }, [stopWindowTracking]);

  const handleDragActiveChange = useCallback(
    (dragActive: boolean) => {
      isTaskReorderingRef.current = dragActive;
      if (dragActive) {
        stopWindowTracking();
        const g = gestureRef.current;
        gestureRef.current = null;
        if (g && g.mode === 'drag') {
          monthViewRef.current?.releasePull(() => {});
        }
      }
    },
    [monthViewRef, stopWindowTracking],
  );

  useEffect(() => {
    if (!active) return;
    const area = calAreaRef.current;
    if (!area) return;

    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      if (t) startPull(t.clientX, t.clientY);
    };

    const onTouchMove = (e: TouchEvent) => {
      const t = e.touches[0];
      if (!t) return;
      movePull(t.clientX, t.clientY, e.target, () => e.preventDefault());
    };

    area.addEventListener('touchstart', onTouchStart, { passive: true });
    area.addEventListener('touchmove', onTouchMove, { passive: false });
    area.addEventListener('touchend', endPull, { passive: true });
    area.addEventListener('touchcancel', endPull, { passive: true });
    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchmove', onTouchMove);
      area.removeEventListener('touchend', endPull);
      area.removeEventListener('touchcancel', endPull);
    };
  }, [active, calAreaRef, startPull, movePull, endPull]);

  const onPointerDown = useCallback(
    (e: PointerEvent<HTMLDivElement>) => {
      if (e.pointerType === 'touch' || e.button !== 0) return;
      stopWindowTracking();
      startPull(e.clientX, e.clientY);
      if (typeof window === 'undefined') return;

      const onWinMove = (ev: globalThis.PointerEvent) => {
        if (ev.pointerType === 'touch') return;
        if ((ev.buttons & 1) === 0) {
          stopWindowTracking();
          endPull();
          return;
        }
        movePull(ev.clientX, ev.clientY, ev.target);
      };

      const onWinEnd = (ev: globalThis.PointerEvent) => {
        if (ev.pointerType === 'touch') return;
        stopWindowTracking();
        endPull();
      };

      const onWinCancel = () => {
        stopWindowTracking();
        const g = gestureRef.current;
        gestureRef.current = null;
        if (g && g.mode === 'drag') {
          monthViewRef.current?.releasePull(() => {});
        }
      };

      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinEnd);
      window.addEventListener('pointercancel', onWinCancel);
      window.addEventListener('blur', onWinCancel);
      pointerCleanupRef.current = () => {
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinEnd);
        window.removeEventListener('pointercancel', onWinCancel);
        window.removeEventListener('blur', onWinCancel);
      };
    },
    [startPull, movePull, endPull, monthViewRef, stopWindowTracking],
  );

  return {
    handleDragActiveChange,
    cancelPull,
    areaPointerProps: {
      onPointerDown,
    },
  };
}
