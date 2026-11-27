// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CALENDAR_SELECTED_DATE_STORAGE_KEY, CALENDAR_SELECTED_TODAY_SENTINEL } from '../../domain/calendarUi';
import { resetPrefsCache } from '../../prefs/prefs';
import { resetBottomBannerCoordinator } from '../../domain/bottomBannerCoordinator';
import { MEDIA_DESKTOP, MEDIA_SPLIT, MEDIA_WIDE_DESKTOP } from '../../hooks/useLayoutMode';
import type { Task } from '../../types/task';

const mockDbState = vi.hoisted(() => ({
  tasks: [] as Task[],
  listeners: new Set<() => void>(),
}));

function notifyDbListeners() {
  for (const fn of mockDbState.listeners) fn();
}

vi.mock('../../db/db', () => ({
  db: {
    tasks: {
      toArray: vi.fn(async () => [...mockDbState.tasks]),
      get: vi.fn(async (id: string) => mockDbState.tasks.find((t) => t.id === id)),
      put: vi.fn(async (task: Task) => {
        const idx = mockDbState.tasks.findIndex((t) => t.id === task.id);
        if (idx >= 0) mockDbState.tasks[idx] = task;
        else mockDbState.tasks.push(task);
        notifyDbListeners();
      }),
    },
  },
  initDatabase: vi.fn().mockResolvedValue(undefined),
  saveTask: vi.fn(async () => undefined),
  reorderTasks: vi.fn(async () => undefined),
  completeTask: vi.fn(async () => null),
  uncompleteTask: vi.fn(async () => null),
  undoCompleteUndatedTask: vi.fn(async () => null),
  logTaskCompletion: vi.fn(async () => undefined),
  removeTaskCompletion: vi.fn(async () => undefined),
  moveRecurringOccurrenceOnly: vi.fn(async () => null),
  moveRecurringSeries: vi.fn(async () => null),
  restoreTaskSnapshot: vi.fn(async () => undefined),
  setTaskEndOnDate: vi.fn(async () => undefined),
  skipTaskOccurrence: vi.fn(async () => null),
  softDeleteTask: vi.fn(async () => undefined),
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
      const [tasks, setTasks] = React.useState<Task[]>(() => [...mockDbState.tasks]);
      React.useEffect(() => {
        const update = () => setTasks([...mockDbState.tasks]);
        mockDbState.listeners.add(update);
        update();
        return () => {
          mockDbState.listeners.delete(update);
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

vi.mock('../InstallPrompt', () => ({
  InstallPrompt: () => null,
}));

vi.mock('../PwaUpdatePrompt', () => ({
  triggerAppUpdate: vi.fn(),
}));

import { App } from '../../App';

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

function stubMatchMedia(predicate: (query: string) => boolean) {
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: predicate(query),
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

describe('calendar selected date persistence across refreshes/reopens', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    resetBottomBannerCoordinator();
    mockDbState.tasks = [];
    mockDbState.listeners.clear();
    stubMatchMedia(
      (q) => q === MEDIA_SPLIT || q === MEDIA_DESKTOP || q === MEDIA_WIDE_DESKTOP
    );
  });

  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    vi.useRealTimers();
    vi.restoreAllMocks();
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('remembers a non-today selected date across refresh/reopen', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));

    mockDbState.tasks = [
      makeTask('1', 'Nov 27 task', { dueAt: '2026-11-27' }),
      makeTask('2', 'Dec 3 task', { dueAt: '2026-12-03' }),
    ];

    const view1 = mount(<App />);
    mounted.push(view1.unmount);
    await act(async () => { await Promise.resolve(); });

    const nextMonthButton = view1.container.querySelector<HTMLButtonElement>('button[aria-label="Next month"]');
    expect(nextMonthButton).not.toBeNull();
    act(() => nextMonthButton!.click());

    const dayButton = view1.container.querySelector<HTMLButtonElement>('button[data-date="2026-12-03"]');
    expect(dayButton).not.toBeNull();
    act(() => dayButton!.click());

    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe('2026-12-03');

    view1.unmount();

    const view2 = mount(<App />);
    mounted.push(view2.unmount);
    await act(async () => { await Promise.resolve(); });

    expect(view2.container.textContent).toContain('December 2026');
    expect(view2.container.textContent).toContain('Dec 3 task');
    const selectedDayButton = view2.container.querySelector('button[data-date="2026-12-03"]');
    expect(selectedDayButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('shows the new current "today" on a later day when previously viewing "today"', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));

    mockDbState.tasks = [
      makeTask('1', 'Nov 27 task', { dueAt: '2026-11-27' }),
      makeTask('2', 'Dec 1 task', { dueAt: '2026-12-01' }),
    ];

    const view1 = mount(<App />);
    mounted.push(view1.unmount);
    await act(async () => { await Promise.resolve(); });

    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe(CALENDAR_SELECTED_TODAY_SENTINEL);

    view1.unmount();

    vi.setSystemTime(new Date(2026, 11, 1, 10, 0, 0)); // Dec 1, 2026

    const view2 = mount(<App />);
    mounted.push(view2.unmount);
    await act(async () => { await Promise.resolve(); });

    expect(view2.container.textContent).toContain('December 2026');
    expect(view2.container.textContent).toContain('Dec 1 task');
    const selectedDayButton = view2.container.querySelector('button[data-date="2026-12-01"]');
    expect(selectedDayButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('resumes tracking current "today" after clicking Today from another date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 10, 0, 0));

    mockDbState.tasks = [
      makeTask('1', 'Nov 27 task', { dueAt: '2026-11-27' }),
      makeTask('2', 'Nov 28 task', { dueAt: '2026-11-28' }),
    ];

    const view1 = mount(<App />);
    mounted.push(view1.unmount);
    await act(async () => { await Promise.resolve(); });

    const dayButton = view1.container.querySelector<HTMLButtonElement>('button[data-date="2026-11-28"]');
    expect(dayButton).not.toBeNull();
    act(() => dayButton!.click());
    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe('2026-11-28');

    const todayButton = view1.container.querySelector<HTMLButtonElement>('button[aria-label="Today"]');
    expect(todayButton).not.toBeNull();
    act(() => todayButton!.click());
    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe(CALENDAR_SELECTED_TODAY_SENTINEL);

    view1.unmount();

    vi.setSystemTime(new Date(2026, 10, 28, 10, 0, 0)); // Nov 28, 2026

    const view2 = mount(<App />);
    mounted.push(view2.unmount);
    await act(async () => { await Promise.resolve(); });

    expect(view2.container.textContent).toContain('Nov 28 task');
    const selectedDayButton = view2.container.querySelector('button[data-date="2026-11-28"]');
    expect(selectedDayButton?.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps \'today\' stored across a live midnight rollover', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 27, 23, 59, 58));

    const view1 = mount(<App />);
    mounted.push(view1.unmount);
    await act(async () => { await Promise.resolve(); });

    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe(CALENDAR_SELECTED_TODAY_SENTINEL);

    await act(async () => { vi.advanceTimersByTime(3_000); await Promise.resolve(); });

    expect(localStorage.getItem(CALENDAR_SELECTED_DATE_STORAGE_KEY)).toBe(CALENDAR_SELECTED_TODAY_SENTINEL);
    const selectedDayButton = view1.container.querySelector('button[data-date="2026-11-28"]');
    expect(selectedDayButton?.getAttribute('aria-pressed')).toBe('true');
  });
});
