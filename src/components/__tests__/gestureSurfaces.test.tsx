// @vitest-environment happy-dom
import { act, useCallback, useRef, useState, type ReactElement, type RefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CALENDAR_EXPAND_DELTA,
  CALENDAR_ROW_HEIGHT,
  CalendarMonthView,
  type CalendarMonthHandle,
} from '../CalendarMonthView';
import {
  SwipeableMonthTitle,
  type SwipeableMonthTitleHandle,
} from '../calendar/SwipeableMonthTitle';
import { ReorderableTaskList } from '../ReorderableTaskList';
import { TaskCard } from '../TaskCard';
import {
  calendarHeaderTitle,
  shiftMonth,
  shiftWeek,
  type CalendarSwipeEvent,
} from '../../domain/calendarUi';
import { resetPrefsCache } from '../../prefs/prefs';
import type { Task } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    dueAt: '2026-11-18',
    ...partial,
  };
}

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function dispatchTouch(
  el: Element,
  type: 'touchstart' | 'touchmove' | 'touchend',
  x: number,
  y: number
): TouchEvent {
  const point = new Touch({
    identifier: 1,
    target: el,
    clientX: x,
    clientY: y,
    pageX: x,
    pageY: y,
    screenX: x,
    screenY: y,
    radiusX: 0,
    radiusY: 0,
    rotationAngle: 0,
    force: 1,
  });
  const event = new TouchEvent(type, {
    bubbles: true,
    cancelable: true,
    touches: type === 'touchend' ? [] : [point],
    changedTouches: [point],
    targetTouches: type === 'touchend' ? [] : [point],
  });
  el.dispatchEvent(event);
  return event;
}

function pointer(
  type: 'pointerdown' | 'pointermove' | 'pointerup' | 'pointercancel',
  x: number,
  y: number,
  buttons: number
): PointerEvent {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    pointerId: 1,
    pointerType: 'mouse',
    button: 0,
    buttons,
  });
}

function slidingRow(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[style*="translateX"]');
  if (!el) throw new Error('sliding row not found');
  return el;
}

function actionDrawer(container: HTMLElement): HTMLElement {
  const el = container.querySelector<HTMLElement>('[data-testid="task-action-drawer"]');
  if (!el) throw new Error('action drawer not found');
  return el;
}

function isDrawerHidden(drawer: HTMLElement): boolean {
  if (drawer.style.visibility === 'visible') return false;
  return drawer.style.visibility === 'hidden' || drawer.classList.contains('invisible');
}

function visibleDotsOnDay(container: HTMLElement, dayNum: string): number {
  return [...container.querySelectorAll('button')].filter((button) => {
    if (button.closest('[aria-hidden="true"]')) return false;
    const spans = button.querySelectorAll('span');
    if (spans[0]?.textContent !== dayNum) return false;
    return spans[1] != null && !spans[1].className.includes('opacity-0');
  }).length;
}

