import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { Task } from '../types/task';
import { buildMonthGrid, shiftMonth, weekdayLabels, type CalendarDayCell } from '../domain/calendar';
import { buildWeekCells, defaultDateForMonth, shiftMonthView, shiftWeek, type CalendarSwipeEvent } from '../domain/calendarUi';
import { usePrefs } from '../prefs/prefs';
import {
  formatDate,
  getCompletedDateSet,
  getDueDatePart,
  getEarliestOccurrenceBound,
  getEffectiveEndOnDate,
  isCompleted,
  isCompletedOnDate,
  isFixedRecurring,
  isSkippedOnDate,
  taskOccursOnDate,
} from '../domain/recurrence';

export const CALENDAR_ROW_HEIGHT = 36;
export const CALENDAR_WEEK_COUNT = 6;
export const CALENDAR_EXPAND_DELTA = CALENDAR_ROW_HEIGHT * (CALENDAR_WEEK_COUNT - 1);

export type CalendarMonthHandle = {
  /** Move the open/closed grid with the finger. Does not re-render. */
  setPullProgress: (progress: number) => void;
  /** Ease to the committed open or closed height, then run `commit` so React matches it. */
  releasePull: (commit: () => void) => void;
  /** Abort any in-flight swipe snap timer and reset the horizontal track to 0. */
  cancelPendingSwipe: () => void;
};

interface CalendarMonthViewProps {
  tasks: Task[];
  year: number;
  monthIndex: number;
  selectedDateStr: string | null;
  expanded: boolean;
  collapsible?: boolean;
  rowHeight?: number;
  onToggleExpanded: (next?: boolean) => void;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (dateStr: string) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  onSwipeProgress?: (event: CalendarSwipeEvent) => void;
  ref?: Ref<CalendarMonthHandle>;
}

/**
 * TickTick-style collapsible calendar with 3-page carousel swiping:
 * Smoothly follows the user's finger between complete months (or weeks),
 * then snaps slowly and smoothly to the closest complete month/week.
 */
