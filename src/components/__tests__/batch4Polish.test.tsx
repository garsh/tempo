// @vitest-environment happy-dom
import { act, memo, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Task } from '../../types/task';
import indexHtml from '../../../index.html?raw';
import { CalendarMonthView } from '../CalendarMonthView';
import { DesktopSidebar } from '../shell/DesktopSidebar';
import { TaskGroupHeader } from '../shell/TaskGroupHeader';
import { TaskCard } from '../TaskCard';
import { SwipeActionButton } from '../SwipeActionButton';
import { ConfirmDialog } from '../ui/Sheet';
import { DeleteConfirmDialog } from '../dialogs/DeleteConfirmDialog';
import { SkipOccurrenceDialog } from '../dialogs/SkipOccurrenceDialog';
import { ShortcutsHelpDialog } from '../dialogs/ShortcutsHelpDialog';
import { ChangeDatePicker } from '../dialogs/ChangeDatePicker';
import { ReorderableTaskList, type RowDragProps } from '../ReorderableTaskList';
import { ErrorBoundary } from '../ErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    rerender(next: ReactElement) {
      act(() => {
        root.render(next);
      });
    },
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function makeTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

describe('Batch 4 accessibility, performance & cleanup (Items P, Q, R, S)', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    document.body.replaceChildren();
  });

  it('Item P & S: index.html allows user pinch-to-zoom and removes TickTick/board/reminders copy', () => {
    expect(indexHtml).not.toContain('user-scalable=no');
    expect(indexHtml).not.toContain('maximum-scale=1.0');
    expect(indexHtml).not.toContain('TickTick');
    expect(indexHtml).toContain('width=device-width, initial-scale=1.0');
  });

  it('Item P: native <dialog> shells set initial focus, close on synthetic Escape and outside-bounds click, and set alertdialog role on ConfirmDialog', () => {
    const mockBounds = { left: 100, top: 100, right: 400, bottom: 300, width: 300, height: 200 };

    // 1. DeleteConfirmDialog
    const onDelClose = vi.fn();
    const delView = mount(
      <DeleteConfirmDialog
        isOpen={true}
        task={makeTask('d-1', 'Old task')}
        onClose={onDelClose}
        onConfirm={vi.fn()}
      />
    );
    mounted.push(delView.unmount);
    const delDialog = delView.container.querySelector<HTMLDialogElement>('dialog')!;
    expect(delDialog).not.toBeNull();
    expect(delDialog.open).toBe(true);
    expect(delDialog.hasAttribute('role')).toBe(false);
    expect(document.activeElement?.textContent).toBe('Cancel');
    delDialog.getBoundingClientRect = () => mockBounds as DOMRect;

    act(() => {
      delDialog.dispatchEvent(new PointerEvent('pointerdown', { clientX: 10, clientY: 10, bubbles: true }));
      delDialog.dispatchEvent(new PointerEvent('pointerup', { clientX: 10, clientY: 10, bubbles: true }));
    });
    expect(onDelClose).toHaveBeenCalledTimes(1);

    // 2. SkipOccurrenceDialog
    const onSkipClose = vi.fn();
    const skipView = mount(
      <SkipOccurrenceDialog
        isOpen={true}
        task={makeTask('s-1', 'Recycle', {
          dueAt: '2026-11-24',
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [2] },
        })}
        onClose={onSkipClose}
        onConfirm={vi.fn()}
      />
    );
    mounted.push(skipView.unmount);
    const skipDialog = skipView.container.querySelector<HTMLDialogElement>('dialog')!;
    expect(skipDialog.open).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onSkipClose).toHaveBeenCalledTimes(1);

    // 3. ShortcutsHelpDialog
    const onHelpClose = vi.fn();
    const helpView = mount(<ShortcutsHelpDialog open={true} onClose={onHelpClose} />);
    mounted.push(helpView.unmount);
    const helpDialog = helpView.container.querySelector<HTMLDialogElement>('dialog')!;
    expect(helpDialog.open).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close shortcuts');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onHelpClose).toHaveBeenCalledTimes(1);

    // 4. ConfirmDialog keeps role="alertdialog" on <dialog>
    const onConfirmCancel = vi.fn();
    const confirmView = mount(
      <ConfirmDialog
        open={true}
        title="Confirm action"
        confirmLabel="Proceed"
        onConfirm={vi.fn()}
        onCancel={onConfirmCancel}
      />
    );
    mounted.push(confirmView.unmount);
    const confirmDialog = confirmView.container.querySelector<HTMLDialogElement>('dialog[role="alertdialog"]')!;
    expect(confirmDialog).not.toBeNull();
    expect(confirmDialog.open).toBe(true);
    expect(document.activeElement?.textContent).toBe('Cancel');
  });

  it('Item P: CalendarMonthView hides collapsed off-week day buttons from tab order and adds full-date ARIA labels', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 18, 12, 0, 0));
    const view = mount(
      <CalendarMonthView
        tasks={[
          makeTask('ov', 'Overdue bill', { dueAt: '2026-11-16' }),
          makeTask('fut', 'Upcoming checkup', { dueAt: '2026-11-20' }),
        ]}
        year={2026}
        monthIndex={10}
        selectedDateStr="2026-11-18"
        expanded={false}
        onToggleExpanded={vi.fn()}
        onSelectDate={vi.fn()}
        onMonthChange={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const dayButtons = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button[data-date]'));
    expect(dayButtons).toHaveLength(42);

    const interactive = dayButtons.filter((b) => b.getAttribute('aria-hidden') !== 'true');
    const hidden = dayButtons.filter((b) => b.getAttribute('aria-hidden') === 'true');
    expect(interactive).toHaveLength(7);
    expect(hidden).toHaveLength(35);

    for (const h of hidden) {
      expect(h.tabIndex).toBe(-1);
      expect(h.getAttribute('aria-label')).toBeNull();
      expect(h.getAttribute('aria-pressed')).toBeNull();
    }

    const selectedBtn = interactive.find((b) => b.dataset.date === '2026-11-18')!;
    expect(selectedBtn.getAttribute('aria-pressed')).toBe('true');
    expect(selectedBtn.getAttribute('aria-label')).toContain('2026');

    const overdueBtn = interactive.find((b) => b.dataset.date === '2026-11-16')!;
    expect(overdueBtn.getAttribute('aria-label')).toContain('overdue tasks');

    const futureBtn = interactive.find((b) => b.dataset.date === '2026-11-20')!;
    expect(futureBtn.getAttribute('aria-label')).toContain('tasks scheduled');
  });

  it('Item P: DesktopSidebar collapsed rail, TaskCard checkbox, TaskGroupHeader, SwipeActionButton keyboard tooltip, and ChangeDatePicker expose proper ARIA', () => {
    const sidebarView = mount(
      <DesktopSidebar
        wide={false}
        activeNav="calendar"
        tasksDotTone={null}
        tasksCount={0}
        syncPhase="idle"
        onSelectCalendar={vi.fn()}
        onSelectTasks={vi.fn()}
        onSelectRecurring={vi.fn()}
        onSelectSearch={vi.fn()}
        onNewTask={vi.fn()}
        onOpenShortcuts={vi.fn()}
        onOpenSettings={vi.fn()}
      />
    );
    mounted.push(sidebarView.unmount);
    for (const label of ['New task', 'Calendar', 'Tasks', 'Recurring', 'Search', 'Shortcuts', 'Settings']) {
      expect(sidebarView.container.querySelector(`button[aria-label="${label}"]`)).not.toBeNull();
    }

    const cardView = mount(
      <div>
        <TaskGroupHeader label="Today" count={1} collapsed={true} onToggle={vi.fn()} />
        <TaskCard
          task={makeTask('t-chk', 'Pay internet bill')}
          onComplete={vi.fn()}
          onSelect={vi.fn()}
        />
        <SwipeActionButton
          icon={<span>D</span>}
          label="Skip"
          explanation="Skip this date"
          colorClasses="bg-blue-600 text-white"
          onClick={vi.fn()}
        />
        <ChangeDatePicker testId="custom-date-picker" onSave={vi.fn()} />
      </div>
    );
    mounted.push(cardView.unmount);

    const groupBtn = cardView.container.querySelector<HTMLButtonElement>('button[aria-expanded]')!;
    expect(groupBtn.getAttribute('aria-expanded')).toBe('false');

    const checkbox = cardView.container.querySelector<HTMLButtonElement>('button[role="checkbox"]')!;
    expect(checkbox.getAttribute('aria-checked')).toBe('false');
    expect(checkbox.getAttribute('aria-label')).toBe('Complete "Pay internet bill"');

    const swipeBtn = cardView.container.querySelector<HTMLButtonElement>('button[aria-label="Skip"]')!;
    expect(swipeBtn.hasAttribute('title')).toBe(false);
    expect(swipeBtn.getAttribute('aria-description')).toBe('Skip this date');

    act(() => {
      swipeBtn.focus();
      swipeBtn.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));
    });
    const tooltip = document.body.querySelector<HTMLElement>('[data-testid="swipe-action-tooltip"]')!;
    expect(tooltip).not.toBeNull();
    expect(swipeBtn.getAttribute('aria-describedby')).toBe(tooltip.id);

    act(() => {
      swipeBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.body.querySelector('[data-testid="swipe-action-tooltip"]')).toBeNull();

    const dateInput = cardView.container.querySelector<HTMLInputElement>('[data-testid="custom-date-picker"]')!;
    expect(dateInput.getAttribute('aria-hidden')).toBe('true');
  });

  it('Item R: ReorderableTaskList updates dragged row DOM transform imperatively without re-rendering siblings and keeps callback identities stable', () => {
    vi.useFakeTimers();
    const renderCounts: Record<string, number> = { a: 0, b: 0, c: 0 };
    const capturedCallbacks = new Map<string, { rowRef: RowDragProps['rowRef']; onDown: RowDragProps['onRowPointerDown'] }>();

    const MemoRow = memo(function MemoRow({
      task,
      dragProps,
    }: {
      task: Task;
      dragProps: RowDragProps;
    }) {
      renderCounts[task.id] += 1;
      capturedCallbacks.set(task.id, {
        rowRef: dragProps.rowRef,
        onDown: dragProps.onRowPointerDown,
      });
      return (
        <div
          data-row={task.id}
          ref={dragProps.rowRef}
          onPointerDown={dragProps.onRowPointerDown}
          style={dragProps.isDragging ? { transform: `translateY(${dragProps.dragOffsetY}px)` } : undefined}
        >
          {task.title}
        </div>
      );
    });

    const tasks = [
      makeTask('a', 'Task A'),
      makeTask('b', 'Task B'),
      makeTask('c', 'Task C'),
    ];
    const onReorder = vi.fn();
    const renderRow = (task: Task, dragProps: RowDragProps) => (
      <MemoRow key={task.id} task={task} dragProps={dragProps} />
    );

    const view = mount(
      <div data-testid="scrollport" style={{ overflowY: 'auto' }}>
        <ReorderableTaskList tasks={tasks} enabled={true} onReorder={onReorder} renderRow={renderRow} />
      </div>
    );
    mounted.push(view.unmount);

    const port = view.container.querySelector<HTMLElement>('[data-testid="scrollport"]')!;
    Object.defineProperty(port, 'clientHeight', { configurable: true, value: 80 });
    Object.defineProperty(port, 'scrollHeight', { configurable: true, value: 400 });

    const rowA = view.container.querySelector<HTMLElement>('[data-row="a"]')!;
    const rowB = view.container.querySelector<HTMLElement>('[data-row="b"]')!;
    const rowC = view.container.querySelector<HTMLElement>('[data-row="c"]')!;
    rowA.getBoundingClientRect = () => ({ top: 0, bottom: 50, height: 50, left: 0, right: 300, width: 300 } as DOMRect);
    rowB.getBoundingClientRect = () => ({ top: 50, bottom: 100, height: 50, left: 0, right: 300, width: 300 } as DOMRect);
    rowC.getBoundingClientRect = () => ({ top: 100, bottom: 150, height: 50, left: 0, right: 300, width: 300 } as DOMRect);

    const initialRefA = capturedCallbacks.get('a')!.rowRef;
    const initialDownA = capturedCallbacks.get('a')!.onDown;
    view.rerender(
      <div data-testid="scrollport" style={{ overflowY: 'auto' }}>
        <ReorderableTaskList tasks={tasks} enabled={true} onReorder={onReorder} renderRow={renderRow} />
      </div>
    );
    expect(capturedCallbacks.get('a')!.rowRef).toBe(initialRefA);
    expect(capturedCallbacks.get('a')!.onDown).toBe(initialDownA);

    act(() => {
      rowA.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 1, clientX: 10, clientY: 25, bubbles: true }));
      vi.advanceTimersByTime(350);
    });

    // Cross into downward tracking (targetIndex 0 -> 1 on first pixel), then verify subsequent
    // pixel moves update DOM transform imperatively without triggering React re-renders.
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 27, bubbles: true }));
    });
    const countsAfterSlotSet = { ...renderCounts };
    act(() => {
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 32, bubbles: true }));
      window.dispatchEvent(new PointerEvent('pointermove', { pointerId: 1, clientX: 10, clientY: 38, bubbles: true }));
    });
    expect(rowA.style.transform).toBe('translateY(13px)');
    expect(renderCounts).toEqual(countsAfterSlotSet);

    act(() => {
      window.dispatchEvent(new PointerEvent('pointerup', { pointerId: 1, clientX: 10, clientY: 38, bubbles: true }));
    });
  });

  it('Item S: ErrorBoundary catches render errors, records diagnostics, and copies diagnostics payload', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', { clipboard: { writeText } });

    function Crasher(): ReactElement {
      throw new Error('Boom render failure');
    }

    const view = mount(
      <ErrorBoundary>
        <Crasher />
      </ErrorBoundary>
    );
    mounted.push(view.unmount);

    expect(view.container.textContent).toContain('Something went wrong');
    expect(view.container.textContent).toContain('Boom render failure');
    expect(view.container.textContent).toContain('Reload App');

    const copyBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Copy Diagnostics')
    )!;
    expect(copyBtn).toBeTruthy();

    await act(async () => {
      copyBtn.click();
    });
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(writeText.mock.calls[0][0]).toContain('Boom render failure');
    expect(copyBtn.textContent).toContain('Copied Diagnostics');

    vi.unstubAllGlobals();
  });

  it('Item S: diagnostics flushes buffered events on pagehide and visibilitychange (hidden)', async () => {
    vi.resetModules();
    const diag = await import('../../domain/diagnostics');
    diag.initDiagnostics();

    diag.recordDiagEvent('test_before_pagehide', 'payload-1');
    expect(localStorage.getItem('tempo_diag_log_v1')).toBeNull();

    window.dispatchEvent(new Event('pagehide'));
    expect(localStorage.getItem('tempo_diag_log_v1')).toContain('payload-1');

    diag.recordDiagEvent('test_before_hidden', 'payload-2');
    const prevState = Object.getOwnPropertyDescriptor(document, 'visibilityState');
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'hidden' });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      expect(localStorage.getItem('tempo_diag_log_v1')).toContain('payload-2');
    } finally {
      if (prevState) {
        Object.defineProperty(document, 'visibilityState', prevState);
      }
    }
  });
});