beforeEach(() => {
  localStorage.clear();
  resetPrefsCache();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('TaskCard swipe', () => {
  it('leaves the card closed when the finger moves vertically', () => {
    const onSelect = vi.fn();
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={onSelect} />
    );
    const row = slidingRow(view.container);
    const move = dispatchTouch(row, 'touchstart', 100, 40);
    expect(move.defaultPrevented).toBe(false);
    const vertical = dispatchTouch(row, 'touchmove', 100, 80);
    dispatchTouch(row, 'touchend', 100, 80);

    expect(vertical.defaultPrevented).toBe(false);
    expect(row.style.transform).toBe('translateX(0px)');
    view.unmount();
  });

  it('opens the action drawer after a left swipe past the threshold', () => {
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={vi.fn()} />
    );
    const row = slidingRow(view.container);
    dispatchTouch(row, 'touchstart', 180, 40);
    const horizontal = dispatchTouch(row, 'touchmove', 100, 42);
    expect(horizontal.defaultPrevented).toBe(false);
    expect(row.style.touchAction).toBe('pan-y');
    expect(row.style.transform).toBe('translateX(-80px)');
    dispatchTouch(row, 'touchend', 100, 42);
    expect(row.style.transform).toBe('translateX(-160px)');
    view.unmount();
  });

  it('snaps shut when a left swipe stops short of the threshold', () => {
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={vi.fn()} />
    );
    const row = slidingRow(view.container);
    dispatchTouch(row, 'touchstart', 80, 40);
    dispatchTouch(row, 'touchmove', 50, 40);
    dispatchTouch(row, 'touchend', 50, 40);
    expect(row.style.transform).toBe('translateX(0px)');
    view.unmount();
  });

  it('keeps the action drawer hidden and foreground opaque while touching and vertically scrolling a completed task', () => {
    const view = mount(
      <TaskCard
        task={task({ id: 'done-1', title: 'Completed chore', completedAt: 1700000000000 })}
        onComplete={vi.fn()}
        onSelect={vi.fn()}
      />
    );
    const row = slidingRow(view.container);
    const drawer = actionDrawer(view.container);

    expect(row.classList.contains('opacity-60')).toBe(false);
    expect(row.classList.contains('opacity-50')).toBe(false);
    expect(row.classList.contains('hover:bg-tt-hover')).toBe(false);
    const titleWrapper = view.container.querySelector('[data-testid="task-title"]')?.closest('.flex-1');
    expect(titleWrapper?.classList.contains('opacity-60')).toBe(true);

    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchstart', 100, 120);
    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchmove', 100, 40);
    expect(isDrawerHidden(drawer)).toBe(true);
    expect(row.style.transform).toBe('translateX(0px)');
    act(() => {
      dispatchTouch(row, 'touchend', 100, 40);
    });
    expect(isDrawerHidden(drawer)).toBe(true);
    expect(row.style.transform).toBe('translateX(0px)');
    view.unmount();
  });

  it('keeps the action drawer hidden during a right swipe on a closed card', () => {
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={vi.fn()} />
    );
    const row = slidingRow(view.container);
    const drawer = actionDrawer(view.container);

    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchstart', 100, 40);
    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchmove', 160, 40);
    expect(isDrawerHidden(drawer)).toBe(true);
    expect(row.style.transform).toBe('translateX(0px)');
    act(() => {
      dispatchTouch(row, 'touchend', 160, 40);
    });
    expect(isDrawerHidden(drawer)).toBe(true);
    expect(row.style.transform).toBe('translateX(0px)');
    view.unmount();
  });

  it('reveals the action drawer only once a left swipe moves the card and toggles pointerEvents properly', () => {
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={vi.fn()} />
    );
    const row = slidingRow(view.container);
    const drawer = actionDrawer(view.container);

    dispatchTouch(row, 'touchstart', 180, 40);
    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchmove', 150, 40);
    expect(drawer.style.visibility).toBe('visible');
    expect(drawer.style.pointerEvents).toBe('none');
    expect(row.style.transform).toBe('translateX(-30px)');
    act(() => {
      dispatchTouch(row, 'touchend', 150, 40);
    });
    expect(row.style.transform).toBe('translateX(0px)');
    expect(isDrawerHidden(drawer)).toBe(true);
    expect(drawer.style.pointerEvents).toBe('none');

    dispatchTouch(row, 'touchstart', 180, 40);
    expect(isDrawerHidden(drawer)).toBe(true);
    dispatchTouch(row, 'touchmove', 100, 40);
    expect(drawer.style.visibility).toBe('visible');
    expect(drawer.style.pointerEvents).toBe('none');
    act(() => {
      dispatchTouch(row, 'touchend', 100, 40);
    });
    expect(row.style.transform).toBe('translateX(-160px)');
    expect(drawer.style.visibility).toBe('visible');
    expect(drawer.style.pointerEvents).toBe('auto');
    view.unmount();
  });

  it('keeps the drawer hidden on mouse press and snaps shut on pointercancel', () => {
    const view = mount(
      <TaskCard task={task({ id: 'a', title: 'Dishes' })} onComplete={vi.fn()} onSelect={vi.fn()} />
    );
    const row = slidingRow(view.container);
    const drawer = actionDrawer(view.container);

    act(() => {
      row.dispatchEvent(pointer('pointerdown', 180, 40, 1));
    });
    expect(isDrawerHidden(drawer)).toBe(true);
    act(() => {
      row.dispatchEvent(pointer('pointerup', 180, 40, 0));
    });
    expect(isDrawerHidden(drawer)).toBe(true);

    act(() => {
      row.dispatchEvent(pointer('pointerdown', 180, 40, 1));
    });
    act(() => {
      row.dispatchEvent(pointer('pointermove', 140, 40, 1));
    });
    expect(drawer.style.visibility).toBe('visible');
    expect(row.style.transform).toBe('translateX(-40px)');
    act(() => {
      row.dispatchEvent(pointer('pointercancel', 140, 40, 0));
    });
    expect(row.style.transform).toBe('translateX(0px)');
    expect(isDrawerHidden(drawer)).toBe(true);
    view.unmount();
  });
});

