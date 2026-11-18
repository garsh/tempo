import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, type Ref } from 'react';
import type { Task } from '../types/task';
import { buildMonthGrid, shiftMonth, weekdayLabels, type CalendarDayCell } from '../domain/calendar';
import { buildWeekCells, defaultDateForMonth, shiftMonthView, shiftWeek } from '../domain/calendarUi';
import { usePrefs } from '../prefs/prefs';
import { formatDate, getDueDatePart, getRecurrenceAnchor, isCompleted, isCompletedOnDate, isRecurring, isSkippedOnDate, taskOccursOnDate } from '../domain/recurrence';

export const CALENDAR_ROW_HEIGHT = 36;
export const CALENDAR_WEEK_COUNT = 6;
export const CALENDAR_EXPAND_DELTA = CALENDAR_ROW_HEIGHT * (CALENDAR_WEEK_COUNT - 1);

export type CalendarMonthHandle = {
  /** Move the open/closed grid with the finger. Does not re-render. */
  setPullProgress: (progress: number) => void;
  /** Ease to the committed open or closed height, then run `commit` so React matches it. */
  releasePull: (commit: () => void) => void;
};

interface CalendarMonthViewProps {
  tasks: Task[];
  year: number;
  monthIndex: number;
  selectedDateStr: string | null;
  expanded: boolean;
  onToggleExpanded: (next?: boolean) => void;
  onMonthChange: (year: number, monthIndex: number) => void;
  onSelectDate: (dateStr: string) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
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
  onToggleExpanded,
  onMonthChange,
  onSelectDate,
  onSwipeLeft,
  onSwipeRight,
  ref,
}: CalendarMonthViewProps) {
  const [{ weekStart }] = usePrefs();
  const todayStr = formatDate(new Date());
  const focusStr = selectedDateStr || todayStr;

  const containerRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement | null>(null);
  const heightRef = useRef<HTMLDivElement>(null);
  const weekShiftRef = useRef<HTMLDivElement>(null);
  const pullingRef = useRef(false);
  const releaseFrameRef = useRef<number | null>(null);
  const pullLayoutRef = useRef({ expanded, selectedWeekIndex: 0 });
  const currentDragOffsetRef = useRef(0);
  const justSwipedRef = useRef(false);
  const isSnappingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const prevCells = expanded ? prevMonthGrid : prevWeekCells;
  // The entire month is always rendered so that rows expand and shrink smoothly and proportionately
  const currentCells = currentMonthGrid;
  const nextCells = expanded ? nextMonthGrid : nextWeekCells;

  const prevHighlightStr = useMemo(
    () => (expanded ? defaultDateForMonth(prevMonth.year, prevMonth.monthIndex) : prevWeek.dateStr),
    [expanded, prevMonth.year, prevMonth.monthIndex, prevWeek.dateStr]
  );
  const nextHighlightStr = useMemo(
    () => (expanded ? defaultDateForMonth(nextMonth.year, nextMonth.monthIndex) : nextWeek.dateStr),
    [expanded, nextMonth.year, nextMonth.monthIndex, nextWeek.dateStr]
  );

  const dueDateSet = useMemo(() => {
    const set = new Set<string>();
    const recurringTasks: Task[] = [];
    for (const t of tasks) {
      if (t.deletedAt) continue;
      if (isRecurring(t)) {
        recurringTasks.push(t);
      } else if (!isCompleted(t) && t.dueAt) {
        set.add(getDueDatePart(t.dueAt));
      }
    }
    if (recurringTasks.length > 0) {
      const allGrids = [prevCells, currentCells, nextCells];
      const maxDateStr = nextCells[nextCells.length - 1]?.dateStr;

      for (const t of recurringTasks) {
        const anchor = getRecurrenceAnchor(t);
        if (maxDateStr && anchor > maxDateStr) continue;

        for (const grid of allGrids) {
          for (const cell of grid) {
            if (cell.dateStr < anchor) continue;
            if (set.has(cell.dateStr)) continue;
            if (
              taskOccursOnDate(t, cell.dateStr) &&
              !isCompletedOnDate(t, cell.dateStr) &&
              !isSkippedOnDate(t, cell.dateStr)
            ) {
              set.add(cell.dateStr);
            }
          }
        }
      }
    }
    return set;
  }, [tasks, prevCells, currentCells, nextCells]);

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

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        if (target === 1) {
          if (onSwipeLeft) {
            onSwipeLeft();
          } else if (expanded) {
            const next = shiftMonthView(year, monthIndex, selectedDateStr, 1);
            onSelectDate(next.dateStr);
            onMonthChange(next.year, next.monthIndex);
          } else {
            const next = shiftWeek(selectedDateStr, 1);
            onSelectDate(next.dateStr);
            if (next.year !== year || next.monthIndex !== monthIndex) {
              onMonthChange(next.year, next.monthIndex);
            }
          }
        } else if (target === -1) {
          if (onSwipeRight) {
            onSwipeRight();
          } else if (expanded) {
            const prev = shiftMonthView(year, monthIndex, selectedDateStr, -1);
            onSelectDate(prev.dateStr);
            onMonthChange(prev.year, prev.monthIndex);
          } else {
            const prev = shiftWeek(selectedDateStr, -1);
            onSelectDate(prev.dateStr);
            if (prev.year !== year || prev.monthIndex !== monthIndex) {
              onMonthChange(prev.year, prev.monthIndex);
            }
          }
        }

        // Seamlessly reset track offset to 0 without animation
        isSnappingRef.current = false;
        currentDragOffsetRef.current = 0;
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = 'translateX(0px)';
        }

        setTimeout(() => {
          justSwipedRef.current = false;
        }, 100);
      }, SNAP_DURATION);
    },
    [expanded, year, monthIndex, selectedDateStr, onSwipeLeft, onSwipeRight, onSelectDate, onMonthChange]
  );

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
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
        currentDragOffsetRef.current = dx;
        if (trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = `translateX(${dx}px)`;
        }
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (direction !== 'horizontal') {
        if (direction === 'none' && trackRef.current) {
          trackRef.current.style.transition = 'none';
          trackRef.current.style.transform = 'translateX(0px)';
        }
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
      currentDragOffsetRef.current = 0;
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = 'translateX(0px)';
      }
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
  }, [finishSwipe]);

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
      if (pointerDirectionRef.current === 'horizontal' && trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = 'translateX(0px)';
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
      currentDragOffsetRef.current = dx;
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = `translateX(${dx}px)`;
      }
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
      currentDragOffsetRef.current = 0;
      if (trackRef.current) {
        trackRef.current.style.transition = 'none';
        trackRef.current.style.transform = 'translateX(0px)';
      }
    }
    pointerDirectionRef.current = 'none';
  };

  const progress = expanded ? 1 : 0;
  const containerHeight = CALENDAR_ROW_HEIGHT + progress * CALENDAR_EXPAND_DELTA;

  const [isExpanding, setIsExpanding] = useState(false);
  const prevExpandedRef = useRef(expanded);

  useEffect(() => {
    const expandedChanged = prevExpandedRef.current !== expanded;
    prevExpandedRef.current = expanded;
    if (!expandedChanged) return;
    setIsExpanding(true);
    const timer = setTimeout(() => {
      setIsExpanding(false);
    }, 250);
    return () => clearTimeout(timer);
  }, [expanded]);

  const selectedWeekIndex = useMemo(() => {
    const idx = currentMonthGrid.findIndex((c) => c.dateStr === focusStr);
    return idx >= 0 ? Math.floor(idx / 7) : 0;
  }, [currentMonthGrid, focusStr]);

  const gridTranslateY = -selectedWeekIndex * CALENDAR_ROW_HEIGHT * (1 - progress);
  pullLayoutRef.current = { expanded, selectedWeekIndex };

  useImperativeHandle(ref, () => ({
    setPullProgress(progress: number) {
      if (releaseFrameRef.current != null) {
        cancelAnimationFrame(releaseFrameRef.current);
        releaseFrameRef.current = null;
      }
      pullingRef.current = true;
      const p = Math.max(0, Math.min(1, progress));
      const week = pullLayoutRef.current.selectedWeekIndex;
      const heightEl = heightRef.current;
      const shiftEl = weekShiftRef.current;
      if (heightEl) {
        heightEl.style.transition = 'none';
        heightEl.style.height = `${CALENDAR_ROW_HEIGHT + p * CALENDAR_EXPAND_DELTA}px`;
      }
      if (shiftEl) {
        shiftEl.style.transition = 'none';
        shiftEl.style.transform = `translateY(${-week * CALENDAR_ROW_HEIGHT * (1 - p)}px)`;
      }
    },
    releasePull(commit: () => void) {
      pullingRef.current = false;
      const heightEl = heightRef.current;
      if (heightEl) heightEl.style.transition = 'height 200ms ease-out';
      if (weekShiftRef.current) weekShiftRef.current.style.transition = 'transform 200ms ease-out';
      const outer = requestAnimationFrame(() => {
        releaseFrameRef.current = requestAnimationFrame(() => {
          releaseFrameRef.current = null;
          commit();
        });
      });
      releaseFrameRef.current = outer;
    },
  }), []);

  const prevGridKey = expanded
    ? `m-${prevMonth.year}-${prevMonth.monthIndex}`
    : `w-${prevWeek.dateStr}`;
  const currentGridKey = `m-${year}-${monthIndex}`;
  const nextGridKey = expanded
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
          const rowIdx = Math.floor(idx / 7);
          const muted = (progress > 0.05 || (isCurrentPage && rowIdx !== selectedWeekIndex)) && !cell.inCurrentMonth;
          return (
            <button
              key={`${gridKey}-${cell.dateStr}`}
              type="button"
              style={{ height: `${CALENDAR_ROW_HEIGHT}px` }}
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
                className={`w-7 h-7 inline-flex items-center justify-center rounded-full text-[15px] leading-none font-semibold ${
                  selected
                    ? 'bg-tt-blue text-white'
                    : isToday
                      ? 'text-tt-blue font-bold'
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
                    ? muted
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

      <button
        type="button"
        onClick={() => onToggleExpanded()}
        aria-label={expanded ? 'Collapse calendar' : 'Expand calendar'}
        className="w-full flex justify-center pt-1.5 pb-1 cursor-pointer group"
      >
        <span className="w-9 h-1 rounded-full bg-tt-border group-hover:bg-tt-muted transition-colors" />
      </button>
    </div>
  );
}
