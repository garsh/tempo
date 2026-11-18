// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CalendarAgendaView } from '../CalendarAgendaView';
import {
  CALENDAR_EXPAND_DELTA,
  CALENDAR_ROW_HEIGHT,
  CalendarMonthView,
  type CalendarMonthHandle,
} from '../CalendarMonthView';
import { ReorderableTaskList } from '../ReorderableTaskList';
import { TaskCard } from '../TaskCard';
import { resetPrefsCache } from '../../prefs/prefs';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
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
  type: 'pointerdown' | 'pointermove' | 'pointerup',
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

function visibleDotsOnDay(container: HTMLElement, dayNum: string): number {
  return [...container.querySelectorAll('button')].filter((button) => {
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
});

describe('ReorderableTaskList touch scroll', () => {
  function renderList(onReorder = vi.fn()) {
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

describe('CalendarAgendaView week swipe', () => {
  it('follows the finger and then selects the next week', () => {
    vi.useFakeTimers();
    const onSelectDate = vi.fn();
    const onMonthChange = vi.fn();
    const view = mount(
      <CalendarAgendaView
        tasks={[]}
        onSelectTask={vi.fn()}
        selectedDateStr="2026-11-16"
        onSelectDate={onSelectDate}
        onMonthChange={onMonthChange}
      />
    );
    const strip = view.container.querySelector<HTMLElement>('.touch-pan-y');
    if (!strip) throw new Error('week strip not found');
    Object.defineProperty(strip, 'offsetWidth', { configurable: true, value: 360 });
    const track = strip.querySelector<HTMLElement>('[style*="translateX"]');
    if (!track) throw new Error('week track not found');

    act(() => {
      strip.dispatchEvent(pointer('pointerdown', 200, 20, 1));
      strip.dispatchEvent(pointer('pointermove', 100, 22, 1));
    });
    expect(track.style.transform).toContain('translateX(-100px)');

    act(() => {
      strip.dispatchEvent(pointer('pointerup', 100, 22, 0));
      vi.advanceTimersByTime(350);
    });
    expect(onSelectDate).toHaveBeenCalledWith('2026-11-23');
    expect(onMonthChange).toHaveBeenCalledWith(2026, 10);
    view.unmount();
  });
});
