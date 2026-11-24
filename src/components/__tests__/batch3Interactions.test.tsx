// @vitest-environment happy-dom
import { act, type ReactElement, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type Task } from '../../types/task';
import { completionTimestampForDate, type WindowProgress } from '../../domain/recurrence';
import {
  resetBottomBannerCoordinator,
  useBottomBannerSlot,
} from '../../domain/bottomBannerCoordinator';
import { MEDIA_DESKTOP, MEDIA_SPLIT, MEDIA_WIDE_DESKTOP } from '../../hooks/useLayoutMode';
import { useCalendarPullGesture } from '../../hooks/useCalendarPullGesture';
import { applyTheme } from '../../prefs/theme';
import { PREFS_STORAGE_KEY, resetPrefsCache } from '../../prefs/prefs';
import themeInitCode from '../../../public/theme-init.js?raw';

const dbMocks = vi.hoisted(() => ({
  tasks: [] as Task[],
  listeners: new Set<() => void>(),
  restoreTaskSnapshot: vi.fn(async () => undefined),
  completeTask: vi.fn<(id: string, dateStr?: string) => Promise<Task | null>>(async () => null),
  uncompleteTask: vi.fn<(id: string, dateStr?: string) => Promise<Task | null>>(async () => null),
  skipTaskOccurrence: vi.fn<(id: string, dateStr: string) => Promise<Task | null>>(async () => null),
  softDeleteTask: vi.fn<(id: string) => Promise<void>>(async () => undefined),
  unskipTaskOccurrence: vi.fn<(id: string, dateStr: string) => Promise<Task | null>>(async () => null),
}));

function notifyDbListeners() {
  for (const fn of dbMocks.listeners) fn();
}

vi.mock('../../db/db', () => ({
  db: {
    tasks: {
      toArray: vi.fn(async () => [...dbMocks.tasks]),
      get: vi.fn(async (id: string) => dbMocks.tasks.find((t) => t.id === id)),
      put: vi.fn(async (task: Task) => {
        const idx = dbMocks.tasks.findIndex((t) => t.id === task.id);
        if (idx >= 0) dbMocks.tasks[idx] = task;
        else dbMocks.tasks.push(task);
        notifyDbListeners();
      }),
    },
  },
  initDatabase: vi.fn().mockResolvedValue(undefined),
  saveTask: vi.fn(async () => undefined),
  reorderTasks: vi.fn(async () => undefined),
  completeTask: dbMocks.completeTask,
  uncompleteTask: dbMocks.uncompleteTask,
  undoCompleteUndatedTask: vi.fn(async () => null),
  logTaskCompletion: vi.fn(async () => undefined),
  removeTaskCompletion: vi.fn(async () => undefined),
  moveRecurringOccurrenceOnly: vi.fn(async () => null),
  moveRecurringSeries: vi.fn(async () => null),
  restoreTaskSnapshot: dbMocks.restoreTaskSnapshot,
  setTaskEndOnDate: vi.fn(async () => undefined),
  skipTaskOccurrence: dbMocks.skipTaskOccurrence,
  unskipTaskOccurrence: dbMocks.unskipTaskOccurrence,
  softDeleteTask: dbMocks.softDeleteTask,
  stopRecurringTask: vi.fn(async () => null),
  clearAllData: vi.fn(async () => 0),
  getClearAllDataPreview: vi.fn(async () => ({
    openTasks: 0,
    completedTasks: 0,
    activeTasks: 0,
  })),
  clearSampleTasks: vi.fn(async () => 0),
  isSampleId: vi.fn(() => false),
  loadSampleTasks: vi.fn(async () => 0),
  repairAndDeduplicateDatabase: vi.fn(async () => ({
    deduplicatedTasks: 0,
    purgedTombstones: 0,
  })),
  findImportedCompletedTaskIds: vi.fn(() => []),
  getStorageCleanupPreview: vi.fn(async () => ({
    importedCompletedTasks: 0,
    tombstonedTasks: 0,
    activeRemainingTasks: 0,
  })),
  cleanupImportedAndTombstones: vi.fn(async () => ({
    removedImportedCompleted: 0,
    purgedTasks: 0,
    needsSync: false,
  })),
}));

