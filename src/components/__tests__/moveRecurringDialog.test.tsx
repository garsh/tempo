// @vitest-environment happy-dom
import { act, createRef, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import { MoveRecurringDialog } from '../dialogs/MoveRecurringDialog';
import { ChangeDatePicker, type ChangeDatePickerHandle } from '../dialogs/ChangeDatePicker';
import { QuickAddSheet } from '../QuickAddSheet';
import { RecurringTasksView } from '../RecurringTasksView';
import { completionTimestampForDate, formatDate, parseDate } from '../../domain/recurrence';

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender(nextUi: ReactElement) {
      act(() => {
        root.render(nextUi);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function pointerEvent(type: 'pointerdown' | 'pointerup', clientX: number, clientY: number) {
  return new PointerEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX,
    clientY,
  });
}

function makeRecurringTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'rec-1',
    title: 'Take out recycling',
    listId: INBOX_LIST_ID,
    dueAt: '2026-11-21',
    startDate: '2026-11-07',
    recurrence: {
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [6], // Sat
    },
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('MoveRecurringDialog & entry-point wiring', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    vi.restoreAllMocks();
  });

  it('opens native <dialog> via showModal(), shows schedule previews, and calls choice handlers', async () => {
    const showModalSpy = vi.spyOn(HTMLDialogElement.prototype, 'showModal');
    const onClose = vi.fn();
    const onMoveOccurrence = vi.fn();
    const onMoveSeries = vi.fn();
    const task = makeRecurringTask();

    const view = mount(
      <MoveRecurringDialog
        isOpen={true}
        task={task}
        fromDate="2026-11-21"
        toDate="2026-11-22"
        textChanged={true}
        today={parseDate('2026-11-21')}
        onClose={onClose}
        onMoveOccurrence={onMoveOccurrence}
        onMoveSeries={onMoveSeries}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    expect(dialog).not.toBeNull();
    expect(showModalSpy).toHaveBeenCalledTimes(1);
    expect(dialog.open).toBe(true);
    expect(dialog.textContent).toContain('Only this occurrence');
    expect(dialog.textContent).toContain('Every Sat');
    expect(dialog.textContent).toContain('Move recurring task');
    expect(dialog.textContent).toContain('Every Sun');
    expect(dialog.textContent).toContain('Title and notes changes will apply to the recurring task');

    const occBtn = dialog.querySelector<HTMLButtonElement>('[data-testid="move-occurrence-only-btn"]')!;
    await act(async () => {
      occBtn.click();
    });
    expect(onMoveOccurrence).toHaveBeenCalledTimes(1);
    expect(onMoveSeries).not.toHaveBeenCalled();
  });

  it('shows collision warning when target date already occurs and supports Move recurring task', async () => {
    const onMoveOccurrence = vi.fn();
    const onMoveSeries = vi.fn();
    const task = makeRecurringTask({
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 3, 5], // Mon, Wed, Fri
      },
      startDate: '2026-11-02',
      dueAt: '2026-11-25',
    });

    const view = mount(
      <MoveRecurringDialog
        isOpen={true}
        task={task}
        fromDate="2026-11-25" // Wed
        toDate="2026-11-27" // Fri (already scheduled!)
        today={parseDate('2026-11-21')}
        onClose={vi.fn()}
        onMoveOccurrence={onMoveOccurrence}
        onMoveSeries={onMoveSeries}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    expect(dialog.textContent).toContain('Already scheduled on');
    expect(dialog.textContent).toContain('Every Mon, Fri');

    const seriesBtn = dialog.querySelector<HTMLButtonElement>('[data-testid="move-recurring-series-btn"]')!;
    await act(async () => {
      seriesBtn.click();
    });
    expect(onMoveSeries).toHaveBeenCalledTimes(1);
    expect(onMoveOccurrence).not.toHaveBeenCalled();
  });

  it('Decision D1: displays Move this completion and disables moving completion to future dates', () => {
    const task = makeRecurringTask({
      completionHistory: [completionTimestampForDate('2026-11-21', parseDate('2026-11-21').getTime())],
    });

    const viewFuture = mount(
      <MoveRecurringDialog
        isOpen={true}
        task={task}
        fromDate="2026-11-21"
        toDate="2026-11-22"
        today={parseDate('2026-11-21')}
        onClose={vi.fn()}
        onMoveOccurrence={vi.fn()}
        onMoveSeries={vi.fn()}
      />
    );
    mounted.push(viewFuture.unmount);

    const futureBtn = viewFuture.container.querySelector<HTMLButtonElement>(
      '[data-testid="move-occurrence-only-btn"]'
    )!;
    expect(futureBtn.textContent).toContain('Move this completion');
    expect(futureBtn.textContent).toContain('cannot be moved to a future date');
    expect(futureBtn.disabled).toBe(true);

    viewFuture.rerender(
      <MoveRecurringDialog
        isOpen={true}
        task={task}
        fromDate="2026-11-21"
        toDate="2026-11-20"
        today={parseDate('2026-11-21')}
        onClose={vi.fn()}
        onMoveOccurrence={vi.fn()}
        onMoveSeries={vi.fn()}
      />
    );
    expect(futureBtn.disabled).toBe(false);
    expect(futureBtn.textContent).toContain('Move completion from');
  });

  it('dismisses via Cancel or outside pointer click without committing changes, ignoring inside-to-outside drags', () => {
    const onClose = vi.fn();
    const onMoveOccurrence = vi.fn();
    const onMoveSeries = vi.fn();
    const task = makeRecurringTask();

    const view = mount(
      <MoveRecurringDialog
        isOpen={true}
        task={task}
        fromDate="2026-11-21"
        toDate="2026-11-22"
        onClose={onClose}
        onMoveOccurrence={onMoveOccurrence}
        onMoveSeries={onMoveSeries}
      />
    );
    mounted.push(view.unmount);

    const dialog = view.container.querySelector('dialog')!;
    vi.spyOn(dialog, 'getBoundingClientRect').mockReturnValue({
      left: 100,
      top: 100,
      right: 500,
      bottom: 450,
      width: 400,
      height: 350,
      x: 100,
      y: 100,
      toJSON: () => ({}),
    });

    act(() => {
      dialog.dispatchEvent(pointerEvent('pointerdown', 200, 200));
      dialog.dispatchEvent(pointerEvent('pointerup', 10, 10));
    });
    expect(dialog.open).toBe(true);
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      dialog.dispatchEvent(pointerEvent('pointerdown', 10, 10));
      dialog.dispatchEvent(pointerEvent('pointerup', 12, 12));
    });
    expect(dialog.open).toBe(false);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onMoveOccurrence).not.toHaveBeenCalled();
    expect(onMoveSeries).not.toHaveBeenCalled();
  });

  it('QuickAddSheet preserves due time and stays open when onSave returns false', async () => {
    const onClose = vi.fn();
    const onSave = vi.fn().mockResolvedValue(false);
    const task = makeRecurringTask({ dueAt: '2026-11-21T08:30' });

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        initialTask={task}
        onSave={onSave}
        onClose={onClose}
      />
    );
    mounted.push(view.unmount);

    const saveBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Save routine"]')!;
    await act(async () => {
      saveBtn.click();
    });

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: task.id,
        dueAt: '2026-11-21T08:30',
      })
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('ChangeDatePicker passes full projected task to onSaveTask when provided', () => {
    const pickerRef = createRef<ChangeDatePickerHandle>();
    const onSaveTask = vi.fn();
    const projectedTask = makeRecurringTask({ dueAt: '2026-11-21T09:15' });

    const view = mount(<ChangeDatePicker ref={pickerRef} onSaveTask={onSaveTask} />);
    mounted.push(view.unmount);

    const input = view.container.querySelector<HTMLInputElement>(
      '[data-testid="change-date-native-input"]'
    )!;
    Object.defineProperty(input, 'showPicker', {
      value: vi.fn(),
      configurable: true,
      writable: true,
    });

    act(() => {
      pickerRef.current?.open(projectedTask);
    });

    act(() => {
      input.value = '2026-11-22';
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });

    expect(onSaveTask).toHaveBeenCalledTimes(1);
    expect(onSaveTask).toHaveBeenCalledWith(projectedTask, '2026-11-22T09:15');
  });

  it('RecurringTasksView passes projected occurrence date (not stale raw dueAt) to onEdit', () => {
    const onEdit = vi.fn();
    const todayStr = formatDate(new Date());
    const staleRaw = makeRecurringTask({
      dueAt: '2026-01-03',
      startDate: '2026-01-03',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'days',
      },
    });

    const view = mount(
      <RecurringTasksView
        tasks={[staleRaw]}
        showDetails={false}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const cardText = view.container.querySelector('[data-testid="recurring-tasks-view"] span');
    expect(cardText).not.toBeNull();
    // Click on the task card title area (onSelect)
    const rowClickable = Array.from(view.container.querySelectorAll('div')).find(
      (el) => el.textContent?.includes('Take out recycling') && el.className.includes('cursor-pointer')
    );
    expect(rowClickable).toBeDefined();
    act(() => {
      rowClickable!.click();
    });

    expect(onEdit).toHaveBeenCalledTimes(1);
    expect(onEdit.mock.calls[0][0].dueAt).toBe(todayStr);
  });
});
