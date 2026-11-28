// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task, TaskInput } from '../../types/task';
import { formatDate } from '../../domain/recurrence';
import { scrollTaskElementIntoView } from '../../domain/scrollTaskIntoView';
import { PREFS_STORAGE_KEY, resetPrefsCache, updatePrefs } from '../../prefs/prefs';

const mockDbState = vi.hoisted(() => ({
  tasks: [] as Task[],
  listeners: new Set<() => void>(),
  nextId: 1,
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
  saveTask: vi.fn(async (taskInput: TaskInput): Promise<Task> => {
    const existingIdx = taskInput.id
      ? mockDbState.tasks.findIndex((t) => t.id === taskInput.id)
      : -1;
    const now = Date.now();
    if (existingIdx >= 0) {
      const prev = mockDbState.tasks[existingIdx];
      const updated: Task = {
        ...prev,
        title: taskInput.title,
        notes: taskInput.notes,
        dueAt: taskInput.dueAt !== undefined ? taskInput.dueAt : prev.dueAt,
        recurrence: taskInput.recurrence !== undefined ? taskInput.recurrence : prev.recurrence,
        updatedAt: now,
      };
      mockDbState.tasks[existingIdx] = updated;
      notifyDbListeners();
      return updated;
    }

    const created: Task = {
      id: `new-task-${mockDbState.nextId++}`,
      title: taskInput.title,
      notes: taskInput.notes,
      dueAt: taskInput.dueAt ?? null,
      recurrence: taskInput.recurrence ?? null,
      completionHistory: taskInput.completionHistory ?? [],
      skippedDates: taskInput.skippedDates ?? [],
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      deletedAt: null,
    };
    mockDbState.tasks.push(created);
    notifyDbListeners();
    return created;
  }),
  reorderTasks: vi.fn(async () => undefined),
  completeTask: vi.fn(async () => null),
  uncompleteTask: vi.fn(async () => null),
  skipTaskOccurrence: vi.fn(async () => null),
  softDeleteTask: vi.fn(async () => undefined),
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
    status: { phase: 'idle', lastSyncedAt: null, lastError: null, dirty: false },
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

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    dueAt: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    recurrence: null,
    completedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

function makeRect(top: number, height: number): DOMRect {
  return {
    top,
    bottom: top + height,
    height,
    left: 0,
    right: 375,
    width: 375,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

function stubMatchMedia(options: { reducedMotion?: boolean } = {}) {
  const { reducedMotion = false } = options;
  return vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query.includes('prefers-reduced-motion') ? reducedMotion : false,
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

function configureScrollContainer(
  container: HTMLElement,
  opts: {
    top?: number;
    clientHeight: number;
    scrollHeight: number;
    scrollTop?: number;
    paddingTop?: string;
    paddingBottom?: string;
    withScrollTo?: boolean;
  }
) {
  const {
    top = 100,
    clientHeight,
    scrollHeight,
    scrollTop = 0,
    paddingTop = '0px',
    paddingBottom = '0px',
    withScrollTo = true,
  } = opts;
  container.style.paddingTop = paddingTop;
  container.style.paddingBottom = paddingBottom;
  Object.defineProperty(container, 'clientHeight', { configurable: true, value: clientHeight });
  Object.defineProperty(container, 'scrollHeight', { configurable: true, value: scrollHeight });
  container.scrollTop = scrollTop;
  container.getBoundingClientRect = vi.fn(() => makeRect(top, clientHeight));

  if (withScrollTo) {
    const scrollToSpy = vi.fn((arg?: ScrollToOptions | number) => {
      if (arg && typeof arg === 'object' && typeof arg.top === 'number') {
        container.scrollTop = arg.top;
      }
    });
    Object.defineProperty(container, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollToSpy,
    });
    return scrollToSpy;
  }

  Object.defineProperty(container, 'scrollTo', {
    configurable: true,
    writable: true,
    value: undefined,
  });
  return null;
}

describe('scrollTaskElementIntoView unit tests', () => {
  beforeEach(() => {
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
    stubMatchMedia({ reducedMotion: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  it('scrolls down to make a task below the viewport visible while preserving paddingBottom clearance', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingBottom: '80px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(520, 60));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 160, behavior: 'smooth' });
  });

  it('stops at the target task without scrolling past it into trailing sections', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1500,
      scrollTop: 0,
      paddingBottom: '24px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(450, 60));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 34, behavior: 'smooth' });
    expect(container.scrollTop).toBe(34);
  });

  it('returns false and does not call scrollTo when the task is already visible above bottom clearance', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingBottom: '80px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(350, 60));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(false);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('scrolls up when the container is scrolled past the task', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 200,
      paddingTop: '8px',
      paddingBottom: '24px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(60, 50));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 152, behavior: 'smooth' });
  });

  it('clamps downward scroll for a task taller than the container so its top remains visible', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 200,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingBottom: '80px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(150, 250));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 50, behavior: 'smooth' });
  });

  it('uses behavior: "auto" when prefers-reduced-motion: reduce matches', () => {
    stubMatchMedia({ reducedMotion: true });

    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    const scrollToSpy = configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingBottom: '80px',
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(520, 60));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 160, behavior: 'auto' });
  });

  it('falls back to setting container.scrollTop directly when scrollTo is not a function', () => {
    const container = document.createElement('div');
    container.setAttribute('data-task-scroll-container', 'true');
    configureScrollContainer(container, {
      top: 100,
      clientHeight: 400,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingBottom: '80px',
      withScrollTo: false,
    });

    const card = document.createElement('div');
    card.getBoundingClientRect = vi.fn(() => makeRect(520, 60));
    container.appendChild(card);
    document.body.appendChild(container);

    const scrolled = scrollTaskElementIntoView(card);
    expect(scrolled).toBe(true);
    expect(container.scrollTop).toBe(160);
  });
});

describe('App scroll new task into view integration', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    resetPrefsCache();
    mockDbState.tasks = [];
    mockDbState.listeners.clear();
    mockDbState.nextId = 1;
    vi.clearAllMocks();
    stubMatchMedia({ reducedMotion: false });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    while (mounted.length > 0) {
      mounted.pop()!();
    }
    localStorage.clear();
    resetPrefsCache();
    document.body.replaceChildren();
  });

  function setTitleInput(container: HTMLElement, value: string) {
    const titleInput = container.querySelector<HTMLTextAreaElement>('#routine_title');
    expect(titleInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(titleInput, value);
      titleInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function stubGeometryForTask(targetTaskId: string) {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement
    ) {
      if (this.hasAttribute('data-task-scroll-container')) {
        return makeRect(200, 300);
      }
      if (this.getAttribute('data-task-id') === targetTaskId) {
        return makeRect(600, 60);
      }
      return makeRect(210, 60);
    });
  }

  function attachScrollerSpy(container: HTMLElement) {
    const scroller = container.querySelector<HTMLElement>('[data-task-scroll-container="true"]');
    expect(scroller).toBeTruthy();
    const scrollToSpy = configureScrollContainer(scroller!, {
      top: 200,
      clientHeight: 300,
      scrollHeight: 1000,
      scrollTop: 0,
      paddingTop: '8px',
      paddingBottom: '80px',
    })!;
    return { scroller: scroller!, scrollToSpy };
  }

  it('scrolls the calendar day list down to reveal a newly-added task when newTaskPosition is bottom', async () => {
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 'existing-1', title: 'Morning walk', dueAt: todayStr }),
    ];
    stubGeometryForTask('new-task-1');

    const view = mount(<App />);
    mounted.push(view.unmount);

    const { scrollToSpy } = attachScrollerSpy(view.container);

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add task"]')!.click();
    });
    setTitleInput(view.container, 'Evening stretch');

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!.click();
    });

    expect(view.container.querySelector('[data-task-id="new-task-1"]')).toBeTruthy();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 240, behavior: 'smooth' });
  });

  it('does not scroll when newTaskPosition is top', async () => {
    updatePrefs({ newTaskPosition: 'top' });
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 'existing-1', title: 'Morning walk', dueAt: todayStr }),
    ];
    stubGeometryForTask('new-task-1');

    const view = mount(<App />);
    mounted.push(view.unmount);

    const { scrollToSpy } = attachScrollerSpy(view.container);

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add task"]')!.click();
    });
    setTitleInput(view.container, 'Top task');

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!.click();
    });

    expect(view.container.querySelector('[data-task-id="new-task-1"]')).toBeTruthy();
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('does not scroll when editing an existing task even if newTaskPosition is bottom', async () => {
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 'existing-1', title: 'Morning walk', dueAt: todayStr }),
    ];
    stubGeometryForTask('existing-1');

    const view = mount(<App />);
    mounted.push(view.unmount);

    const { scrollToSpy } = attachScrollerSpy(view.container);

    const cardButton = view.container.querySelector<HTMLElement>(
      '[data-task-id="existing-1"] [role="button"]'
    );
    expect(cardButton).toBeTruthy();
    act(() => {
      cardButton!.click();
    });

    setTitleInput(view.container, 'Morning walk updated');

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Save routine"]')!.click();
    });

    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('clears pending scroll and does not scroll when adding a task for a different date', async () => {
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 'existing-1', title: 'Today task', dueAt: todayStr }),
    ];
    stubGeometryForTask('new-task-1');

    const view = mount(<App />);
    mounted.push(view.unmount);

    const { scrollToSpy } = attachScrollerSpy(view.container);

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add task"]')!.click();
    });
    setTitleInput(view.container, 'Tomorrow task');

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Date"]')!.click();
    });
    const tomorrowItem = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find(
      (btn) => btn.textContent?.includes('Tomorrow')
    );
    expect(tomorrowItem).toBeTruthy();
    act(() => {
      tomorrowItem!.click();
    });

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!.click();
    });

    expect(view.container.querySelector('[data-task-id="new-task-1"]')).toBeNull();
    expect(scrollToSpy).not.toHaveBeenCalled();

    // Navigating to Tomorrow later should not trigger a stale scroll for new-task-1.
    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    });
    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Next week"]')!.click();
    });
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('expands a collapsed Tasks One-Time group and scrolls to reveal a newly-added undated task', async () => {
    mockDbState.tasks = [
      makeTask({ id: 'undated-1', title: 'Existing undated task', dueAt: null }),
    ];
    stubGeometryForTask('new-task-1');

    const view = mount(<App />);
    mounted.push(view.unmount);

    act(() => {
      view.container
        .querySelector<HTMLButtonElement>('button[aria-label="Switch to Tasks view"]')!
        .click();
    });

    const { scrollToSpy } = attachScrollerSpy(view.container);

    // Collapse the One-Time group before creating the task.
    const oneTimeHeader = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('section[aria-label="One-Time"] button')
    ).find((btn) => btn.textContent?.includes('One-Time'));
    expect(oneTimeHeader).toBeTruthy();
    act(() => {
      oneTimeHeader!.click();
    });
    expect(view.container.querySelector('[data-task-id="undated-1"]')).toBeNull();

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Add task"]')!.click();
    });
    setTitleInput(view.container, 'New bottom undated task');

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!.click();
    });

    expect(view.container.querySelector('[data-task-id="new-task-1"]')).toBeTruthy();
    expect(scrollToSpy).toHaveBeenCalledTimes(1);
    expect(scrollToSpy).toHaveBeenCalledWith({ top: 240, behavior: 'smooth' });
  });
});
