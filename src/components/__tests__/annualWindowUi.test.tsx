// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from '../QuickAddSheet';
import { RecurringTasksView } from '../RecurringTasksView';
import { SettingsPage } from '../settings/SettingsPage';
import { INBOX_LIST_ID, type Task } from '../../types/task';
import { PREFS_STORAGE_KEY, resetPrefsCache } from '../../prefs/prefs';

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

function openRepeatChoice(
  container: HTMLElement,
  label: 'On fixed interval' | 'Approximately' | 'Time of year' | 'No repeat'
) {
  const btn = container.querySelector<HTMLButtonElement>('button[aria-label="Repeat"]');
  expect(btn).toBeTruthy();
  act(() => {
    btn!.click();
  });
  const menu = container.querySelector('#repeat-choice-menu');
  expect(menu).toBeTruthy();
  const option = Array.from(
    menu!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')
  ).find((el) => el.textContent?.includes(label));
  expect(option).toBeTruthy();
  act(() => {
    option!.click();
  });
}

function setTitle(container: HTMLElement, value: string) {
  const titleInput = container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]');
  expect(titleInput).toBeTruthy();
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(titleInput, value);
    titleInput!.dispatchEvent(new Event('input', { bubbles: true }));
    titleInput!.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

beforeEach(() => {
  localStorage.clear();
  localStorage.removeItem(PREFS_STORAGE_KEY);
  resetPrefsCache();
});

afterEach(() => {
  vi.useRealTimers();
  localStorage.removeItem(PREFS_STORAGE_KEY);
  resetPrefsCache();
  document.body.replaceChildren();
});

