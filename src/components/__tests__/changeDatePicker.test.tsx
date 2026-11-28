// @vitest-environment happy-dom
import { act, createRef, useRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ChangeDatePicker,
  type ChangeDatePickerHandle,
} from '../dialogs/ChangeDatePicker';
import { TaskCard } from '../TaskCard';
import type { Task } from '../../types/task';

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    title: 'Sample Task',
    dueAt: '2026-11-18',
    completionHistory: [],
    createdAt: 1,
    updatedAt: 1,
    ...overrides,
  };
}

function setShowPicker(
  input: HTMLInputElement,
  impl: (() => void) | undefined,
) {
  Object.defineProperty(input, 'showPicker', {
    value: impl,
    configurable: true,
    writable: true,
  });
}

function getNativeInput(container: HTMLElement): HTMLInputElement {
  const input = container.querySelector<HTMLInputElement>(
    '[data-testid="change-date-native-input"]',
  );
  if (!input) throw new Error('Native date input missing');
  return input;
}

let origInnerWidth: number;
let origInnerHeight: number;

beforeEach(() => {
  localStorage.clear();
  origInnerWidth = window.innerWidth;
  origInnerHeight = window.innerHeight;
});

afterEach(() => {
  Object.defineProperty(window, 'innerWidth', {
    value: origInnerWidth,
    configurable: true,
    writable: true,
  });
  Object.defineProperty(window, 'innerHeight', {
    value: origInnerHeight,
    configurable: true,
    writable: true,
  });
  document.body.replaceChildren();
});

