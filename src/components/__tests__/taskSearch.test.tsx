// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { INBOX_LIST_ID, type Task } from '../../types/task';
import { formatDate } from '../../domain/recurrence';

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
import { TaskSearchView } from '../search/TaskSearchView';
import { completeTask } from '../../db/db';

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

function makeTask(overrides: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    dueAt: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    recurrence: null,
    ...overrides,
  };
}

function setInputValue(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('TaskSearchView & App Search integration', () => {
  const mounted: Array<() => void> = [];

  beforeEach(() => {
    localStorage.clear();
    mockDbState.tasks = [];
    mockDbState.listeners.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
    while (mounted.length > 0) {
      mounted.pop()!();
    }
  });

  it('opens via OverflowMenu, focuses the search input, unmounts calendar controls, and restores focus to More on Back', async () => {
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 't1', title: 'Buy milk', dueAt: todayStr }),
    ];

    const view = mount(<App />);
    mounted.push(view.unmount);

    const moreBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="More options"]')!;
    expect(moreBtn).toBeTruthy();

    act(() => {
      moreBtn.click();
    });

    const searchMenuItem = Array.from(
      view.container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')
    ).find((b) => b.textContent?.includes('Search'));
    expect(searchMenuItem).toBeTruthy();

    act(() => {
      searchMenuItem!.click();
    });

    const input = view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]');
    expect(input).toBeTruthy();
    expect(document.activeElement).toBe(input);
    expect(view.container.querySelector('button[aria-label="Choose month and year"]')).toBeNull();

    const closeBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Close search"]')!;
    act(() => {
      closeBtn.click();
    });

    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();
    const restoredMoreBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="More options"]');
    expect(restoredMoreBtn).toBeTruthy();
    expect(document.activeElement).toBe(restoredMoreBtn);
  });

  it('opens via / shortcut and ignores / when QuickAddSheet, OverflowMenu, or DeleteConfirmDialog is open', () => {
    mockDbState.tasks = [
      makeTask({ id: 't1', title: 'Alpha task', dueAt: formatDate(new Date()) }),
    ];

    const view = mount(<App />);
    mounted.push(view.unmount);

    // Open Quick Add with 'n', then press '/' -> should not open Search
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'n', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).toBeTruthy();

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();

    // Close Quick Add via Escape
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).toBeNull();

    // Open OverflowMenu, then press '/' -> should not open Search
    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="More options"]')!.click();
    });
    expect(view.container.querySelector('[data-testid="overflow-menu-layer"]')).toBeTruthy();
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();

    // Close OverflowMenu via Escape, then press '/' -> opens Search
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeTruthy();
  });

  it('supports two-step Escape and lets DeleteConfirmDialog close without clearing the search query', () => {
    const todayStr = formatDate(new Date());
    mockDbState.tasks = [
      makeTask({ id: 't1', title: 'Garage cleanup', dueAt: todayStr }),
    ];

    const view = mount(<App />);
    mounted.push(view.unmount);

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    const input = view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!;
    setInputValue(input, 'garage');

    // Open DeleteConfirmDialog via swipe Delete button
    const swipeDeleteBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Delete"]')!;
    act(() => {
      swipeDeleteBtn.click();
    });
    expect(view.container.querySelector('#delete-dialog-title')).toBeTruthy();

    // Escape closes only DeleteConfirmDialog; query remains intact
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(view.container.querySelector('#delete-dialog-title')).toBeNull();
    expect(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!.value).toBe('garage');

    // First Escape clears query
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!.value).toBe('');
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeTruthy();

    // Second Escape closes search and restores focus to More options
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();
    expect(document.activeElement).toBe(
      view.container.querySelector('button[aria-label="More options"]')
    );
  });

  it('jumps to dated active and completed tasks (expanding Completed group) and opens QuickAdd for undated tasks', () => {
    const activeTargetDate = '2026-12-04';
    const doneTargetDate = '2026-10-12';
    mockDbState.tasks = [
      makeTask({ id: 'a1', title: 'Dentist appointment', dueAt: activeTargetDate }),
      makeTask({
        id: 'c1',
        title: 'Dentist billing',
        dueAt: doneTargetDate,
        completedAt: 5000,
        completionHistory: [5000],
      }),
      makeTask({ id: 'u1', title: 'Dentist insurance undated', dueAt: null }),
    ];

    const view = mount(<App />);
    mounted.push(view.unmount);

    // 1. Click dated active match -> jumps calendar to 2026-12-04
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    setInputValue(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!, 'dentist');

    const activeCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="search-results"] [role="button"]')).find(
      (el) => el.textContent?.includes('Dentist appointment')
    )!;
    act(() => {
      activeCard.click();
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();
    const selectedCell = view.container.querySelector<HTMLButtonElement>('button[data-date="2026-12-04"]');
    expect(selectedCell?.querySelector('span')?.className).toContain('bg-tt-blue');
    expect(view.container.textContent).toContain('Dentist appointment');

    // 2. Navigate to 2026-10-12 and collapse Completed, then jump from Search -> auto-expands Completed
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    setInputValue(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!, 'billing');
    const firstCompletedJump = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="search-results"] [role="button"]')).find(
      (el) => el.textContent?.includes('Dentist billing')
    )!;
    act(() => {
      firstCompletedJump.click();
    });
    const completedToggle = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find(
      (b) => b.textContent?.includes('Completed')
    )!;
    act(() => {
      completedToggle.click();
    });
    expect(view.container.textContent).not.toContain('Dentist billing');

    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    setInputValue(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!, 'dentist');

    const completedCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="search-results"] [role="button"]')).find(
      (el) => el.textContent?.includes('Dentist billing')
    )!;
    act(() => {
      completedCard.click();
    });
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeNull();
    expect(
      view.container.querySelector<HTMLButtonElement>('button[data-date="2026-10-12"]')?.querySelector('span')?.className
    ).toContain('bg-tt-blue');
    expect(view.container.textContent).toContain('Dentist billing');

    // 3. Click undated match -> opens QuickAddSheet while remaining in Search
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
    });
    setInputValue(view.container.querySelector<HTMLInputElement>('[data-testid="search-tasks-input"]')!, 'insurance');
    const undatedCard = Array.from(view.container.querySelectorAll<HTMLElement>('[data-testid="search-results"] [role="button"]')).find(
      (el) => el.textContent?.includes('Dentist insurance undated')
    )!;
    act(() => {
      undatedCard.click();
    });
    expect(view.container.querySelector('[data-testid="quick-add-sheet"]')).toBeTruthy();
    expect(view.container.querySelector('[data-testid="search-tasks-input"]')).toBeTruthy();
  });

  it('restores day-list scrollTop and re-arms calendar pull-to-expand touch listeners after closing Search', () => {
    const matchMediaSpy = vi.spyOn(window, 'matchMedia').mockImplementation(
      (query: string) =>
        ({
          matches: false,
          media: query,
          onchange: null,
          addListener: vi.fn(),
          removeListener: vi.fn(),
          addEventListener: vi.fn(),
          removeEventListener: vi.fn(),
          dispatchEvent: vi.fn(),
        }) as unknown as MediaQueryList
    );
    try {
      const todayStr = formatDate(new Date());
      mockDbState.tasks = Array.from({ length: 12 }, (_, idx) =>
        makeTask({ id: `t-${idx}`, title: `Routine ${idx}`, dueAt: todayStr })
      );

      const view = mount(<App />);
      mounted.push(view.unmount);

      const getScrollBox = () =>
        Array.from(view.container.querySelectorAll<HTMLDivElement>('div')).find(
          (el) => el.className.includes('overflow-y-auto') && el.className.includes('border-t')
        )!;

      const initialScroller = getScrollBox();
      expect(initialScroller).toBeTruthy();
      initialScroller.scrollTop = 180;

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true }));
      });
      act(() => {
        view.container.querySelector<HTMLButtonElement>('button[aria-label="Close search"]')!.click();
      });

      const restoredScroller = getScrollBox();
      expect(restoredScroller.scrollTop).toBe(180);

      // Reset to top so pull-to-expand gesture classifies as 'drag' rather than scroll
      restoredScroller.scrollTop = 0;

      // Verify pull-to-expand touch listener re-attached to the remounted calAreaRef
      const calArea = restoredScroller.parentElement!.parentElement!;
      const startEv = new Event('touchstart', { bubbles: true }) as unknown as TouchEvent;
      Object.defineProperty(startEv, 'touches', { value: [{ clientX: 50, clientY: 100 }] });
      const moveEv = new Event('touchmove', { bubbles: true, cancelable: true }) as unknown as TouchEvent;
      Object.defineProperty(moveEv, 'touches', { value: [{ clientX: 50, clientY: 160 }] });

      act(() => {
        calArea.dispatchEvent(startEv);
        calArea.dispatchEvent(moveEv);
      });
      expect(moveEv.defaultPrevented).toBe(true);
    } finally {
      matchMediaSpy.mockRestore();
    }
  });

  it('renders highlights, single-line notes snippets, keyboard arrow/IME-safe Enter, and ended recurring disabled controls', () => {
    vi.useFakeTimers();
    const todayStr = formatDate(new Date());
    const onJumpToDate = vi.fn();
    const onEdit = vi.fn();

    const activeRec = makeTask({
      id: 'rec-active',
      title: 'Filter furnace check',
      notes: 'First detail line\nBuy 16x25x1 filter pack',
      startDate: todayStr,
      dueAt: todayStr,
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
    });
    const endedRec = makeTask({
      id: 'rec-ended',
      title: 'Filter seasonal ended',
      startDate: '2026-01-01',
      dueAt: '2026-01-01',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        endAfterCount: 1,
      },
      completionHistory: [new Date(2026, 0, 1, 9, 0, 0).getTime()],
    });

    let query = 'filter';
    const view = mount(
      <TaskSearchView
        tasks={[activeRec, endedRec]}
        query={query}
        onQueryChange={(next) => {
          query = next;
        }}
        onClose={vi.fn()}
        showDetails={true}
        onJumpToDate={onJumpToDate}
        onComplete={(id, d) => void completeTask(id, d)}
        onUncomplete={vi.fn()}
        onEdit={onEdit}
        onDelete={vi.fn()}
        onRequestChangeDate={vi.fn()}
        onRequestSkipOccurrence={vi.fn()}
        onRequestDelete={vi.fn()}
      />
    );
    mounted.push(view.unmount);

    // Highlighted <mark> elements exist
    const marks = view.container.querySelectorAll('mark.tt-search-mark');
    expect(marks.length).toBeGreaterThanOrEqual(2);

    // Notes snippet replaced showDetails line (only one notes preview element on the row)
    const previews = view.container.querySelectorAll('[data-testid="task-notes-preview"]');
    expect(previews.length).toBe(1);
    expect(previews[0].textContent).toContain('16x25x1 filter pack');

    // Ended recurring task has disabled checkbox and disabled Skip swipe action
    const cards = Array.from(
      view.container.querySelectorAll<HTMLDivElement>('[data-testid="search-results"] [data-testid="task-card"]')
    );
    const endedCard = cards.find((c) => c.textContent?.includes('Filter seasonal ended'))!;
    const endedCheckbox = endedCard.querySelector<HTMLButtonElement>('button[title="Mark incomplete"]');
    const endedSkip = endedCard.querySelector<HTMLButtonElement>('button[aria-label="Skip Occurrence"]');
    expect(endedCheckbox?.disabled).toBe(true);
    expect(endedSkip?.disabled).toBe(true);

    // Completing active recurring task passes projected dateStr
    const activeCard = cards.find((c) => c.textContent?.includes('Filter furnace check'))!;
    const activeCheckbox = activeCard.querySelector<HTMLButtonElement>(
      'button[title="Complete this occurrence"]'
    )!;
    act(() => {
      activeCheckbox.click();
    });
    expect(completeTask).toHaveBeenCalledWith('rec-active', todayStr);

    // IME composition Enter does not activate a row
    const input = view.container.querySelector<HTMLInputElement>('input[type="search"]')!;
    act(() => {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true })
      );
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', keyCode: 229, bubbles: true })
      );
    });
    expect(onJumpToDate).not.toHaveBeenCalled();

    // ArrowDown twice selects the second row (endedRec), Enter jumps to its latest completion date
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
    });
    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onJumpToDate).toHaveBeenCalledWith('2026-01-01', true);

    // Live region announces count after 350ms debounce
    expect(view.container.querySelector('[data-testid="search-status"]')?.textContent).toBe('');
    act(() => {
      vi.advanceTimersByTime(400);
    });
    expect(view.container.querySelector('[data-testid="search-status"]')?.textContent).toBe(
      '2 tasks found'
    );
  });
});