describe('Annual time-of-year UI', () => {
  it('creates an annual_window task via Time of year menu, season presets, and month/day selectors', async () => {
    const onSave = vi.fn();
    const view = mount(
      <QuickAddSheet isOpen={true} onSave={onSave} onClose={vi.fn()} defaultDueAt="2026-11-22" />
    );

    setTitle(view.container, 'Winterize outdoor faucets');
    openRepeatChoice(view.container, 'Time of year');

    // Toolbar Repeat chip shows Yearly and date chip becomes Last done: Not done yet
    expect(view.container.querySelector('button[aria-label="Repeat"]')?.textContent).toContain('Yearly');
    expect(view.container.querySelector('button[aria-label="Last done"]')?.textContent).toContain(
      'Not done yet'
    );

    // Quick season preset: Spring
    const springBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('fieldset button')).find(
      (b) => b.textContent === 'Spring'
    )!;
    act(() => {
      springBtn.click();
    });
    expect(springBtn.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toContain(
      'Every Mar–May'
    );

    // Quick season preset: Winter spans New Year
    const winterBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('fieldset button')).find(
      (b) => b.textContent === 'Winter'
    )!;
    act(() => {
      winterBtn.click();
    });
    expect(winterBtn.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toContain(
      'Every Dec–Feb (spans New Year)'
    );

    // Smart whole-month change when starting from a single full month (switch to Oct 1 -> Oct 31, then Nov 1 -> Nov 30? First pick Oct then narrow)
    const startMonth = view.container.querySelector<HTMLSelectElement>('#annual-start-month')!;
    const startDay = view.container.querySelector<HTMLSelectElement>('#annual-start-day')!;
    const endMonth = view.container.querySelector<HTMLSelectElement>('#annual-end-month')!;
    const endDay = view.container.querySelector<HTMLSelectElement>('#annual-end-day')!;

    act(() => {
      startMonth.value = '10';
      startMonth.dispatchEvent(new Event('change', { bubbles: true }));
      startDay.value = '1';
      startDay.dispatchEvent(new Event('change', { bubbles: true }));
      endMonth.value = '10';
      endMonth.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(endDay.value).toBe('31');
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toBe(
      'Every October'
    );

    // Changing startMonth when currently a single full month automatically moves endMonth/endDay to match
    act(() => {
      startMonth.value = '9';
      startMonth.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(endMonth.value).toBe('9');
    expect(endDay.value).toBe('30');
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toBe(
      'Every September'
    );

    // Custom Oct 15 - Nov 15
    act(() => {
      startMonth.value = '10';
      startMonth.dispatchEvent(new Event('change', { bubbles: true }));
      startDay.value = '15';
      startDay.dispatchEvent(new Event('change', { bubbles: true }));
      endMonth.value = '11';
      endMonth.dispatchEvent(new Event('change', { bubbles: true }));
      endDay.value = '15';
      endDay.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toBe(
      'Every Oct 15 – Nov 15'
    );

    const createBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!;
    await act(async () => {
      createBtn.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.dueAt).toBeNull();
    expect(saved.recurrence).toEqual({
      type: 'annual_window',
      intervalValue: 1,
      intervalUnit: 'years',
      annualWindows: [{ startMonth: 10, startDay: 15, endMonth: 11, endDay: 15 }],
      endOnDate: null,
    });

    view.unmount();
  });

  it('hydrates an existing annual_window task on edit', () => {
    const existing: Task = {
      id: 'ann-edit',
      title: 'File taxes',
      listId: INBOX_LIST_ID,
      dueAt: null,
      startDate: null,
      recurrence: {
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [{ startMonth: 2, startDay: 1, endMonth: 4, endDay: 15 }],
        endOnDate: '2030-05-01',
      },
      completionHistory: [new Date(2026, 3, 2, 12, 0).getTime()],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const view = mount(
      <QuickAddSheet isOpen={true} initialTask={existing} onSave={vi.fn()} onClose={vi.fn()} />
    );

    expect(view.container.querySelector('button[aria-label="Repeat"]')?.textContent).toContain('Yearly');
    expect(view.container.querySelector<HTMLSelectElement>('#annual-start-month')?.value).toBe('2');
    expect(view.container.querySelector<HTMLSelectElement>('#annual-start-day')?.value).toBe('1');
    expect(view.container.querySelector<HTMLSelectElement>('#annual-end-month')?.value).toBe('4');
    expect(view.container.querySelector<HTMLSelectElement>('#annual-end-day')?.value).toBe('15');
    expect(view.container.querySelector<HTMLInputElement>('#end-on-date-input')?.value).toBe('2030-05-01');
    expect(view.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toBe(
      'Every Feb 1 – Apr 15'
    );

    view.unmount();
  });

  it('renders active annual_window tasks with countdown subtitles in RecurringTasksView and excludes stopped annual tasks', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 15, 12, 0));

    const activeAnnual: Task = {
      id: 'ann-1',
      title: 'Winterize faucets',
      listId: INBOX_LIST_ID,
      dueAt: null,
      startDate: null,
      recurrence: {
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [{ startMonth: 10, startDay: 1, endMonth: 10, endDay: 31 }],
      },
      completionHistory: [],
      createdAt: new Date(2026, 0, 1).getTime(),
      updatedAt: 1000,
    };

    const stoppedAnnual: Task = {
      id: 'ann-2',
      title: 'Retired spring routine',
      listId: INBOX_LIST_ID,
      dueAt: null,
      startDate: null,
      recurrence: {
        type: 'annual_window',
        intervalValue: 1,
        intervalUnit: 'years',
        annualWindows: [{ startMonth: 3, startDay: 1, endMonth: 5, endDay: 31 }],
        endOnDate: '2026-06-01',
      },
      completionHistory: [],
      createdAt: new Date(2026, 0, 1).getTime(),
      updatedAt: 1000,
    };

    const view = mount(
      <RecurringTasksView
        tasks={[activeAnnual, stoppedAnnual]}
        showDetails={false}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const list = view.container.querySelector('[data-testid="recurring-tasks-view"]')!;
    expect(list.querySelector('section[aria-label="Time of Year"]')).toBeNull();
    expect(list.textContent).toContain('Winterize faucets');
    expect(list.textContent).toContain('16 days left · October');
    expect(list.textContent).not.toContain('Retired spring routine');

    view.unmount();
  });

  it('switches Hemisphere in SettingsPage Date & Time and updates quick season presets', () => {
    const settingsView = mount(
      <SettingsPage
        isOpen={true}
        initialPage="datetime"
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

    const group = settingsView.container.querySelector('[role="radiogroup"][aria-label="Seasons"]');
    expect(group).toBeTruthy();
    const southernBtn = Array.from(group!.querySelectorAll<HTMLButtonElement>('[role="radio"]')).find(
      (b) => b.textContent?.includes('Southern hemisphere')
    )!;
    act(() => {
      southernBtn.click();
    });
    expect(southernBtn.getAttribute('aria-checked')).toBe('true');
    settingsView.unmount();

    const quickAdd = mount(<QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={vi.fn()} />);
    openRepeatChoice(quickAdd.container, 'Time of year');
    const buttons = Array.from(quickAdd.container.querySelectorAll<HTMLButtonElement>('fieldset button'));
    expect(buttons.map((b) => b.textContent)).toEqual(['Spring', 'Summer', 'Autumn', 'Winter']);

    act(() => {
      buttons[0].click();
    });
    expect(quickAdd.container.querySelector('[data-testid="annual-window-preview"]')?.textContent).toBe(
      'Every Sep–Nov'
    );
    quickAdd.unmount();
  });
});
