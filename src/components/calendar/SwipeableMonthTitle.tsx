import { useCallback, useImperativeHandle, useLayoutEffect, useRef, type Ref } from 'react';
import {
  computeMonthTitleSwipeState,
  type CalendarSwipeEvent,
  type MonthTitleSwipeState,
} from '../../domain/calendarUi';

export type SwipeableMonthTitleHandle = {
  applySwipe: (event: CalendarSwipeEvent) => void;
};

interface SwipeableMonthTitleProps {
  prevTitle: string;
  currentTitle: string;
  nextTitle: string;
  canSwipePrev: boolean;
  canSwipeNext: boolean;
  expanded: boolean;
  onClick: () => void;
  ref?: Ref<SwipeableMonthTitleHandle>;
}

/**
 * Header month title whose horizontal carousel track tracks `CalendarMonthView`
 * swipe gestures frame-by-frame via CSS custom properties without React re-renders.
 */
export function SwipeableMonthTitle({
  prevTitle,
  currentTitle,
  nextTitle,
  canSwipePrev,
  canSwipeNext,
  expanded,
  onClick,
  ref,
}: SwipeableMonthTitleProps) {
  const trackRef = useRef<HTMLSpanElement>(null);
  const prevRef = useRef<HTMLSpanElement>(null);
  const currentRef = useRef<HTMLSpanElement>(null);
  const nextRef = useRef<HTMLSpanElement>(null);
  const capabilitiesRef = useRef({ canSwipePrev, canSwipeNext });
  capabilitiesRef.current = { canSwipePrev, canSwipeNext };

  const applyState = useCallback(
    (state: MonthTitleSwipeState, snapping: boolean, durationMs?: number) => {
      const track = trackRef.current;
      if (track) {
        if (snapping) {
          track.dataset.snapping = 'true';
          track.style.setProperty('--month-title-snap-ms', `${durationMs ?? 350}ms`);
        } else {
          delete track.dataset.snapping;
          track.style.removeProperty('--month-title-snap-ms');
        }
        track.style.setProperty('--month-title-x', `${state.translatePercent}%`);
      }
      prevRef.current?.style.setProperty('--month-title-opacity', String(state.prevOpacity));
      currentRef.current?.style.setProperty('--month-title-opacity', String(state.currentOpacity));
      nextRef.current?.style.setProperty('--month-title-opacity', String(state.nextOpacity));
    },
    []
  );

  const resetTrack = useCallback(() => {
    applyState({ translatePercent: 0, prevOpacity: 0, currentOpacity: 1, nextOpacity: 0 }, false);
  }, [applyState]);

  useLayoutEffect(() => {
    resetTrack();
  }, [prevTitle, currentTitle, nextTitle, canSwipePrev, canSwipeNext, resetTrack]);

  useImperativeHandle(
    ref,
    () => ({
      applySwipe(event: CalendarSwipeEvent) {
        const { canSwipePrev: allowPrev, canSwipeNext: allowNext } = capabilitiesRef.current;
        if (event.phase === 'reset') {
          resetTrack();
          return;
        }
        if (event.phase === 'drag') {
          applyState(computeMonthTitleSwipeState(event.progress, allowPrev, allowNext), false);
          return;
        }
        applyState(
          computeMonthTitleSwipeState(-event.target, allowPrev, allowNext),
          true,
          event.durationMs
        );
      },
    }),
    [applyState, resetTrack]
  );

  return (
    <button
      type="button"
      onClick={onClick}
      aria-expanded={expanded}
      title="Click to expand/collapse month"
      className="block max-w-full overflow-hidden text-left text-[22px] sm:text-[25px] font-bold tracking-[-0.01em] text-tt-text cursor-pointer hover:opacity-80 transition-opacity"
    >
      <span
        ref={trackRef}
        className="month-title-track relative grid grid-cols-[minmax(0,max-content)] w-full"
      >
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1 invisible truncate pr-6 pointer-events-none select-none"
        >
          {prevTitle}
        </span>
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1 invisible truncate pr-6 pointer-events-none select-none"
        >
          {currentTitle}
        </span>
        <span
          aria-hidden="true"
          className="col-start-1 row-start-1 invisible truncate pr-6 pointer-events-none select-none"
        >
          {nextTitle}
        </span>
        <span
          ref={prevRef}
          data-slot="prev"
          aria-hidden="true"
          className="month-title-slide absolute inset-y-0 -left-full w-full truncate pointer-events-none select-none"
        >
          {prevTitle}
        </span>
        <span
          ref={currentRef}
          data-slot="current"
          className="month-title-slide col-start-1 row-start-1 w-full truncate"
        >
          {currentTitle}
        </span>
        <span
          ref={nextRef}
          data-slot="next"
          aria-hidden="true"
          className="month-title-slide absolute inset-y-0 left-full w-full truncate pointer-events-none select-none"
        >
          {nextTitle}
        </span>
      </span>
    </button>
  );
}