describe('ReorderableTaskList touch scroll', () => {
  function renderList(onReorder = vi.fn(), onDragActiveChange?: (active: boolean) => void) {
    const tasks = [
      task({ id: 'a', title: 'A', dueAt: null }),
      task({ id: 'b', title: 'B', dueAt: null }),
      task({ id: 'c', title: 'C', dueAt: null }),
    ];
    const view = mount(
      <ReorderableTaskList
        tasks={tasks}
        enabled
        onReorder={onReorder}
        onDragActiveChange={onDragActiveChange}
        renderRow={(item, drag) => (
          <div data-row={item.id} ref={drag.rowRef} onPointerDown={drag.onRowPointerDown}>
            {item.title}
          </div>
        )}
      />
    );
    return view;
  }

  it('does not cancel a scroll while no row is being reordered', () => {
    const view = renderList();
    const move = dispatchTouch(window.document.body, 'touchmove', 20, 80);
    expect(move.defaultPrevented).toBe(false);
    view.unmount();
  });

  it('cancels scrolling once a long-press reorder is active, and reports the new order', () => {
    vi.useFakeTimers();
    const onReorder = vi.fn();
    const view = renderList(onReorder);
    const row = view.container.querySelector<HTMLElement>('[data-row="a"]');
    if (!row) throw new Error('row not found');

    act(() => {
      row.dispatchEvent(pointer('pointerdown', 10, 10, 1));
    });
    act(() => {
      vi.advanceTimersByTime(350);
    });

    const move = dispatchTouch(window.document.body, 'touchmove', 10, 200);
    expect(move.defaultPrevented).toBe(true);

    act(() => {
      window.dispatchEvent(pointer('pointermove', 10, 200, 1));
      window.dispatchEvent(pointer('pointerup', 10, 200, 0));
    });
    expect(onReorder).toHaveBeenCalledWith(['b', 'c', 'a']);
    view.unmount();
  });

  it('notifies onDragActiveChange when long-press activates and clears after drop', () => {
    vi.useFakeTimers();
    const onDragActiveChange = vi.fn();
    const view = renderList(vi.fn(), onDragActiveChange);
    const row = view.container.querySelector<HTMLElement>('[data-row="a"]');
    if (!row) throw new Error('row not found');

    act(() => {
      row.dispatchEvent(pointer('pointerdown', 10, 10, 1));
    });
    expect(onDragActiveChange).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(350);
    });
    expect(onDragActiveChange).toHaveBeenCalledWith(true);

    act(() => {
      window.dispatchEvent(pointer('pointerup', 10, 10, 0));
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onDragActiveChange).toHaveBeenCalledWith(false);
    view.unmount();
  });
});