vi.mock('dexie-react-hooks', async () => {
  const React = await import('react');
  return {
    useLiveQuery: () => {
      const [tasks, setTasks] = React.useState<Task[]>(() => [...dbMocks.tasks]);
      React.useEffect(() => {
        const update = () => setTasks([...dbMocks.tasks]);
        dbMocks.listeners.add(update);
        update();
        return () => {
          dbMocks.listeners.delete(update);
        };
      }, []);
      return tasks;
    },
  };
});

vi.mock('../../hooks/useAutoSync', () => ({
  useAutoSync: () => ({
    status: { phase: 'idle', lastSyncedAt: null, lastError: null, autoSyncEnabled: false, account: null },
    syncNow: vi.fn(),
    scheduleSync: vi.fn(),
    refreshStatus: vi.fn(),
  }),
}));

vi.mock('../../pwa/shareText', () => ({
  takeSharedText: vi.fn().mockResolvedValue(''),
  shareTextFromParts: vi.fn().mockReturnValue(''),
}));

vi.mock('../PwaUpdatePrompt', () => ({
  triggerAppUpdate: vi.fn(),
}));

import { App } from '../../App';
import { type CalendarMonthHandle } from '../CalendarMonthView';
import { TaskCard } from '../TaskCard';
import { RadialProgressRingWithTooltip } from '../RadialProgressRing';
import { OverflowMenu } from '../menu/OverflowMenu';
import { UndoToast } from '../ui/UndoToast';
import { SyncReconnectPrompt } from '../SyncReconnectPrompt';
import { InstallPrompt } from '../InstallPrompt';

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

function dispatchTouch(target: EventTarget, type: string, clientX: number, clientY: number) {
  const evt = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    touches: Array<{ clientX: number; clientY: number }>;
    changedTouches: Array<{ clientX: number; clientY: number }>;
  };
  const pt = [{ clientX, clientY }];
  Object.defineProperty(evt, 'touches', { value: type === 'touchend' ? [] : pt });
  Object.defineProperty(evt, 'changedTouches', { value: pt });
  act(() => {
    target.dispatchEvent(evt);
  });
  return evt;
}

function stubDesktopMatchMedia() {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === MEDIA_SPLIT || query === MEDIA_DESKTOP || query === MEDIA_WIDE_DESKTOP,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }) as unknown as MediaQueryList
  );
}

