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

    // Initially greyed out with white background
    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('false');
    expect(repeatToolbarBtn!.className).toContain('bg-white');
    expect(repeatToolbarBtn!.className).toContain('text-zinc-400');

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
    expect(repeatToolbarBtn!.className).toContain('bg-white');
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

    const titleInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Routine title"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
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

    const titleInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Routine title"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
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
});