describe('CalendarMonthView', () => {
  function renderMonth(opts: {
    tasks?: Task[];
    expanded?: boolean;
    onSelectDate?: (date: string) => void;
    onMonthChange?: (year: number, month: number) => void;
  }) {
    const onSelectDate = opts.onSelectDate ?? vi.fn();
    const onMonthChange = opts.onMonthChange ?? vi.fn();
    const view = mount(
      <CalendarMonthView
        tasks={opts.tasks ?? []}
        year={2026}
        monthIndex={10}
        selectedDateStr="2026-11-16"
        expanded={opts.expanded ?? true}
        onToggleExpanded={vi.fn()}
        onSelectDate={onSelectDate}
        onMonthChange={onMonthChange}
      />
    );
    const root = view.container.firstElementChild as HTMLElement;
    Object.defineProperty(root, 'offsetWidth', { configurable: true, value: 360 });
    return { ...view, root, onSelectDate, onMonthChange };
  }

  it('moves the grid height with the finger without a new render from the parent', () => {
    const ref = { current: null as CalendarMonthHandle | null };
    const view = mount(
      <CalendarMonthView
        ref={ref}
        tasks={[]}
        year={2026}
        monthIndex={10}
        selectedDateStr="2026-11-16"
        expanded={false}
        onToggleExpanded={vi.fn()}
        onSelectDate={vi.fn()}
        onMonthChange={vi.fn()}
      />
    );
    const grid = view.container.querySelector<HTMLElement>('.overflow-hidden');
    expect(grid?.style.height).toBe(`${CALENDAR_ROW_HEIGHT}px`);
    expect(ref.current).not.toBeNull();
    act(() => {
      ref.current?.setPullProgress(0.5);
    });
    expect(grid?.style.height).toBe(`${CALENDAR_ROW_HEIGHT + CALENDAR_EXPAND_DELTA * 0.5}px`);
    act(() => {
      ref.current?.releasePull(() => {});
    });
    expect(grid?.style.height).toBe(`${CALENDAR_ROW_HEIGHT}px`);
    view.unmount();
  });

  it('sizes the grid to the week strip or the full month', () => {
    const collapsed = renderMonth({ expanded: false });
    const grid = collapsed.container.querySelector<HTMLElement>('.overflow-hidden');
    expect(grid?.style.height).toBe(`${CALENDAR_ROW_HEIGHT}px`);
    collapsed.unmount();

    const open = renderMonth({ expanded: true });
    const full = open.container.querySelector<HTMLElement>('.overflow-hidden');
    expect(full?.style.height).toBe(`${CALENDAR_ROW_HEIGHT + CALENDAR_EXPAND_DELTA}px`);
    open.unmount();
  });

  it('shows a dot only on days that still have an open task', () => {
    const open = renderMonth({
      tasks: [task({ id: 'dentist', title: 'Dentist', dueAt: '2026-11-18' })],
    });
    expect(visibleDotsOnDay(open.container, '18')).toBe(1);
    open.unmount();

    const done = renderMonth({
      tasks: [
        task({ id: 'dentist', title: 'Dentist', dueAt: '2026-11-18', completedAt: 1 }),
      ],
    });
    expect(visibleDotsOnDay(done.container, '18')).toBe(0);
    done.unmount();

    const recurringOpen = renderMonth({
      tasks: [
        task({
          id: 'routine',
          title: 'Routine',
          dueAt: '2026-11-18',
          recurrence: { type: 'fixed_interval', intervalUnit: 'days', intervalValue: 1 },
        }),
      ],
    });
    expect(visibleDotsOnDay(recurringOpen.container, '18')).toBe(1);
    recurringOpen.unmount();

    const recurringDone = renderMonth({
      tasks: [
        task({
          id: 'routine',
          title: 'Routine',
          dueAt: '2026-11-19',
          recurrence: { type: 'fixed_interval', intervalUnit: 'days', intervalValue: 1 },
          completionHistory: [new Date(2026, 10, 18, 12, 0).getTime()],
        }),
      ],
    });
    expect(visibleDotsOnDay(recurringDone.container, '18')).toBe(0);
    expect(visibleDotsOnDay(recurringDone.container, '19')).toBe(1);
    recurringDone.unmount();
  });

  it('selects the next month after a left swipe and ignores a vertical drag', () => {
    vi.useFakeTimers();
    const onSelectDate = vi.fn();
    const onMonthChange = vi.fn();
    const view = renderMonth({ expanded: true, onSelectDate, onMonthChange });

    act(() => {
      view.root.dispatchEvent(pointer('pointerdown', 200, 40, 1));
      view.root.dispatchEvent(pointer('pointermove', 80, 42, 1));
      view.root.dispatchEvent(pointer('pointerup', 80, 42, 0));
      vi.advanceTimersByTime(350);
    });
    expect(onSelectDate).toHaveBeenCalledWith('2026-12-01');
    expect(onMonthChange).toHaveBeenCalledWith(2026, 11);
    view.unmount();

    const vertical = renderMonth({ expanded: true });
    act(() => {
      vertical.root.dispatchEvent(pointer('pointerdown', 40, 20, 1));
      vertical.root.dispatchEvent(pointer('pointermove', 42, 80, 1));
      vertical.root.dispatchEvent(pointer('pointerup', 42, 80, 0));
      vi.advanceTimersByTime(350);
    });
    expect(vertical.onSelectDate).not.toHaveBeenCalled();
    expect(vertical.onMonthChange).not.toHaveBeenCalled();
    vertical.unmount();
  });

  it('steps one week when the grid is collapsed', () => {
    vi.useFakeTimers();
    const onSelectDate = vi.fn();
    const view = renderMonth({ expanded: false, onSelectDate });
    act(() => {
      view.root.dispatchEvent(pointer('pointerdown', 200, 20, 1));
      view.root.dispatchEvent(pointer('pointermove', 80, 22, 1));
      view.root.dispatchEvent(pointer('pointerup', 80, 22, 0));
      vi.advanceTimersByTime(350);
    });
    expect(onSelectDate).toHaveBeenCalledWith('2026-11-23');
    view.unmount();
  });
});