describe('ChangeDatePicker', () => {
  it('opens the native date picker synchronously from TaskCard Change Date without opening dialogs or menus', () => {
    const onSave = vi.fn();
    function Harness() {
      const pickerRef = useRef<ChangeDatePickerHandle | null>(null);
      return (
        <>
          <TaskCard
            task={makeTask({ id: 't1', dueAt: '2026-11-18' })}
            onComplete={vi.fn()}
            onRequestChangeDate={(t, rect) => pickerRef.current?.open(t, rect)}
          />
          <ChangeDatePicker ref={pickerRef} onSave={onSave} />
        </>
      );
    }

    const view = mount(<Harness />);
    const input = getNativeInput(view.container);
    const showPicker = vi.fn();
    setShowPicker(input, showPicker);

    const changeDateBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Change Date"]',
    );
    if (!changeDateBtn) throw new Error('Change Date button missing');

    act(() => {
      changeDateBtn.click();
    });

    expect(showPicker).toHaveBeenCalledTimes(1);
    expect(input.value).toBe('2026-11-18');
    expect(view.container.querySelector('[role="dialog"]')).toBeNull();
    expect(view.container.querySelector('#date-choice-menu')).toBeNull();

    act(() => {
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('t1', '2026-11-25');

    view.unmount();
  });

  it('saves consecutive changes to the same target date across two different tasks', () => {
    const onSave = vi.fn();
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={onSave} />);
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: '2026-11-18' }));
    });
    expect(input.value).toBe('2026-11-18');

    act(() => {
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    act(() => {
      pickerRef.current?.open(makeTask({ id: 't2', dueAt: '2026-11-19' }));
    });
    expect(input.value).toBe('2026-11-19');

    act(() => {
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(2);
    expect(onSave).toHaveBeenNthCalledWith(1, 't1', '2026-11-25');
    expect(onSave).toHaveBeenNthCalledWith(2, 't2', '2026-11-25');

    view.unmount();
  });

  it('preserves an existing time component when changing the date', () => {
    const onSave = vi.fn();
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={onSave} />);
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: '2026-11-18T14:30' }));
    });
    expect(input.value).toBe('2026-11-18');

    act(() => {
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('t1', '2026-11-25T14:30');

    view.unmount();
  });

  it('pre-fills empty string for an undated task and saves the picked date', () => {
    const onSave = vi.fn();
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={onSave} />);
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: null }));
    });
    expect(input.value).toBe('');

    act(() => {
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith('t1', '2026-11-25');

    view.unmount();
  });

  it('ignores empty Clear values and clears pending task on cancel', () => {
    const onSave = vi.fn();
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={onSave} />);
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: '2026-11-18' }));
    });

    act(() => {
      input.value = '';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();

    act(() => {
      input.dispatchEvent(new Event('cancel'));
      input.value = '2026-11-25';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSave).not.toHaveBeenCalled();

    view.unmount();
  });

  it('falls back to focus({ preventScroll: true }) and click() when showPicker is missing or throws', () => {
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={vi.fn()} />);
    const input = getNativeInput(view.container);

    const focusSpy = vi.spyOn(input, 'focus').mockImplementation(() => {});
    const clickSpy = vi.spyOn(input, 'click').mockImplementation(() => {});

    setShowPicker(input, undefined);
    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: '2026-11-18' }));
    });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    focusSpy.mockClear();
    clickSpy.mockClear();

    setShowPicker(input, () => {
      throw new DOMException('Not allowed', 'NotAllowedError');
    });
    act(() => {
      pickerRef.current?.open(makeTask({ id: 't1', dueAt: '2026-11-18' }));
    });
    expect(focusSpy).toHaveBeenCalledWith({ preventScroll: true });
    expect(clickSpy).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('positions near anchorRect clamped to viewport and stays renderable with 16px font size', () => {
    Object.defineProperty(window, 'innerWidth', {
      value: 400,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(window, 'innerHeight', {
      value: 800,
      configurable: true,
      writable: true,
    });

    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(<ChangeDatePicker ref={pickerRef} onSave={vi.fn()} />);
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    expect(input.style.fontSize).toBe('16px');
    expect(input.style.display).not.toBe('none');
    expect(input.style.visibility).not.toBe('hidden');
    expect(input.style.clipPath).toBe('inset(50%)');

    act(() => {
      pickerRef.current?.open(makeTask(), {
        top: 100,
        bottom: 140,
        left: 24,
        right: 64,
        width: 40,
        height: 40,
      });
    });
    expect(input.style.left).toBe('24px');
    expect(input.style.top).toBe('140px');

    act(() => {
      pickerRef.current?.open(makeTask(), {
        top: 760,
        bottom: 820,
        left: 420,
        right: 460,
        width: 40,
        height: 60,
      });
    });
    expect(input.style.left).toBe('391px');
    expect(input.style.top).toBe('791px');

    act(() => {
      pickerRef.current?.open(makeTask(), {
        top: -20,
        bottom: 2,
        left: 0,
        right: 20,
        width: 20,
        height: 22,
      });
    });
    expect(input.style.left).toBe('8px');
    expect(input.style.top).toBe('8px');

    view.unmount();
  });

  it('pre-fills completedAt date instead of dueAt, applies completedMaxDate, resets max for open tasks, and does not carry over dueAt time', () => {
    const onSaveTask = vi.fn();
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const view = mount(
      <ChangeDatePicker
        ref={pickerRef}
        completedMaxDate="2026-11-28"
        onSaveTask={onSaveTask}
      />,
    );
    const input = getNativeInput(view.container);
    setShowPicker(input, vi.fn());

    const completedTask = makeTask({
      id: 'c1',
      dueAt: '2026-11-27T09:30',
      completedAt: new Date(2026, 10, 28, 11, 0, 0).getTime(),
    });

    act(() => {
      pickerRef.current?.open(completedTask);
    });
    expect(input.value).toBe('2026-11-28');
    expect(input.max).toBe('2026-11-28');

    act(() => {
      input.value = '2026-11-27';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onSaveTask).toHaveBeenCalledWith(completedTask, '2026-11-27');

    const openTask = makeTask({
      id: 'o1',
      dueAt: '2026-11-27T09:30',
      completedAt: null,
    });

    act(() => {
      pickerRef.current?.open(openTask);
    });
    expect(input.value).toBe('2026-11-27');
    expect(input.max).toBe('');

    view.unmount();
  });

  it('renders completed TaskCard date in secondary color rather than overdue red and uses Change Date for completed window-periodic rows', () => {
    const completedCard = mount(
      <TaskCard
        task={makeTask({
          id: 'c2',
          dueAt: '2020-01-01',
          completedAt: new Date(2026, 10, 28, 10, 0, 0).getTime(),
        })}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
      />,
    );

    const overdueSpan = completedCard.container.querySelector('.text-tt-overdue');
    expect(overdueSpan).toBeNull();
    const dateSpan = Array.from(completedCard.container.querySelectorAll('span')).find((el) =>
      el.className.includes('tabular-nums'),
    );
    expect(dateSpan?.className).toContain('text-tt-secondary');
    completedCard.unmount();

    const onChangeDate = vi.fn();
    const onLogDate = vi.fn();
    const windowCompletedCard = mount(
      <TaskCard
        task={makeTask({
          id: 'w1',
          dueAt: null,
          completedAt: new Date(2026, 10, 28, 10, 0, 0).getTime(),
          recurrence: {
            type: 'after_completion',
            intervalValue: 3,
            maxIntervalValue: 5,
            intervalUnit: 'days',
          },
        })}
        onComplete={vi.fn()}
        onUncomplete={vi.fn()}
        onRequestChangeDate={onChangeDate}
        onRequestLogDate={onLogDate}
      />,
    );

    expect(windowCompletedCard.container.querySelector('button[aria-label="Log Date"]')).toBeNull();
    const changeDateBtn = windowCompletedCard.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Change Date"]',
    );
    expect(changeDateBtn).not.toBeNull();

    act(() => {
      changeDateBtn!.click();
    });
    expect(onChangeDate).toHaveBeenCalledTimes(1);
    expect(onLogDate).not.toHaveBeenCalled();
    windowCompletedCard.unmount();
  });
});
