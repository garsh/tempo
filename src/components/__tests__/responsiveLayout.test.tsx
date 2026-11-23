// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INBOX_LIST_ID, type Task } from '../../types/task';
import { formatDate } from '../../domain/recurrence';
import {
  CALENDAR_EXPANDED_STORAGE_KEY,
  readStoredCalendarExpanded,
} from '../../domain/calendarUi';
import {
  MEDIA_COMPACT_LANDSCAPE,
  MEDIA_DESKTOP,
  MEDIA_SPLIT,
  MEDIA_WIDE_DESKTOP,
  computeLayoutMode,
} from '../../hooks/useLayoutMode';

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
    lists: { toArray: vi.fn(async () => []) },
    folders: { toArray: vi.fn(async () => []) },
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
    customLists: 0,
    folders: 0,
  })),
  clearSampleTasks: vi.fn(async () => 0),
  isSampleId: vi.fn(() => false),
  loadSampleTasks: vi.fn(async () => 0),
  repairAndDeduplicateDatabase: vi.fn(async () => ({
    deduplicatedTasks: 0,
    mergedLists: 0,
    purgedTombstones: 0,
  })),
  findImportedCompletedTaskIds: vi.fn(() => []),
  getStorageCleanupPreview: vi.fn(async () => ({
    importedCompletedTasks: 0,
    tombstonedTasks: 0,
    tombstonedLists: 0,
    tombstonedFolders: 0,
    activeRemainingTasks: 0,
  })),
  cleanupImportedAndTombstones: vi.fn(async () => ({
    removedImportedCompleted: 0,
    purgedTasks: 0,
    purgedLists: 0,
    purgedFolders: 0,
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
import { CalendarMonthView } from '../CalendarMonthView';
import { TasksView } from '../TasksView';
import { QuickAddSheet } from '../QuickAddSheet';
import { TaskCard } from '../TaskCard';
import { SettingsPage } from '../settings/SettingsPage';
import { RecurringTasksView } from '../RecurringTasksView';

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
    listId: INBOX_LIST_ID,
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

describe('Desktop & Mobile Landscape Responsive Layouts', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    mockDbState.tasks = [];
    mockDbState.listeners.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    document.body.replaceChildren();
  });

  it('computes all five layout tiers cleanly and keeps 932x430 landscape phones in compact-landscape', () => {
    expect(
      computeLayoutMode({
        split: false,
        compactLandscape: false,
        desktop: false,
        wideDesktop: false,
      })
    ).toEqual({
      tier: 'portrait',
      isSplit: false,
      isCompactLandscape: false,
      isDesktop: false,
      isWideDesktop: false,
    });

    // Phone in landscape (e.g. 932x430): wide enough for split, too short for desktop
    expect(
      computeLayoutMode({
        split: true,
        compactLandscape: true,
        desktop: false,
        wideDesktop: false,
      })
    ).toEqual({
      tier: 'compact-landscape',
      isSplit: true,
      isCompactLandscape: true,
      isDesktop: false,
      isWideDesktop: false,
    });

    expect(
      computeLayoutMode({
        split: true,
        compactLandscape: false,
        desktop: false,
        wideDesktop: false,
      })
    ).toEqual({
      tier: 'medium-split',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: false,
      isWideDesktop: false,
    });

    expect(
      computeLayoutMode({
        split: true,
        compactLandscape: false,
        desktop: true,
        wideDesktop: false,
      })
    ).toEqual({
      tier: 'desktop',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: true,
      isWideDesktop: false,
    });

    expect(
      computeLayoutMode({
        split: true,
        compactLandscape: false,
        desktop: true,
        wideDesktop: true,
      })
    ).toEqual({
      tier: 'wide-desktop',
      isSplit: true,
      isCompactLandscape: false,
      isDesktop: true,
      isWideDesktop: true,
    });
  });

  it('forces CalendarMonthView always expanded without collapse handle when collapsible=false and respects custom rowHeight', () => {
    const view = mount(
      <CalendarMonthView
        tasks={[]}
        year={2026}
        monthIndex={10}
        selectedDateStr="2026-11-23"
        expanded={false}
        collapsible={false}
        rowHeight={42}
        onToggleExpanded={vi.fn()}
        onMonthChange={vi.fn()}
        onSelectDate={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    expect(view.container.querySelector('button[aria-label="Expand calendar"]')).toBeNull();
    expect(view.container.querySelector('button[aria-label="Collapse calendar"]')).toBeNull();

    const dayButtons = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button[data-date]'));
    expect(dayButtons.length).toBe(42);
    expect(dayButtons[0].style.height).toBe('42px');
  });

  it('renders TasksView as two columns when both Recurring and One-Time have tasks and falls back to stacked when one is empty', () => {
    const periodic = makeTask('p-1', 'Replace filter', {
      recurrence: {
        type: 'after_completion',
        intervalValue: 2,
        maxIntervalValue: 4,
        intervalUnit: 'weeks',
      },
    });
    const oneTime = makeTask('o-1', 'Buy lightbulbs');

    const twoColView = mount(
      <TasksView
        periodicTasks={[periodic]}
        oneTimeTasks={[oneTime]}
        showDetails={false}
        collapsedGroups={{}}
        layoutMode="two-column"
        onToggleGroup={vi.fn()}
        onReorderOneTime={vi.fn()}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    mounted.push(twoColView.unmount);

    const twoColRoot = twoColView.container.querySelector('[data-testid="tasks-view"]');
    expect(twoColRoot?.getAttribute('data-layout')).toBe('two-column');
    expect(twoColRoot?.className).toContain('grid-cols-2');

    const singleColView = mount(
      <TasksView
        periodicTasks={[]}
        oneTimeTasks={[oneTime]}
        showDetails={false}
        collapsedGroups={{}}
        layoutMode="two-column"
        onToggleGroup={vi.fn()}
        onReorderOneTime={vi.fn()}
        onSelect={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    mounted.push(singleColView.unmount);

    const singleColRoot = singleColView.container.querySelector('[data-testid="tasks-view"]');
    expect(singleColRoot?.getAttribute('data-layout')).toBe('stacked');
  });

  it('renders QuickAddSheet as a docked drawer without fullscreen inset-0 on long notes, supports Ctrl+Enter save, and exposes Delete', async () => {
    const onSave = vi.fn().mockResolvedValue(true);
    const onRequestDelete = vi.fn();
    const existing = makeTask('t-edit', 'Service furnace', {
      notes: 'Line 1\nLine 2\n' + 'x'.repeat(120),
    });

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        presentation="drawer"
        initialTask={existing}
        onSave={onSave}
        onClose={vi.fn()}
        onRequestDelete={onRequestDelete}
      />
    );
    mounted.push(view.unmount);

    const drawer = view.container.querySelector<HTMLElement>('[data-testid="quick-add-sheet"]');
    expect(drawer).toBeTruthy();
    expect(drawer?.getAttribute('data-presentation')).toBe('drawer');
    expect(drawer?.className).not.toContain('inset-0');

    const deleteBtn = Array.from(drawer!.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Delete')
    );
    expect(deleteBtn).toBeTruthy();
    act(() => {
      deleteBtn!.click();
    });
    expect(onRequestDelete).toHaveBeenCalledWith(existing);

    const desc = drawer!.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]')!;
    await act(async () => {
      desc.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true, cancelable: true })
      );
    });
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ id: 't-edit', title: 'Service furnace' }));
  });

  it('invokes TaskCard hover action buttons without activating row selection', () => {
    const task = makeTask('t-hover', 'Water plants', {
      dueAt: '2026-11-23',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
    });
    const onSelect = vi.fn();
    const onRequestChangeDate = vi.fn();
    const onRequestSkipOccurrence = vi.fn();
    const onRequestDelete = vi.fn();

    const view = mount(
      <TaskCard
        task={task}
        onComplete={vi.fn()}
        onSelect={onSelect}
        onRequestChangeDate={onRequestChangeDate}
        onRequestSkipOccurrence={onRequestSkipOccurrence}
        onRequestDelete={onRequestDelete}
      />
    );
    mounted.push(view.unmount);

    const hoverBox = view.container.querySelector<HTMLElement>('[data-testid="task-hover-actions"]')!;
    expect(hoverBox).toBeTruthy();

    act(() => {
      hoverBox.querySelector<HTMLButtonElement>('[data-hover-action="date"]')!.click();
      hoverBox.querySelector<HTMLButtonElement>('[data-hover-action="skip"]')!.click();
      hoverBox.querySelector<HTMLButtonElement>('[data-hover-action="delete"]')!.click();
    });

    expect(onRequestChangeDate).toHaveBeenCalledTimes(1);
    expect(onRequestSkipOccurrence).toHaveBeenCalledWith(task);
    expect(onRequestDelete).toHaveBeenCalledWith(task);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('renders SettingsPage in 2-pane mode on split/desktop defaulting root to General and switching categories', () => {
    stubMatchMedia((q) => q === MEDIA_SPLIT || q === MEDIA_DESKTOP);

    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="root"
        onClose={vi.fn()}
        tasks={[]}
        syncStatus={{
          phase: 'idle',
          lastSyncedAt: null,
          lastError: null,
          autoSyncEnabled: false,
          account: null,
        }}
        onSyncStatusChange={vi.fn()}
        onShowShortcuts={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    const root = view.container.querySelector('[data-testid="settings-page"]');
    expect(root?.getAttribute('data-settings-layout')).toBe('two-pane');
    expect(root?.getAttribute('data-settings-page')).toBe('general');

    const labels = Array.from(view.container.querySelectorAll('label')).map((l) => l.textContent?.trim());
    expect(labels).toEqual(
      expect.arrayContaining(['Theme', 'New task placement', 'Week starts on', 'Time format', 'Seasons'])
    );
    expect(view.container.querySelectorAll('select')).toHaveLength(5);

    const nav = view.container.querySelector('nav[aria-label="Settings categories"]')!;
    const navButtons = Array.from(nav.querySelectorAll<HTMLButtonElement>('button')).map((b) =>
      b.textContent?.trim()
    );
    expect(navButtons).toEqual(['General', 'Account', 'Backup & Diagnostics']);
    expect(nav.textContent).not.toContain('Help & Feedback');

    const accountBtn = Array.from(nav.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.trim() === 'Account'
    )!;
    act(() => {
      accountBtn.click();
    });

    expect(root?.getAttribute('data-settings-page')).toBe('account');
    expect(view.container.textContent).toContain('Last synced');
    expect(view.container.textContent).not.toContain('Google Drive sync');
    expect(view.container.textContent).not.toContain('Private Drive AppData folder');
    expect(view.container.textContent).not.toContain('Background sync');
  });

  it('supports RecurringTasksView category filter pills and hides Back button when embedded', () => {
    const fixedTask = makeTask('f-1', 'Daily pill', {
      dueAt: '2026-11-23',
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
    });
    const approxTask = makeTask('a-1', 'Clean filter', {
      recurrence: {
        type: 'after_completion',
        intervalValue: 2,
        maxIntervalValue: 3,
        intervalUnit: 'weeks',
      },
    });
    const annualTask = makeTask('y-1', 'Winterize hose', {
      recurrence: {
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [{ startMonth: 10, startDay: 1, endMonth: 11, endDay: 15 }],
      },
    });

    const view = mount(
      <RecurringTasksView
        tasks={[fixedTask, approxTask, annualTask]}
        showDetails={false}
        embedded={true}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    expect(view.container.querySelector('button[aria-label="Back"]')).toBeNull();

    const list = view.container.querySelector('[data-testid="recurring-tasks-view"]')!;
    const titles = () =>
      Array.from(list.querySelectorAll('[data-testid="task-title"]')).map((el) => el.textContent);

    expect(titles()).toHaveLength(3);

    const filterGroup = view.container.querySelector('[role="group"][aria-label="Filter recurring tasks"]')!;
    const clickFilter = (label: string) => {
      const btn = Array.from(filterGroup.querySelectorAll<HTMLButtonElement>('button')).find(
        (b) => b.textContent === label
      )!;
      act(() => btn.click());
    };

    clickFilter('Fixed');
    expect(titles()).toEqual(['Daily pill']);

    clickFilter('Approx');
    expect(titles()).toEqual(['Clean filter']);

    clickFilter('Yearly');
    expect(titles()).toEqual(['Winterize hose']);

    clickFilter('All');
    expect(titles()).toHaveLength(3);
  });

  it('mounts 3-pane dashboard with sidebar on wide-desktop and 2-pane split on compact-landscape without overwriting portrait calendar pref', () => {
    localStorage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, 'week');
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask('d-1', 'Today task', { dueAt: todayStr }),
      makeTask('u-1', 'Undated task'),
    ];

    // 1. Wide Desktop -> 3-pane dashboard + sidebar + docked drawer on capture
    stubMatchMedia((q) => q === MEDIA_SPLIT || q === MEDIA_DESKTOP || q === MEDIA_WIDE_DESKTOP);

    const wideView = mount(<App />);
    mounted.push(wideView.unmount);

    const threePane = wideView.container.querySelector('[data-testid="calendar-three-pane"]');
    expect(wideView.container.querySelector('[data-testid="desktop-sidebar"]')).toBeTruthy();
    expect(threePane).toBeTruthy();
    const todayPane = threePane!.querySelector('section[aria-label="Selected day tasks"]');
    const tasksPane = threePane!.querySelector('section[aria-label="Off-calendar tasks"]');
    expect(todayPane).toBeTruthy();
    expect(tasksPane).toBeTruthy();
    for (const pane of [todayPane!, tasksPane!]) {
      expect(pane.className).toContain('flex-1');
      expect(pane.className).toContain('min-w-0');
      expect(pane.className).not.toContain('max-w-');
    }
    expect(wideView.container.textContent).toContain('Today task');
    expect(wideView.container.textContent).toContain('Undated task');
    // Portrait preference remains 'week' (false)
    expect(readStoredCalendarExpanded()).toBe(false);

    // Clicking New Task opens docked drawer
    const newTaskBtn = wideView.container.querySelector<HTMLButtonElement>('button[aria-label="New task"]')!;
    act(() => {
      newTaskBtn.click();
    });
    expect(
      wideView.container
        .querySelector('[data-testid="quick-add-sheet"]')
        ?.getAttribute('data-presentation')
    ).toBe('drawer');

    wideView.unmount();

    // 2. Compact Landscape -> 2-pane split without sidebar
    vi.restoreAllMocks();
    stubMatchMedia((q) => q === MEDIA_SPLIT || q === MEDIA_COMPACT_LANDSCAPE);

    const landscapeView = mount(<App />);
    mounted.push(landscapeView.unmount);

    expect(landscapeView.container.querySelector('[data-testid="desktop-sidebar"]')).toBeNull();
    expect(landscapeView.container.querySelector('[data-testid="calendar-split-pane"]')).toBeTruthy();
    expect(readStoredCalendarExpanded()).toBe(false);
  });
});