describe('SwipeableMonthTitle + CalendarMonthView integration', () => {
  function Harness({
    initialYear = 2026,
    initialMonth = 10,
    initialDate = '2026-11-16',
    initialExpanded = true,
    onTitleClick,
    onRender,
    onMonthChange: onMonthChangeSpy,
    monthViewRef,
  }: {
    initialYear?: number;
    initialMonth?: number;
    initialDate?: string;
    initialExpanded?: boolean;
    onTitleClick?: () => void;
    onRender?: () => void;
    onMonthChange?: (year: number, month: number) => void;
    monthViewRef?: RefObject<CalendarMonthHandle | null>;
  }) {
    const [year, setYear] = useState(initialYear);
    const [month, setMonth] = useState(initialMonth);
    const [selectedDate, setSelectedDate] = useState(initialDate);
    const [expanded, setExpanded] = useState(initialExpanded);
    const titleRef = useRef<SwipeableMonthTitleHandle>(null);

    onRender?.();

    const prevTarget = expanded ? shiftMonth(year, month, -1) : shiftWeek(selectedDate, -1);
    const nextTarget = expanded ? shiftMonth(year, month, 1) : shiftWeek(selectedDate, 1);
    const handleSwipeProgress = useCallback((event: CalendarSwipeEvent) => {
      titleRef.current?.applySwipe(event);
    }, []);

    return (
      <div>
        <SwipeableMonthTitle
          ref={titleRef}
          prevTitle={calendarHeaderTitle(prevTarget.year, prevTarget.monthIndex, 'en-US')}
          currentTitle={calendarHeaderTitle(year, month, 'en-US')}
          nextTitle={calendarHeaderTitle(nextTarget.year, nextTarget.monthIndex, 'en-US')}
          canSwipePrev={prevTarget.year !== year || prevTarget.monthIndex !== month}
          canSwipeNext={nextTarget.year !== year || nextTarget.monthIndex !== month}
          expanded={expanded}
          onClick={() => {
            onTitleClick?.();
            setExpanded((prev) => !prev);
          }}
        />
        <CalendarMonthView
          ref={monthViewRef}
          tasks={[]}
          year={year}
          monthIndex={month}
          selectedDateStr={selectedDate}
          expanded={expanded}
          onToggleExpanded={() => setExpanded((prev) => !prev)}
          onSelectDate={setSelectedDate}
          onMonthChange={(y, m) => {
            onMonthChangeSpy?.(y, m);
            setYear(y);
            setMonth(m);
          }}
          onSwipeProgress={handleSwipeProgress}
        />
      </div>
    );
  }

  function queryElements(container: HTMLElement) {
    const button = container.querySelector<HTMLButtonElement>('header button, button');
    const track = container.querySelector<HTMLElement>('.month-title-track');
    const prevSlide = container.querySelector<HTMLElement>('[data-slot="prev"]');
    const currentSlide = container.querySelector<HTMLElement>('[data-slot="current"]');
    const nextSlide = container.querySelector<HTMLElement>('[data-slot="next"]');
    const calRoot = container.querySelector<HTMLElement>('.select-none.touch-pan-y');
    if (!button || !track || !prevSlide || !currentSlide || !nextSlide || !calRoot) {
      throw new Error('SwipeableMonthTitle + CalendarMonthView DOM nodes missing');
    }
    Object.defineProperty(calRoot, 'offsetWidth', { configurable: true, value: 360 });
    return { button, track, prevSlide, currentSlide, nextSlide, calRoot };
  }

  it('tracks drag, snaps to next month without parent re-render, and resets cleanly on commit', () => {
    vi.useFakeTimers();
    const onRender = vi.fn();
    const view = mount(<Harness onRender={onRender} />);
    const { track, prevSlide, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(currentSlide.textContent).toBe('November 2026');
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');

    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 40, 1));
      calRoot.dispatchEvent(pointer('pointermove', 20, 42, 1));
    });

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(track.dataset.snapping).toBeUndefined();
    expect(track.style.getPropertyValue('--month-title-x')).toBe('-50%');
    expect(prevSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('0.5');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0.5');

    act(() => {
      calRoot.dispatchEvent(pointer('pointerup', 20, 42, 0));
    });

    expect(onRender).toHaveBeenCalledTimes(1);
    expect(track.dataset.snapping).toBe('true');
    expect(track.style.getPropertyValue('--month-title-snap-ms')).toBe('350ms');
    expect(track.style.getPropertyValue('--month-title-x')).toBe('-100%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(onRender).toHaveBeenCalledTimes(2);
    expect(currentSlide.textContent).toBe('December 2026');
    expect(track.dataset.snapping).toBeUndefined();
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');
    view.unmount();
  });

  it('snaps back to 0% on a slow drag below threshold and clears snapping after 350ms', () => {
    vi.useFakeTimers();
    const view = mount(<Harness />);
    const { track, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 40, 1));
      vi.advanceTimersByTime(300);
      calRoot.dispatchEvent(pointer('pointermove', 164, 42, 1));
    });

    expect(track.style.getPropertyValue('--month-title-x')).toBe('-10%');

    act(() => {
      calRoot.dispatchEvent(pointer('pointerup', 164, 42, 0));
    });

    expect(track.dataset.snapping).toBe('true');
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');

    act(() => {
      vi.advanceTimersByTime(350);
    });

    expect(currentSlide.textContent).toBe('November 2026');
    expect(track.dataset.snapping).toBeUndefined();
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    view.unmount();
  });

  it('keeps the month title stationary when swiping weeks within the same month', () => {
    const view = mount(<Harness initialExpanded={false} initialDate="2026-11-16" />);
    const { track, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 20, 1));
      calRoot.dispatchEvent(pointer('pointermove', 20, 22, 1));
    });

    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');
    view.unmount();
  });

  it('slides toward the next month in collapsed mode only in the month-crossing direction', () => {
    const view = mount(<Harness initialExpanded={false} initialDate="2026-11-26" />);
    const { track, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    // Swiping right stays in November (canSwipePrev = false)
    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 20, 1));
      calRoot.dispatchEvent(pointer('pointermove', 290, 22, 1));
    });
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');

    act(() => {
      calRoot.dispatchEvent(pointer('pointercancel', 290, 22, 0));
    });

    // Swiping left crosses into December (canSwipeNext = true)
    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 20, 1));
      calRoot.dispatchEvent(pointer('pointermove', 20, 22, 1));
    });
    expect(nextSlide.textContent).toBe('December 2026');
    expect(track.style.getPropertyValue('--month-title-x')).toBe('-50%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('0.5');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0.5');
    view.unmount();
  });

  it('resets the title track immediately on pointercancel', () => {
    const view = mount(<Harness />);
    const { track, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 40, 1));
      calRoot.dispatchEvent(pointer('pointermove', 110, 42, 1));
    });
    expect(track.style.getPropertyValue('--month-title-x')).toBe('-25%');

    act(() => {
      calRoot.dispatchEvent(pointer('pointercancel', 110, 42, 0));
    });
    expect(track.dataset.snapping).toBeUndefined();
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');
    view.unmount();
  });

  it('hides duplicate/adjacent titles from assistive tech and forwards clicks', () => {
    const onTitleClick = vi.fn();
    const view = mount(<Harness initialExpanded={true} onTitleClick={onTitleClick} />);
    const { button, prevSlide, currentSlide, nextSlide } = queryElements(view.container);

    expect(button.getAttribute('aria-expanded')).toBe('true');
    expect(prevSlide.getAttribute('aria-hidden')).toBe('true');
    expect(nextSlide.getAttribute('aria-hidden')).toBe('true');
    expect(currentSlide.getAttribute('aria-hidden')).toBeNull();

    const sizers = [...button.querySelectorAll<HTMLElement>('.invisible')];
    expect(sizers).toHaveLength(3);
    expect(sizers.every((el) => el.getAttribute('aria-hidden') === 'true')).toBe(true);

    act(() => {
      button.click();
    });
    expect(onTitleClick).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-expanded')).toBe('false');
    view.unmount();
  });

  it('aborts an in-flight swipe snap and resets track and title on cancelPendingSwipe()', () => {
    vi.useFakeTimers();
    const onMonthChange = vi.fn();
    const monthViewRef: RefObject<CalendarMonthHandle | null> = { current: null };
    const view = mount(<Harness onMonthChange={onMonthChange} monthViewRef={monthViewRef} />);
    const { track, currentSlide, nextSlide, calRoot } = queryElements(view.container);

    act(() => {
      calRoot.dispatchEvent(pointer('pointerdown', 200, 40, 1));
      calRoot.dispatchEvent(pointer('pointermove', 20, 42, 1));
      calRoot.dispatchEvent(pointer('pointerup', 20, 42, 0));
    });

    expect(track.dataset.snapping).toBe('true');
    expect(track.style.getPropertyValue('--month-title-x')).toBe('-100%');

    act(() => {
      monthViewRef.current?.cancelPendingSwipe();
    });

    expect(track.dataset.snapping).toBeUndefined();
    expect(track.style.getPropertyValue('--month-title-x')).toBe('0%');
    expect(currentSlide.style.getPropertyValue('--month-title-opacity')).toBe('1');
    expect(nextSlide.style.getPropertyValue('--month-title-opacity')).toBe('0');

    act(() => {
      vi.advanceTimersByTime(400);
    });

    expect(onMonthChange).not.toHaveBeenCalled();
    expect(currentSlide.textContent).toBe('November 2026');
    view.unmount();
  });
});