export function CalendarMonthView({
  tasks,
  year,
  monthIndex,
  selectedDateStr,
  expanded,
  collapsible = true,
  rowHeight = CALENDAR_ROW_HEIGHT,
  onToggleExpanded,
  onMonthChange,
  onSelectDate,
  onSwipeLeft,
  onSwipeRight,
  onSwipeProgress,
  ref,
}: CalendarMonthViewProps) {
  const effectiveExpanded = collapsible ? expanded : true;
  const expandDelta = rowHeight * (CALENDAR_WEEK_COUNT - 1);
  const [{ weekStart, showOverdue }] = usePrefs();
  const todayStr = formatDate(new Date());
  const focusStr = selectedDateStr || todayStr;

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef<HTMLDivElement>(null);
  const weekShiftRef = useRef<HTMLDivElement>(null);
  const pullingRef = useRef(false);
  const releaseFrameRef = useRef<number | null>(null);
  const pullLayoutRef = useRef({
    expanded: effectiveExpanded,
    selectedWeekIndex: 0,
    containerHeight: 0,
    gridTranslateY: 0,
    rowHeight,
    expandDelta,
  });
  const currentDragOffsetRef = useRef(0);
  const justSwipedRef = useRef(false);
  const isSnappingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onSwipeProgressRef = useRef(onSwipeProgress);
  onSwipeProgressRef.current = onSwipeProgress;

  const pointerStartXRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const pointerStartTimeRef = useRef(0);
  const pointerDirectionRef = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const dow = useMemo(() => weekdayLabels(weekStart), [weekStart]);

  const prevMonth = useMemo(() => shiftMonth(year, monthIndex, -1), [year, monthIndex]);
  const nextMonth = useMemo(() => shiftMonth(year, monthIndex, 1), [year, monthIndex]);

  const prevMonthGrid = useMemo(
    () => buildMonthGrid(prevMonth.year, prevMonth.monthIndex, new Date(), weekStart),
    [prevMonth.year, prevMonth.monthIndex, weekStart]
  );
  const currentMonthGrid = useMemo(
    () => buildMonthGrid(year, monthIndex, new Date(), weekStart),
    [year, monthIndex, weekStart]
  );
  const nextMonthGrid = useMemo(
    () => buildMonthGrid(nextMonth.year, nextMonth.monthIndex, new Date(), weekStart),
    [nextMonth.year, nextMonth.monthIndex, weekStart]
  );

  const prevWeek = useMemo(() => shiftWeek(focusStr, -1), [focusStr]);
  const nextWeek = useMemo(() => shiftWeek(focusStr, 1), [focusStr]);

  const prevWeekCells = useMemo(
    () => buildWeekCells(prevWeek.dateStr, prevWeek.year, prevWeek.monthIndex, weekStart, todayStr),
    [prevWeek, weekStart, todayStr]
  );
  const nextWeekCells = useMemo(
    () => buildWeekCells(nextWeek.dateStr, nextWeek.year, nextWeek.monthIndex, weekStart, todayStr),
    [nextWeek, weekStart, todayStr]
  );

  const prevCells = effectiveExpanded ? prevMonthGrid : prevWeekCells;
  // The entire month is always rendered so that rows expand and shrink smoothly and proportionately
  const currentCells = currentMonthGrid;
  const nextCells = effectiveExpanded ? nextMonthGrid : nextWeekCells;

  const prevHighlightStr = useMemo(
    () =>
      effectiveExpanded
        ? defaultDateForMonth(prevMonth.year, prevMonth.monthIndex)
        : prevWeek.dateStr,
    [effectiveExpanded, prevMonth.year, prevMonth.monthIndex, prevWeek.dateStr]
  );
  const nextHighlightStr = useMemo(
    () =>
      effectiveExpanded
        ? defaultDateForMonth(nextMonth.year, nextMonth.monthIndex)
        : nextWeek.dateStr,
    [effectiveExpanded, nextMonth.year, nextMonth.monthIndex, nextWeek.dateStr]
  );

  const dueDateSet = useMemo(() => {
    const set = new Set<string>();
    const recurringTasks: Task[] = [];
    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (isFixedRecurring(t)) {
        recurringTasks.push(t);
      } else if (!isCompleted(t) && t.dueAt) {
        set.add(getDueDatePart(t.dueAt));
      }
    }
    if (recurringTasks.length > 0) {
      const uniqueDateSet = new Set<string>();
      for (const grid of [prevCells, currentCells, nextCells]) {
        for (const cell of grid) uniqueDateSet.add(cell.dateStr);
      }
      const uniqueDates = Array.from(uniqueDateSet).sort();
      const minDateStr = uniqueDates[0];
      const maxDateStr = uniqueDates[uniqueDates.length - 1];

      if (minDateStr && maxDateStr) {
        for (const t of recurringTasks) {
          const earliestBound = getEarliestOccurrenceBound(t);
          if (earliestBound > maxDateStr) continue;
          const effectiveEnd = getEffectiveEndOnDate(t);
          if (effectiveEnd && effectiveEnd < minDateStr) continue;
          const endAfterCount = t.recurrence?.endAfterCount;
          if (endAfterCount != null && endAfterCount > 0 && getCompletedDateSet(t).size >= endAfterCount) {
            continue;
          }

          for (const dateStr of uniqueDates) {
            if (dateStr < earliestBound) continue;
            if (effectiveEnd && dateStr > effectiveEnd) break;
            if (set.has(dateStr)) continue;
            if (
              !isCompletedOnDate(t, dateStr) &&
              !isSkippedOnDate(t, dateStr) &&
              taskOccursOnDate(t, dateStr)
            ) {
              set.add(dateStr);
            }
          }
        }
      }
    }
    return set;
  }, [tasks, prevCells, currentCells, nextCells]);

  const applyHorizontalDrag = useCallback((dx: number) => {
    currentDragOffsetRef.current = dx;
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = `translateX(${dx}px)`;
    }
    const width = containerRef.current?.offsetWidth || 360;
    onSwipeProgressRef.current?.({
      phase: 'drag',
      progress: Math.max(-1, Math.min(1, dx / width)),
    });
  }, []);

  const resetHorizontalTrack = useCallback((notifyReset: boolean) => {
    currentDragOffsetRef.current = 0;
    if (trackRef.current) {
      trackRef.current.style.transition = 'none';
      trackRef.current.style.transform = 'translateX(0px)';
    }
    if (notifyReset) {
      onSwipeProgressRef.current?.({ phase: 'reset' });
    }
  }, []);

  const finishSwipe = useCallback(
    (dx: number, dt: number) => {
      const width = containerRef.current?.offsetWidth || 360;
      const velocity = dx / dt;
      let target: -1 | 0 | 1 = 0;

      // Threshold: 18% of width or velocity > 0.3 px/ms
      if (dx <= -width * 0.18 || velocity < -0.3) {
        target = 1; // Snap to next
      } else if (dx >= width * 0.18 || velocity > 0.3) {
        target = -1; // Snap to prev
      }

      justSwipedRef.current = true;
      isSnappingRef.current = true;

      const targetOffset = target === 1 ? -width : target === -1 ? width : 0;
      currentDragOffsetRef.current = targetOffset;
      if (trackRef.current) {
        trackRef.current.style.transition = 'transform 350ms cubic-bezier(0.25, 1, 0.5, 1)';
        trackRef.current.style.transform = `translateX(${targetOffset}px)`;
      }

      // Slow and smooth snap transition duration (350ms)
      const SNAP_DURATION = 350;
      onSwipeProgressRef.current?.({ phase: 'snap', target, durationMs: SNAP_DURATION });

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        snapTimerRef.current = null;
        let monthWillChange = false;
        if (target !== 0) {
          const customHandler = target === 1 ? onSwipeLeft : onSwipeRight;
          if (customHandler) {
            customHandler();
          } else {
            const shifted = effectiveExpanded
              ? shiftMonthView(year, monthIndex, selectedDateStr, target)
              : shiftWeek(selectedDateStr, target);
            onSelectDate(shifted.dateStr);
            if (shifted.year !== year || shifted.monthIndex !== monthIndex) {
              monthWillChange = true;
              onMonthChange(shifted.year, shifted.monthIndex);
            } else if (effectiveExpanded) {
              onMonthChange(shifted.year, shifted.monthIndex);
            }
          }
        }

        // Seamlessly reset track offset to 0 without animation
        isSnappingRef.current = false;
        resetHorizontalTrack(!monthWillChange);

        setTimeout(() => {
          justSwipedRef.current = false;
        }, 100);
      }, SNAP_DURATION);
    },
    [effectiveExpanded, year, monthIndex, selectedDateStr, onSwipeLeft, onSwipeRight, onSelectDate, onMonthChange, resetHorizontalTrack]
  );

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
        onSwipeProgressRef.current?.({ phase: 'reset' });
      }
    };
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let direction: 'none' | 'horizontal' | 'vertical' = 'none';

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isSnappingRef.current) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      direction = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isSnappingRef.current || pullingRef.current) return;

      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (direction === 'none') {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          direction = 'horizontal';
        } else if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
          direction = 'vertical';
        }
      }

      if (direction === 'horizontal') {
        if (e.cancelable) e.preventDefault();
        applyHorizontalDrag(dx);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (direction !== 'horizontal') {
        if (direction === 'none') resetHorizontalTrack(false);
        return;
      }
      direction = 'none';
      if (e.changedTouches[0]) {
        const dx = e.changedTouches[0].clientX - startX;
        const dt = Math.max(1, Date.now() - startTime);
        finishSwipe(dx, dt);
      }
    };

    const onTouchCancel = () => {
      direction = 'none';
      resetHorizontalTrack(true);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [finishSwipe, applyHorizontalDrag, resetHorizontalTrack]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || isSnappingRef.current || e.button !== 0) return;
    pointerStartXRef.current = e.clientX;
    pointerStartYRef.current = e.clientY;
    pointerStartTimeRef.current = Date.now();
    pointerDirectionRef.current = 'none';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || isSnappingRef.current || pointerDirectionRef.current === 'vertical') return;
    if ((e.buttons & 1) === 0) {
      if (pointerDirectionRef.current === 'horizontal') {
        resetHorizontalTrack(true);
      }
      pointerDirectionRef.current = 'none';
      return;
    }
    const dx = e.clientX - pointerStartXRef.current;
    const dy = e.clientY - pointerStartYRef.current;

    if (pointerDirectionRef.current === 'none') {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        pointerDirectionRef.current = 'horizontal';
      } else if (Math.abs(dy) > 6) {
        pointerDirectionRef.current = 'vertical';
      }
    }

    if (pointerDirectionRef.current === 'horizontal') {
      applyHorizontalDrag(dx);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (pointerDirectionRef.current === 'horizontal') {
      const dx = e.clientX - pointerStartXRef.current;
      const dt = Math.max(1, Date.now() - pointerStartTimeRef.current);
      finishSwipe(dx, dt);
    }
    pointerDirectionRef.current = 'none';
  };

  const onPointerCancel = () => {
    if (pointerDirectionRef.current === 'horizontal') {
      resetHorizontalTrack(true);
    }
    pointerDirectionRef.current = 'none';
  };

  const progress = effectiveExpanded ? 1 : 0;
  const containerHeight = rowHeight + progress * expandDelta;

  const [isExpanding, setIsExpanding] = useState(false);
  const prevExpandedRef = useRef(effectiveExpanded);

  useEffect(() => {
    const expandedChanged = prevExpandedRef.current !== effectiveExpanded;
    prevExpandedRef.current = effectiveExpanded;
    if (!expandedChanged) return;
    setIsExpanding(true);
    const timer = setTimeout(() => {
      setIsExpanding(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [effectiveExpanded]);

  const selectedWeekIndex = useMemo(() => {
    const idx = currentMonthGrid.findIndex((c) => c.dateStr === focusStr);
    return idx >= 0 ? Math.floor(idx / 7) : 0;
  }, [currentMonthGrid, focusStr]);

  const gridTranslateY = -selectedWeekIndex * rowHeight * (1 - progress);
  pullLayoutRef.current = {
    expanded: effectiveExpanded,
    selectedWeekIndex,
    containerHeight,
    gridTranslateY,
    rowHeight,
    expandDelta,
  };

  useImperativeHandle(ref, () => ({
    setPullProgress(progress: number) {
      if (releaseFrameRef.current != null) {
        cancelAnimationFrame(releaseFrameRef.current);
        releaseFrameRef.current = null;
      }
      pullingRef.current = true;
      const p = Math.max(0, Math.min(1, progress));
      const { selectedWeekIndex: week, rowHeight: rh, expandDelta: ed } = pullLayoutRef.current;
      const heightEl = heightRef.current;
      const shiftEl = weekShiftRef.current;
      if (heightEl) {
        heightEl.style.transition = 'none';
        heightEl.style.height = `${rh + p * ed}px`;
      }
      if (shiftEl) {
        shiftEl.style.transition = 'none';
        shiftEl.style.transform = `translateY(${-week * rh * (1 - p)}px)`;
      }
    },
    releasePull(commit: () => void) {
      pullingRef.current = false;
      const heightEl = heightRef.current;
      const shiftEl = weekShiftRef.current;
      const { containerHeight: targetHeight, gridTranslateY: targetTranslateY } = pullLayoutRef.current;
      if (heightEl) {
        heightEl.style.transition = 'height 200ms ease-out';
        heightEl.style.height = `${targetHeight}px`;
      }
      if (shiftEl) {
        shiftEl.style.transition = 'transform 200ms ease-out';
        shiftEl.style.transform = `translateY(${targetTranslateY}px)`;
      }
      const outer = requestAnimationFrame(() => {
        releaseFrameRef.current = requestAnimationFrame(() => {
          releaseFrameRef.current = null;
          commit();
        });
      });
      releaseFrameRef.current = outer;
    },
    cancelPendingSwipe() {
      if (snapTimerRef.current) {
        clearTimeout(snapTimerRef.current);
        snapTimerRef.current = null;
      }
      isSnappingRef.current = false;
      justSwipedRef.current = false;
      currentDragOffsetRef.current = 0;
      pointerDirectionRef.current = 'none';
      resetHorizontalTrack(true);
    },
  }), [resetHorizontalTrack]);

  const prevGridKey = effectiveExpanded
    ? `m-${prevMonth.year}-${prevMonth.monthIndex}`
    : `w-${prevWeek.dateStr}`;
  const currentGridKey = `m-${year}-${monthIndex}`;
  const nextGridKey = effectiveExpanded
    ? `m-${nextMonth.year}-${nextMonth.monthIndex}`
    : `w-${nextWeek.dateStr}`;

  const renderCells = (
    cells: CalendarDayCell[],
    highlightDateStr: string,
    isCurrentPage: boolean = false,
    gridKey: string = ''
  ) => {
    return (
      <div key={gridKey} className="grid grid-cols-7">
        {cells.map((cell, idx) => {
          const selected = highlightDateStr === cell.dateStr;
          const isToday = cell.dateStr === todayStr;
          const hasTasks = dueDateSet.has(cell.dateStr);
          const isOverduePast = showOverdue && cell.dateStr < todayStr && hasTasks;
          const rowIdx = Math.floor(idx / 7);
          const muted = (progress > 0.05 || (isCurrentPage && rowIdx !== selectedWeekIndex)) && !cell.inCurrentMonth;
          return (
            <button
              key={`${gridKey}-${cell.dateStr}`}
              data-date={isCurrentPage ? cell.dateStr : undefined}
              tabIndex={isCurrentPage ? undefined : -1}
              aria-current={isCurrentPage && isToday ? 'date' : undefined}
              type="button"
              style={{ height: `${rowHeight}px` }}
              onClick={() => {
                if (justSwipedRef.current || isSnappingRef.current) return;
                onSelectDate(cell.dateStr);
                if (
                  cell.date.getFullYear() !== year ||
                  cell.date.getMonth() !== monthIndex
                ) {
                  onMonthChange(cell.date.getFullYear(), cell.date.getMonth());
                }
              }}
              className="flex flex-col items-center justify-center rounded-xl hover:bg-tt-sidebar/60 transition-colors cursor-pointer"
            >
              <span
                className={`${
                  rowHeight >= 40 ? 'w-8 h-8 text-[14px]' : 'w-7 h-7 text-[15px]'
                } inline-flex items-center justify-center rounded-full leading-none font-semibold ${
                  selected
                    ? 'bg-tt-blue text-white'
                    : isToday
                      ? 'bg-tt-blue-soft text-tt-blue dark:text-blue-300 ring-1 ring-inset ring-tt-blue/80 font-bold'
                      : muted
                        ? 'text-tt-muted'
                        : 'text-tt-text'
                }`}
              >
                {cell.date.getDate()}
              </span>
              <span
                className={`w-1 h-1 rounded-full -mt-1 ${
                  hasTasks
                    ? isOverduePast
                      ? muted
                        ? 'bg-tt-overdue/40'
                        : 'bg-tt-overdue'
                      : muted
                        ? 'bg-tt-muted'
                        : 'bg-tt-blue'
                    : 'opacity-0'
                }`}
              />
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div
      ref={containerRef}
      className="select-none touch-pan-y"
      style={{ touchAction: 'pan-y' }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
    >
      <div className="grid grid-cols-7 text-[13px] font-medium text-tt-muted">
        {dow.map((d) => (
          <div key={d} className="text-center py-1">
            {d}
          </div>
        ))}
      </div>

      <div
        ref={heightRef}
        style={{ height: `${containerHeight}px` }}
        className="overflow-hidden relative w-full transition-[height] duration-200 ease-out"
      >
        <div
          ref={trackRef}
          style={{
            transform: 'translateX(0px)',
            willChange: 'transform',
          }}
          className="w-full relative"
        >
          {/* Previous page (left) */}
          <div
            style={{ position: 'absolute', top: 0, left: '-100%', width: '100%' }}
            aria-hidden="true"
          >
            {renderCells(prevCells, prevHighlightStr, false, prevGridKey)}
          </div>

          {/* Current page (center) */}
          <div
            ref={weekShiftRef}
            style={{
              position: 'relative',
              top: 0,
              left: 0,
              width: '100%',
              transform: `translateY(${gridTranslateY}px)`,
              ...(isExpanding ? { transition: 'transform 200ms ease-out' } : {}),
            }}
          >
            {renderCells(currentCells, focusStr, true, currentGridKey)}
          </div>

          {/* Next page (right) */}
          <div
            style={{ position: 'absolute', top: 0, left: '100%', width: '100%' }}
            aria-hidden="true"
          >
            {renderCells(nextCells, nextHighlightStr, false, nextGridKey)}
          </div>
        </div>
      </div>

      {collapsible && (
        <button
          type="button"
          onClick={() => onToggleExpanded()}
          aria-label={effectiveExpanded ? 'Collapse calendar' : 'Expand calendar'}
          className="w-full flex justify-center pt-1.5 pb-1 cursor-pointer group"
        >
          <span className="w-9 h-1 rounded-full bg-tt-border group-hover:bg-tt-muted transition-colors" />
        </button>
      )}
    </div>
  );
}