describe('Batch 3 interactions (Items L, M, O, T)', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    resetBottomBannerCoordinator();
    dbMocks.tasks = [];
    dbMocks.listeners.clear();
    dbMocks.restoreTaskSnapshot.mockClear();
    dbMocks.uncompleteTask.mockClear();
    dbMocks.completeTask.mockImplementation(async (id: string, dateStr?: string) => {
      const idx = dbMocks.tasks.findIndex((t) => t.id === id);
      if (idx < 0) return null;
      const cur = dbMocks.tasks[idx];
      const next: Task = {
        ...cur,
        completedAt: cur.recurrence ? null : Date.now(),
        completionHistory: [
          ...cur.completionHistory,
          dateStr ? completionTimestampForDate(dateStr) : Date.now(),
        ],
      };
      dbMocks.tasks[idx] = next;
      notifyDbListeners();
      return next;
    });
    dbMocks.skipTaskOccurrence.mockImplementation(async (id: string, dateStr: string) => {
      const idx = dbMocks.tasks.findIndex((t) => t.id === id);
      if (idx < 0) return null;
      const cur = dbMocks.tasks[idx];
      const next: Task = {
        ...cur,
        skippedDates: [...(cur.skippedDates ?? []), dateStr],
      };
      dbMocks.tasks[idx] = next;
      notifyDbListeners();
      return next;
    });
    dbMocks.softDeleteTask.mockImplementation(async (id: string) => {
      const idx = dbMocks.tasks.findIndex((t) => t.id === id);
      if (idx >= 0) {
        dbMocks.tasks[idx] = { ...dbMocks.tasks[idx], deletedAt: Date.now() };
        notifyDbListeners();
      }
    });
    dbMocks.unskipTaskOccurrence.mockClear();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    resetBottomBannerCoordinator();
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
    document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
    delete document.documentElement.dataset.theme;
    document.body.replaceChildren();
  });

  it('Item L: TaskCard Enter/Space triggers select only from the title/body button and not from checkbox or action buttons', () => {
    const onSelect = vi.fn();
    const recurring = makeTask('r-1', 'Take trash out', {
      dueAt: '2026-11-23',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1],
      },
    });

    const view = mount(
      <TaskCard
        task={recurring}
        occurrenceDateStr="2026-11-23"
        onComplete={vi.fn()}
        onSelect={onSelect}
        onRequestSkipOccurrence={vi.fn()}
        onRequestDelete={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const card = view.container.querySelector<HTMLElement>('[data-testid="task-card"]')!;
    const bodyBtn = card.querySelector<HTMLElement>('[role="button"][tabindex="0"]')!;
    const checkbox = card.querySelector<HTMLButtonElement>('button[title="Complete this occurrence"]')!;
    const skipBtn = card.querySelector<HTMLButtonElement>('button[aria-label="Skip Occurrence"]')!;
    const deleteBtn = card.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!;

    act(() => {
      checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      checkbox.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      skipBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      deleteBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(onSelect).not.toHaveBeenCalled();

    act(() => {
      bodyBtn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      bodyBtn.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
    });
    expect(onSelect).toHaveBeenCalledTimes(2);
  });

  it('Item L & O: isolates swipe exclusion by card instance, releases mouse drags on window, and disables Skip on completed occurrences', () => {
    const shared = makeTask('dup-1', 'Duplicate row task', {
      dueAt: '2026-11-23',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1],
      },
    });

    const completedTs = completionTimestampForDate('2026-11-23');
    const view = mount(
      <div>
        <TaskCard task={shared} occurrenceDateStr="2026-11-23" onComplete={vi.fn()} />
        <TaskCard
          task={{
            ...shared,
            completedAt: completedTs,
            completionHistory: [completedTs],
          }}
          occurrenceDateStr="2026-11-23"
          onComplete={vi.fn()}
          onUncomplete={vi.fn()}
          onRequestSkipOccurrence={vi.fn()}
        />
      </div>
    );
    mounted.push(view.unmount);

    const rows = Array.from(view.container.querySelectorAll<HTMLElement>('[style*="translateX"]'));
    expect(rows).toHaveLength(2);

    // Swipe open card 1 via touch
    dispatchTouch(rows[0], 'touchstart', 180, 40);
    dispatchTouch(rows[0], 'touchmove', 100, 42);
    dispatchTouch(rows[0], 'touchend', 100, 42);
    expect(rows[0].style.transform).toBe('translateX(-160px)');

    // Second card is completed: Skip button is disabled with clear explanation
    const cards = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="task-card"]'));
    const completedSkip = cards[1].querySelector<HTMLButtonElement>('button[aria-label="Skip Occurrence"]')!;
    expect(completedSkip.disabled).toBe(true);
    expect(completedSkip.getAttribute('aria-description')).toContain('Already completed for this date');

    // Mouse swipe on an editable third instance tracks via window pointermove/pointerup even off-element
    const editableView = mount(
      <TaskCard task={shared} occurrenceDateStr="2026-11-23" onComplete={vi.fn()} />
    );
    mounted.push(editableView.unmount);
    const row3 = editableView.container.querySelector<HTMLElement>('[style*="translateX"]')!;

    act(() => {
      row3.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX: 180,
          clientY: 40,
          bubbles: true,
        })
      );
    });
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerType: 'mouse',
          buttons: 1,
          clientX: 100,
          clientY: 42,
          bubbles: true,
        })
      );
    });
    expect(row3.style.transform).toBe('translateX(-80px)');
    // Because each card registers its own useId() key, opening another card closes card 1 even with identical task.id
    act(() => {
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerType: 'mouse',
          button: 0,
          buttons: 0,
          clientX: 100,
          clientY: 42,
          bubbles: true,
        })
      );
    });
    expect(row3.style.transform).toBe('translateX(-160px)');
    expect(rows[0].style.transform).toBe('translateX(0px)');

    // Mouse pointermove with buttons === 0 clears stuck drag cleanly
    act(() => {
      row3.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'mouse',
          button: 0,
          buttons: 1,
          clientX: 60,
          clientY: 40,
          bubbles: true,
        })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerType: 'mouse',
          buttons: 0,
          clientX: 180,
          clientY: 40,
          bubbles: true,
        })
      );
    });
    const card3 = editableView.container.querySelector<HTMLElement>('[data-testid="task-card"]')!;
    expect(card3.getAttribute('data-dragging')).toBeNull();
  });

  it('Item L: useCalendarPullGesture ignores non-primary mouse buttons', () => {
    const setCalExpanded = vi.fn();

    function PullHarness() {
      const calAreaRef = useRef<HTMLDivElement | null>(null);
      const calScrollRef = useRef<HTMLDivElement | null>(null);
      const monthViewRef = useRef<CalendarMonthHandle | null>(null);
      const { areaPointerProps } = useCalendarPullGesture({
        calAreaRef,
        calScrollRef,
        monthViewRef,
        calExpanded: false,
        setCalExpanded,
        active: true,
      });
      return (
        <div ref={calAreaRef} data-testid="pull-area" {...areaPointerProps}>
          <div ref={calScrollRef} />
        </div>
      );
    }

    const view = mount(<PullHarness />);
    mounted.push(view.unmount);

    const area = view.container.querySelector<HTMLElement>('[data-testid="pull-area"]')!;
    act(() => {
      area.dispatchEvent(
        new PointerEvent('pointerdown', {
          pointerType: 'mouse',
          button: 2,
          buttons: 2,
          clientY: 10,
          bubbles: true,
        })
      );
      window.dispatchEvent(
        new PointerEvent('pointermove', {
          pointerType: 'mouse',
          buttons: 2,
          clientY: 140,
          bubbles: true,
        })
      );
      window.dispatchEvent(
        new PointerEvent('pointerup', {
          pointerType: 'mouse',
          button: 2,
          buttons: 0,
          clientY: 140,
          bubbles: true,
        })
      );
    });
    expect(setCalExpanded).not.toHaveBeenCalled();
  });

  it('Item M: RadialProgressRingWithTooltip consumes Escape in capture phase without infinite clamping loop', () => {
    const progress: WindowProgress = {
      stage: 'in_window',
      visibleInTasks: true,
      sortScore: 0.5,
      ringFill: 0.6,
      overdueIntensity: 0,
      elapsedDays: 5,
      minDays: 3,
      maxDays: 7,
      lastDoneMs: Date.now() - 5 * 86400000,
      doneToday: false,
      detailLabel: '5d since last done (3-7d)',
      daysUntilOpen: 0,
      daysUntilMax: 2,
      nextOpenDateStr: null,
    };

    const docBubbleEscSpy = vi.fn();
    document.addEventListener('keydown', docBubbleEscSpy);
    mounted.push(() => document.removeEventListener('keydown', docBubbleEscSpy));

    const view = mount(<RadialProgressRingWithTooltip progress={progress} />);
    mounted.push(view.unmount);

    const trigger = view.container.querySelector<HTMLButtonElement>('button')!;
    act(() => {
      trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    const tooltip = document.body.querySelector<HTMLElement>('[role="tooltip"]')!;
    expect(tooltip).not.toBeNull();
    expect(tooltip.style.maxWidth).toBe('calc(100dvw - 24px)');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull();
    expect(docBubbleEscSpy).not.toHaveBeenCalled();
  });

  it('Item M, O, T (App): gates shortcuts behind open modals, hides duplicate desktop date subtitles, and offers Undo on Skip/Delete/Overdue Complete', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 11, 28, 12, 0, 0));
    stubDesktopMatchMedia();

    const recurringToday = makeTask('rec-1', 'Monday standup prep', {
      dueAt: '2026-12-28',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1],
      },
    });
    const oneOffToday = makeTask('one-1', 'Buy milk', { dueAt: '2026-12-28' });
    const overdueOneOff = makeTask('ov-1', 'Overdue tax form', { dueAt: '2026-12-25' });
    dbMocks.tasks = [recurringToday, oneOffToday, overdueOneOff];

    const view = mount(<App />);
    mounted.push(view.unmount);

    // M: `?` opens Shortcuts; while open, `n` does not open QuickAddSheet; Esc closes Shortcuts
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    });
    expect(view.container.textContent).toContain('Shortcuts');
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(view.container.querySelector('button[aria-label="Close shortcuts"]')).toBeNull();

    // Opening QuickAddSheet via `n` blocks `?` from opening Shortcuts
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true, cancelable: true }));
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).not.toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: '?', bubbles: true, cancelable: true }));
    });
    expect(view.container.querySelector('button[aria-label="Close shortcuts"]')).toBeNull();
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).toBeNull();

    // O: Desktop date heading does not repeat identical subtitle on same-year non-relative day, and appends year for 2027
    const dec30Btn = view.container.querySelector<HTMLButtonElement>('button[data-date="2026-12-30"]')!;
    act(() => dec30Btn.click());
    const selectedPane = view.container.querySelector<HTMLElement>('section[aria-label="Selected day tasks"]')!;
    const paneHeader = selectedPane.querySelector('header, div')!;
    const dec30Formatted = new Date(2026, 11, 30).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
    expect(paneHeader.textContent!.split(dec30Formatted)).toHaveLength(2);

    const jan1Btn = view.container.querySelector<HTMLButtonElement>('button[data-date="2027-01-01"]')!;
    act(() => jan1Btn.click());
    expect(selectedPane.querySelector('div')!.textContent).toContain('2027');

    // Jump back to Today (Dec 28, 2026) for Skip / Delete / Overdue Complete Undo tests
    const dec28Btn = view.container.querySelector<HTMLButtonElement>('button[data-date="2026-12-28"]')!;
    act(() => dec28Btn.click());

    // T: Overdue Complete shows Undo toast and invokes uncompleteTask on Undo
    const overdueCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="task-card"]')).find((c) =>
      c.textContent?.includes('Overdue tax form')
    )!;
    const overdueCheck = overdueCard.querySelector<HTMLButtonElement>('button[title="Complete"]')!;
    await act(async () => {
      overdueCheck.click();
    });
    let toast = document.body.querySelector<HTMLElement>('[data-testid="undo-toast"]');
    expect(toast).not.toBeNull();
    await act(async () => {
      Array.from(toast!.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Undo')!
        .click();
    });
    expect(dbMocks.uncompleteTask).toHaveBeenCalledWith('ov-1', '2026-12-25');

    // T: Skip Occurrence shows Undo toast and calls restoreTaskSnapshot
    const recCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="task-card"]')).find((c) =>
      c.textContent?.includes('Monday standup prep')
    )!;
    act(() => {
      recCard.querySelector<HTMLButtonElement>('button[aria-label="Skip Occurrence"]')!.click();
    });
    const confirmSkipBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Skip Occurrence'
    )!;
    await act(async () => {
      confirmSkipBtn.click();
    });
    toast = document.body.querySelector<HTMLElement>('[data-testid="undo-toast"]');
    expect(toast).not.toBeNull();
    await act(async () => {
      Array.from(toast!.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Undo')!
        .click();
    });
    expect(dbMocks.restoreTaskSnapshot).toHaveBeenCalledTimes(1);

    // T: Delete confirms -> shows Undo toast -> Undo restores snapshot
    const oneCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="task-card"]')).find((c) =>
      c.textContent?.includes('Buy milk')
    )!;
    act(() => {
      oneCard.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!.click();
    });
    const confirmDelBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.trim() === 'Delete' && !b.getAttribute('aria-label')
    )!;
    await act(async () => {
      confirmDelBtn.click();
    });
    toast = document.body.querySelector<HTMLElement>('[data-testid="undo-toast"]');
    expect(toast).not.toBeNull();
    await act(async () => {
      Array.from(toast!.querySelectorAll<HTMLButtonElement>('button'))
        .find((b) => b.textContent?.trim() === 'Undo')!
        .click();
    });
    expect(dbMocks.restoreTaskSnapshot).toHaveBeenCalledTimes(2);
  });

  it('Item O: OverflowMenu supports arrow keys, Home/End, maxHeight scroll clamping, and focus restoration on Escape', () => {
    const anchorBtn = document.createElement('button');
    anchorBtn.textContent = 'More';
    document.body.appendChild(anchorBtn);
    anchorBtn.focus();
    const anchorRect = new DOMRect(100, 100, 32, 32);

    const onClose = vi.fn();
    const view = mount(
      <OverflowMenu
        open={true}
        anchor={anchorRect}
        showDetails={false}
        hideCompleted={false}
        showOverdue={true}
        onClose={onClose}
        onToggleDetails={vi.fn()}
        onToggleHideCompleted={vi.fn()}
        onToggleShowOverdue={vi.fn()}
        onUpdateApp={vi.fn()}
        onSettings={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const menu = view.container.querySelector<HTMLElement>('[role="menu"]')!;
    expect(menu.style.maxHeight).toBeTruthy();
    const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
    expect(document.activeElement).toBe(items[0]);

    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[1]);

    act(() => {
      items[1].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[items.length - 1]);

    act(() => {
      items[items.length - 1].dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true })
      );
    });
    expect(document.activeElement).toBe(items[0]);

    act(() => {
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[items.length - 1]);

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchorBtn);
  });

  it('Item O: bottomBannerCoordinator yields lower-priority banners in strict order (undo > pwa-update > sync-reconnect > install)', () => {
    function MockPwaBanner({ active }: { active: boolean }) {
      const allowed = useBottomBannerSlot('pwa-update', active);
      return allowed ? <div data-testid="mock-pwa-banner">Update ready</div> : null;
    }

    function BannerStack(props: { showUndo: boolean; showPwa: boolean; showSync: boolean }) {
      return (
        <div>
          <UndoToast
            toast={props.showUndo ? { id: 1, message: 'Completed task', onUndo: vi.fn() } : null}
            onDismiss={vi.fn()}
          />
          <MockPwaBanner active={props.showPwa} />
          <SyncReconnectPrompt
            authPrompt={props.showSync ? { reason: 'auth_required', dismissed: false } : null}
            onReconnect={vi.fn()}
            onDismiss={vi.fn()}
          />
          <InstallPrompt />
        </div>
      );
    }

    const view = mount(<BannerStack showUndo={true} showPwa={true} showSync={true} />);
    mounted.push(view.unmount);

    act(() => {
      const bip = new Event('beforeinstallprompt', { cancelable: true }) as Event & {
        prompt: () => Promise<void>;
        userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
      };
      bip.prompt = vi.fn().mockResolvedValue(undefined);
      bip.userChoice = Promise.resolve({ outcome: 'dismissed' });
      window.dispatchEvent(bip);
    });

    // Only Undo wins while all four are active
    expect(view.container.querySelector('[data-testid="undo-toast"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="mock-pwa-banner"]')).toBeNull();
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Install Tempo');

    // Drop Undo -> PWA wins
    view.rerender(<BannerStack showUndo={false} showPwa={true} showSync={true} />);
    expect(view.container.querySelector('[data-testid="mock-pwa-banner"]')).not.toBeNull();
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Install Tempo');

    // Drop PWA -> SyncReconnect wins
    view.rerender(<BannerStack showUndo={false} showPwa={false} showSync={true} />);
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).not.toBeNull();
    expect(view.container.textContent).not.toContain('Install Tempo');

    // Drop SyncReconnect -> Install wins
    view.rerender(<BannerStack showUndo={false} showPwa={false} showSync={false} />);
    expect(view.container.textContent).toContain('Install Tempo');
  });

  it('Item T: theme-init.js syncs theme-color metas early while preserving data-media so applyTheme("system") restores them', () => {
    const lightMeta = document.createElement('meta');
    lightMeta.name = 'theme-color';
    lightMeta.setAttribute('media', '(prefers-color-scheme: light)');
    lightMeta.content = '#f2f4f9';

    const darkMeta = document.createElement('meta');
    darkMeta.name = 'theme-color';
    darkMeta.setAttribute('media', '(prefers-color-scheme: dark)');
    darkMeta.content = '#000000';

    document.head.append(lightMeta, darkMeta);
    localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify({ theme: 'dark' }));

    new Function(themeInitCode)();

    expect(document.documentElement.dataset.theme).toBe('dark');
    expect(lightMeta.getAttribute('data-media')).toBe('(prefers-color-scheme: light)');
    expect(darkMeta.getAttribute('data-media')).toBe('(prefers-color-scheme: dark)');
    expect(lightMeta.hasAttribute('media')).toBe(false);
    expect(darkMeta.hasAttribute('media')).toBe(false);
    expect(lightMeta.content).toBe('#000000');
    expect(darkMeta.content).toBe('#000000');

    applyTheme('system', document);
    expect(document.documentElement.dataset.theme).toBeUndefined();
    expect(lightMeta.getAttribute('media')).toBe('(prefers-color-scheme: light)');
    expect(darkMeta.getAttribute('media')).toBe('(prefers-color-scheme: dark)');
  });
});
