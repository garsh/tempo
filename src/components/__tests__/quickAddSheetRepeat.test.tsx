// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from '../QuickAddSheet';
import { INBOX_LIST_ID, type Task } from '../../types/task';

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

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

function openRepeatChoice(container: HTMLElement, label: 'On fixed interval' | 'Approximately' | 'No repeat') {
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

describe('QuickAddSheet recurrence UI', () => {
  it('Repeat button starts greyed out, opens RepeatChoiceMenu, and opens Fixed panel cleanly', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const repeatToolbarBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Repeat"]'
    );
    expect(repeatToolbarBtn).toBeTruthy();
    expect(repeatToolbarBtn!.textContent?.trim()).toBe('Repeat');

    // Initially muted on surface without active highlight
    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('false');
    expect(repeatToolbarBtn!.className).toContain('bg-tt-surface');
    expect(repeatToolbarBtn!.className).toContain('text-tt-secondary');

    // Tap Repeat toolbar button: opens RepeatChoiceMenu with On fixed interval / Approximately
    act(() => {
      repeatToolbarBtn!.click();
    });
    const choiceMenu = view.container.querySelector('#repeat-choice-menu');
    expect(choiceMenu).toBeTruthy();
    expect(choiceMenu!.textContent).toContain('On fixed interval');
    expect(choiceMenu!.textContent).toContain('Approximately');
    expect(choiceMenu!.textContent).not.toContain('No repeat');

    // Choose On fixed interval
    const fixedBtn = Array.from(choiceMenu!.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find(
      (b) => b.textContent?.includes('On fixed interval')
    );
    act(() => {
      fixedBtn!.click();
    });

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('true');
    expect(repeatToolbarBtn!.className).toContain('bg-tt-blue');
    expect(repeatToolbarBtn!.className).toContain('text-white');
    expect(repeatToolbarBtn!.textContent?.trim()).toBe('Fixed');

    const intervalInput = view.container.querySelector<HTMLInputElement>('#repeat-interval-input');
    expect(intervalInput).toBeTruthy();
    expect(intervalInput!.value).toBe('1');

    const unitSelect = view.container.querySelector<HTMLSelectElement>('#repeat-unit-select');
    expect(unitSelect).toBeTruthy();
    expect(unitSelect!.value).toBe('days');
    expect(Array.from(unitSelect!.options).map((o) => o.value)).toEqual([
      'days',
      'weeks',
      'months',
      'years',
    ]);

    // Recurrence Logic dropdown was removed under S2
    expect(view.container.querySelector('#recurrence-logic-select')).toBeNull();

    const endModeSelect = view.container.querySelector<HTMLSelectElement>('#end-mode-select');
    expect(endModeSelect).toBeTruthy();
    expect(endModeSelect!.value).toBe('never');

    view.unmount();
  });

  it('toggles recurrence off via RepeatChoiceMenu No repeat without rendering a Remove repeat button', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const repeatToolbarBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Repeat"]'
    );
    openRepeatChoice(view.container, 'On fixed interval');

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('#repeat-interval-input')).toBeTruthy();

    const removeRepeatBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remove repeat')
    );
    expect(removeRepeatBtn).toBeUndefined();

    // Tap Repeat again while panel is open -> RepeatChoiceMenu -> No repeat
    openRepeatChoice(view.container, 'No repeat');

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('false');
    expect(repeatToolbarBtn!.className).toContain('bg-tt-surface');
    expect(view.container.querySelector('#repeat-interval-input')).toBeNull();

    view.unmount();
  });

  it('opens the recurring section automatically when editing an existing recurring task', () => {
    const existingFixedTask: Task = {
      id: 'rec-fixed-1',
      title: 'Water plants',
      listId: INBOX_LIST_ID,
      dueAt: '2026-05-20',
      startDate: '2026-05-01',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 3,
        intervalUnit: 'days',
      },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        initialTask={existingFixedTask}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />
    );

    const repeatInput = view.container.querySelector<HTMLInputElement>('#repeat-interval-input');
    expect(repeatInput).toBeTruthy();
    expect(repeatInput!.value).toBe('3');
    view.unmount();
  });

  it('configures On fixed interval with weekdays and endAfterCount', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={onClose}
      />
    );

    const titleInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(titleInput, 'Gym workout');
      titleInput!.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    openRepeatChoice(view.container, 'On fixed interval');

    // Tapping Mon/Wed/Fri while on 1 Day auto-switches unit to weeks
    const weekdayBtns = Array.from(view.container.querySelectorAll('button')).filter((b) =>
      ['Mon', 'Wed', 'Fri'].includes(b.textContent?.trim() || '')
    );
    expect(weekdayBtns.length).toBe(3);
    act(() => {
      weekdayBtns.forEach((btn) => btn.click());
    });

    const unitSelect = view.container.querySelector<HTMLSelectElement>('#repeat-unit-select');
    expect(unitSelect!.value).toBe('weeks');

    const endModeSelect = view.container.querySelector<HTMLSelectElement>('#end-mode-select');
    act(() => {
      endModeSelect!.value = 'after_count';
      endModeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const endCountInput = view.container.querySelector<HTMLInputElement>('#end-after-count-input');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(endCountInput, '10');
      endCountInput!.dispatchEvent(new Event('input', { bubbles: true }));
      endCountInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const createBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]');
    await act(async () => {
      createBtn!.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedTask = onSave.mock.calls[0][0];
    expect(savedTask.title).toBe('Gym workout');
    expect(savedTask.recurrence).toEqual({
      type: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      weekdays: [1, 3, 5],
      monthDay: undefined,
      endOnDate: null,
      endAfterCount: 10,
    });

    view.unmount();
  });

  it('configures Approximately with min/max window, clears due date, and supports optional endOnDate', async () => {
    const onSave = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={vi.fn()}
        defaultDueAt={null}
      />
    );

    const titleInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(titleInput, 'Mow lawn');
      titleInput!.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    openRepeatChoice(view.container, 'Approximately');
    expect(view.container.querySelector('button[aria-label="Last done"]')?.textContent).toContain('Not done yet');

    const minInput = view.container.querySelector<HTMLInputElement>('#repeat-min-input')!;
    const maxInput = view.container.querySelector<HTMLInputElement>('#repeat-max-input')!;
    const unitSelect = view.container.querySelector<HTMLSelectElement>('#repeat-unit-select')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(minInput, '7');
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
      setter?.call(maxInput, '10');
      maxInput.dispatchEvent(new Event('input', { bubbles: true }));
      unitSelect.value = 'days';
      unitSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const endModeSelect = view.container.querySelector<HTMLSelectElement>('#end-mode-select')!;
    act(() => {
      endModeSelect.value = 'on_date';
      endModeSelect.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const endDateInput = view.container.querySelector<HTMLInputElement>('#end-on-date-input')!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(endDateInput, '2026-10-31');
      endDateInput.dispatchEvent(new Event('input', { bubbles: true }));
      endDateInput.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const createBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!;
    await act(async () => {
      createBtn.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const saved = onSave.mock.calls[0][0];
    expect(saved.dueAt).toBeNull();
    expect(saved.recurrence).toEqual({
      type: 'after_completion',
      intervalValue: 7,
      maxIntervalValue: 10,
      intervalUnit: 'days',
      endOnDate: '2026-10-31',
    });

    view.unmount();
  });

  it('preserves unsaved title and notes when defaultDueAt changes while open for a new routine (Item K)', () => {
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        defaultDueAt="2026-11-23"
      />
    );

    const titleInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]')!;
    const notesInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]')!;
    act(() => {
      const setTA = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setTA?.call(titleInput, 'Unsaved draft title');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      setTA?.call(notesInput, 'Unsaved draft notes');
      notesInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Selecting another day on the calendar updates defaultDueAt while drawer stays open
    view.rerender(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        defaultDueAt="2026-11-28"
      />
    );

    expect(titleInput.value).toBe('Unsaved draft title');
    expect(notesInput.value).toBe('Unsaved draft notes');

    view.unmount();
  });

  it('preserves unsaved edits across midnight roll-over while updating maxDate to the new day (Item K)', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 23, 59, 55, 0));

    const existing: Task = {
      id: 'approx-1',
      title: 'Water plants',
      notes: 'Original note',
      listId: INBOX_LIST_ID,
      createdAt: 1000,
      updatedAt: 1000,
      dueAt: null,
      completionHistory: [],
      recurrence: {
        type: 'after_completion',
        intervalValue: 5,
        maxIntervalValue: 7,
        intervalUnit: 'days',
      },
    };

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        initialTask={existing}
        defaultDueAt="2026-11-23"
        onLogCompletionDate={vi.fn()}
      />
    );

    const titleInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]')!;
    const minInput = view.container.querySelector<HTMLInputElement>('#repeat-min-input')!;
    const logInputBefore = view.container.querySelector<HTMLInputElement>('input[aria-label="Log past completion date"]')!;
    expect(logInputBefore.max).toBe('2026-11-23');

    act(() => {
      const setTA = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setTA?.call(titleInput, 'Water indoor plants');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
      const setInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setInput?.call(minInput, '6');
      minInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // Cross midnight and also change defaultDueAt
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    view.rerender(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        initialTask={existing}
        defaultDueAt="2026-11-24"
        onLogCompletionDate={vi.fn()}
      />
    );

    expect(titleInput.value).toBe('Water indoor plants');
    expect(minInput.value).toBe('6');
    const logInputAfter = view.container.querySelector<HTMLInputElement>('input[aria-label="Log past completion date"]')!;
    expect(logInputAfter.max).toBe('2026-11-24');

    view.unmount();
  });

  it('treats a Share-to-Tempo draft without an id as a new routine using defaultDueAt (Item N)', async () => {
    const onSave = vi.fn();
    const sharedDraft = {
      title: 'Shared article',
      notes: 'https://example.com',
    } as Task;

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={vi.fn()}
        initialTask={sharedDraft}
        defaultDueAt="2026-11-23"
        onRequestDelete={vi.fn()}
      />
    );

    expect(view.container.textContent).toContain('New Routine');
    expect(view.container.textContent).not.toContain('Edit Routine');
    expect(view.container.querySelector('button[aria-label="Delete routine"]')).toBeNull();
    const createBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!;
    expect(createBtn).not.toBeNull();
    expect(createBtn.textContent).toContain('Create');

    await act(async () => {
      createBtn.click();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Shared article',
        notes: 'https://example.com',
        dueAt: '2026-11-23',
      })
    );

    view.unmount();
  });

  it('ignores Enter during IME composition (isComposing or keyCode 229) and submits on normal Enter (Item N)', async () => {
    const onSave = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={vi.fn()}
        defaultDueAt="2026-11-23"
      />
    );

    const titleInput = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]')!;
    act(() => {
      const setTA = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setTA?.call(titleInput, 'Japanese IME title');
      titleInput.dispatchEvent(new Event('input', { bubbles: true }));
    });

    act(() => {
      titleInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', isComposing: true, bubbles: true, cancelable: true })
      );
      const key229 = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      Object.defineProperty(key229, 'keyCode', { value: 229 });
      titleInput.dispatchEvent(key229);
    });
    expect(onSave).not.toHaveBeenCalled();

    await act(async () => {
      titleInput.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true })
      );
    });
    expect(onSave).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('shows a Delete button in mobile sheet headers when editing an existing routine (Item T)', () => {
    const onRequestDelete = vi.fn();
    const existing: Task = {
      id: 'edit-mobile-1',
      title: 'Water ferns',
      listId: INBOX_LIST_ID,
      dueAt: '2026-11-23',
      recurrence: null,
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const compactView = mount(
      <QuickAddSheet
        isOpen={true}
        presentation="sheet"
        onSave={vi.fn()}
        onClose={vi.fn()}
        initialTask={existing}
        onRequestDelete={onRequestDelete}
      />
    );
    const compactDel = compactView.container.querySelector<HTMLButtonElement>('button[aria-label="Delete routine"]')!;
    expect(compactDel).not.toBeNull();
    act(() => compactDel.click());
    expect(onRequestDelete).toHaveBeenCalledWith(existing);
    compactView.unmount();

    const expandedView = mount(
      <QuickAddSheet
        isOpen={true}
        presentation="sheet"
        onSave={vi.fn()}
        onClose={vi.fn()}
        initialTask={{ ...existing, notes: 'Line 1\nLine 2' }}
        onRequestDelete={onRequestDelete}
      />
    );
    const expandedDel = expandedView.container.querySelector<HTMLButtonElement>('button[aria-label="Delete routine"]')!;
    expect(expandedDel).not.toBeNull();
    act(() => expandedDel.click());
    expect(onRequestDelete).toHaveBeenCalledTimes(2);
    expandedView.unmount();
  });

  it('allows clearing and typing a monthly day-of-month value before clamping on blur (Item N)', async () => {
    const onSave = vi.fn();
    const monthly: Task = {
      id: 'monthly-1',
      title: 'Pay rent',
      listId: INBOX_LIST_ID,
      dueAt: '2026-11-15',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 15,
      },
      completionHistory: [],
      createdAt: 1000,
      updatedAt: 1000,
    };

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={vi.fn()}
        initialTask={monthly}
      />
    );

    const monthDayInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Day of month"]')!;
    expect(monthDayInput.value).toBe('15');
    const setInput = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;

    act(() => {
      setInput?.call(monthDayInput, '');
      monthDayInput.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(monthDayInput.value).toBe('');

    const triggerBlur = () => {
      monthDayInput.focus();
      monthDayInput.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
      monthDayInput.blur();
    };

    act(() => {
      setInput?.call(monthDayInput, '25');
      monthDayInput.dispatchEvent(new Event('input', { bubbles: true }));
      triggerBlur();
    });
    expect(monthDayInput.value).toBe('25');

    await act(async () => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Save routine"]')!.click();
    });
    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        recurrence: expect.objectContaining({ monthDay: 25 }),
      })
    );

    act(() => {
      setInput?.call(monthDayInput, '99');
      monthDayInput.dispatchEvent(new Event('input', { bubbles: true }));
      triggerBlur();
    });
    expect(monthDayInput.value).toBe('31');

    act(() => {
      setInput?.call(monthDayInput, '0');
      monthDayInput.dispatchEvent(new Event('input', { bubbles: true }));
      triggerBlur();
    });
    expect(monthDayInput.value).toBe('1');

    view.unmount();
  });

  it('rotates RepeatPanel weekday buttons by prefs.weekStart and unskips skipped dates (Item T)', async () => {
    const { PREFS_STORAGE_KEY, resetPrefsCache, updatePrefs } = await import('../../prefs/prefs');
    updatePrefs({ weekStart: 1 });
    try {
      const onUnskipOccurrence = vi.fn();
      const weekly: Task = {
        id: 'weekly-skip-1',
        title: 'Trash day',
        listId: INBOX_LIST_ID,
        dueAt: '2026-11-28',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [6],
        },
        skippedDates: ['2026-11-21', '2026-11-28'],
        completionHistory: [],
        createdAt: 1000,
        updatedAt: 1000,
      };

      const view = mount(
        <QuickAddSheet
          isOpen={true}
          onSave={vi.fn()}
          onClose={vi.fn()}
          initialTask={weekly}
          onUnskipOccurrence={onUnskipOccurrence}
        />
      );

      const weekdayNames = new Set(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);
      const weekdayOrder = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button'))
        .map((b) => b.textContent?.trim() ?? '')
        .filter((t) => weekdayNames.has(t));
      expect(weekdayOrder).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);

      const skippedPanel = view.container.querySelector<HTMLElement>('[data-testid="skipped-dates-panel"]')!;
      expect(skippedPanel).not.toBeNull();
      const unskipNov21 = skippedPanel.querySelector<HTMLButtonElement>('button[aria-label="Unskip 2026-11-21"]')!;
      expect(unskipNov21).not.toBeNull();

      act(() => {
        unskipNov21.click();
      });
      expect(onUnskipOccurrence).toHaveBeenCalledWith('weekly-skip-1', '2026-11-21');
      expect(skippedPanel.querySelector('button[aria-label="Unskip 2026-11-21"]')).toBeNull();
      expect(skippedPanel.querySelector('button[aria-label="Unskip 2026-11-28"]')).not.toBeNull();

      view.unmount();
    } finally {
      updatePrefs({ weekStart: 0 });
      localStorage.removeItem(PREFS_STORAGE_KEY);
      resetPrefsCache();
    }
  });
});
