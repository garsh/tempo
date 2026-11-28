// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateChoiceMenuPosition } from '../menu/DateChoiceMenu';
import { QuickAddSheet } from '../QuickAddSheet';
import { formatDate, addDays, parseDate } from '../../domain/recurrence';
import type { Task } from '../../types/task';

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

function dateButton(container: HTMLElement): HTMLButtonElement {
  const button = container.querySelector<HTMLButtonElement>('button[aria-label="Date"]');
  if (!button) throw new Error('Date button missing');
  return button;
}

function openDateMenu(container: HTMLElement) {
  act(() => {
    dateButton(container).click();
  });
}

function undatedTask(): Task {
  return {
    id: 't1',
    title: 'Loose end',
    dueAt: null,
    completionHistory: [],
    createdAt: 1,
    updatedAt: 1,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  document.body.replaceChildren();
});

describe('dateChoiceMenuPosition', () => {
  const viewport = { width: 400, height: 800, offsetTop: 0, offsetLeft: 0 };

  it('opens below a control that has room', () => {
    const pos = dateChoiceMenuPosition({ top: 100, bottom: 140, left: 24 }, viewport);
    expect(pos.top).toBe(146);
    expect(pos.left).toBe(24);
  });

  it('opens above a control near the bottom of the visible viewport', () => {
    const pos = dateChoiceMenuPosition({ top: 700, bottom: 740, left: 24 }, viewport);
    expect(pos.top).toBe(700 - (44 * 3 + 19) - 6);
    expect(pos.left).toBe(24);
  });

  it('keeps the menu inside the right edge', () => {
    const pos = dateChoiceMenuPosition({ top: 100, bottom: 140, left: 360 }, viewport);
    expect(pos.left).toBe(400 - 188 - 8);
  });

  it('does not double-add visualViewport offsetTop/offsetLeft to fixed anchor rects (Item N)', () => {
    const scrolledViewport = { width: 390, height: 420, offsetTop: 120, offsetLeft: 20 };
    const pos = dateChoiceMenuPosition({ top: 200, bottom: 240, left: 48 }, scrolledViewport);
    expect(pos).toEqual({ top: 246, left: 48 });
  });
});

describe('QuickAddSheet date menu', () => {
  it('opens Today, Tomorrow, and Select without expanding the dialog', () => {
    const view = mount(<QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={vi.fn()} />);

    const sheet = view.container.querySelector('[data-testid="quick-add-sheet"]');
    expect(sheet?.className).toContain('sm:pt-14');
    expect(dateButton(view.container).textContent?.trim()).toBe('Today');
    expect(dateButton(view.container).getAttribute('aria-expanded')).toBe('false');

    openDateMenu(view.container);

    const menu = view.container.querySelector('#date-choice-menu');
    expect(menu?.getAttribute('role')).toBe('menu');
    expect(sheet?.className).toContain('sm:pt-14');
    expect(sheet?.className).not.toContain('sm:pt-6');
    expect(view.container.querySelector('#repeat-interval-input')).toBeNull();

    const choices = Array.from(menu!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(choices).toEqual(['Today', 'Tomorrow', 'Select', 'No date']);
    expect(menu!.querySelector('select')).toBeNull();

    const dateInput = menu!.querySelector('input[type="date"]');
    expect(dateInput?.getAttribute('aria-label')).toBe('Select');
    expect(dateButton(view.container).getAttribute('aria-expanded')).toBe('true');
    expect(dateButton(view.container).getAttribute('aria-haspopup')).toBe('menu');

    view.unmount();
  });

  it('hides No date while On fixed interval repeat is active', () => {
    const view = mount(<QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={vi.fn()} />);

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Repeat"]')!.click();
    });
    const fixedOption = Array.from(view.container.querySelectorAll('[role="menuitemradio"]')).find(
      (el) => el.textContent?.includes('On fixed interval'),
    ) as HTMLButtonElement | undefined;
    expect(fixedOption).toBeTruthy();
    act(() => {
      fixedOption!.click();
    });

    openDateMenu(view.container);
    const menu = view.container.querySelector('#date-choice-menu');
    const choices = Array.from(menu!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(choices).toEqual(['Today', 'Tomorrow', 'Select']);
    expect(menu!.textContent).not.toContain('No date');

    view.unmount();
  });

  it('sets the due day from Today and Tomorrow and saves that day', () => {
    const onSave = vi.fn();
    const view = mount(<QuickAddSheet isOpen={true} onSave={onSave} onClose={vi.fn()} />);

    openDateMenu(view.container);
    const tomorrow = view.container.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="false"]');
    expect(tomorrow?.textContent).toContain('Tomorrow');
    act(() => {
      tomorrow!.click();
    });

    expect(view.container.querySelector('#date-choice-menu')).toBeNull();
    expect(dateButton(view.container).textContent?.trim()).toBe('Tomorrow');

    openDateMenu(view.container);
    expect(view.container.querySelector('[role="menuitemradio"][aria-checked="true"]')?.textContent).toContain(
      'Tomorrow',
    );
    const today = Array.from(view.container.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')).find((el) =>
      el.textContent?.includes('Today'),
    );
    act(() => {
      today!.click();
    });
    expect(dateButton(view.container).textContent?.trim()).toBe('Today');

    openDateMenu(view.container);
    act(() => {
      view.container.querySelector<HTMLButtonElement>('[role="menuitemradio"][aria-checked="false"]')!.click();
    });

    const title = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Routine title"]');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
      setter?.call(title, 'Water plants');
      title!.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]')!.click();
    });

    const next = new Date();
    next.setDate(next.getDate() + 1);
    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ title: 'Water plants', dueAt: formatDate(next) }));

    view.unmount();
  });

  it('Select writes a calendar date onto the chip and closes the menu', () => {
    const view = mount(<QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={vi.fn()} />);
    openDateMenu(view.container);

    const dateInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Select"]');
    expect(dateInput?.type).toBe('date');
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(dateInput, '2026-12-25');
      dateInput!.dispatchEvent(new Event('input', { bubbles: true }));
    });

    expect(view.container.querySelector('#date-choice-menu')).toBeNull();
    const expected = new Date(2026, 11, 25).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    expect(dateButton(view.container).textContent?.trim()).toBe(expected);

    view.unmount();
  });

  it('includes No date on the menu and marks it checked when editing an undated routine', () => {
    const view = mount(
      <QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={vi.fn()} initialTask={undatedTask()} />,
    );
    expect(dateButton(view.container).textContent?.trim()).toBe('No date');

    openDateMenu(view.container);
    const menu = view.container.querySelector('#date-choice-menu');
    const choices = Array.from(menu!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(choices).toEqual(['Today', 'Tomorrow', 'Select', 'No date']);
    const noDateItem = Array.from(menu!.querySelectorAll('[role="menuitemradio"]')).find(
      (el) => el.textContent?.trim() === 'No date',
    );
    expect(noDateItem?.getAttribute('aria-checked')).toBe('true');

    view.unmount();
  });

  it('closes on Escape or a tap outside without dismissing the dialog', () => {
    const onClose = vi.fn();
    const view = mount(<QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={onClose} />);

    openDateMenu(view.container);
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(view.container.querySelector('#date-choice-menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    openDateMenu(view.container);
    act(() => {
      view.container.querySelector<HTMLElement>('[data-testid="date-choice-menu-layer"]')!.click();
    });
    expect(view.container.querySelector('#date-choice-menu')).toBeNull();
    expect(onClose).not.toHaveBeenCalled();

    view.unmount();
  });

  it('uses a native button for "Select" that calls showPicker() and supports ArrowDown navigation (Item N)', () => {
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        defaultDueAt="2026-11-23"
      />
    );

    openDateMenu(view.container);

    const menu = view.container.querySelector<HTMLElement>('#date-choice-menu')!;
    expect(menu).not.toBeNull();
    expect(menu.querySelector('label[role="menuitem"]')).toBeNull();

    const items = Array.from(
      menu.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"], [role="menuitem"]')
    );
    expect(items.length).toBeGreaterThanOrEqual(2);
    const selectBtn = items.find((btn) => btn.textContent?.includes('Select'));
    expect(selectBtn).toBeDefined();
    expect(selectBtn!.getAttribute('role')).toBe('menuitem');

    const dateInput = menu.querySelector<HTMLInputElement>('input[type="date"]')!;
    expect(dateInput).not.toBeNull();
    const showPickerSpy = vi.fn();
    dateInput.showPicker = showPickerSpy;

    act(() => {
      items[0].focus();
      items[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    });
    expect(document.activeElement).toBe(items[1]);

    act(() => {
      selectBtn!.click();
    });
    expect(showPickerSpy).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('edits completed date instead of due date when editing a completed overdue one-off task', async () => {
    const today = new Date();
    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(addDays(parseDate(todayStr), -1));

    const completedOverdueTask: Task = {
      id: 'done-overdue',
      title: 'Pay bill',
      dueAt: yesterdayStr,
      completedAt: new Date(today.getFullYear(), today.getMonth(), today.getDate(), 10, 0, 0).getTime(),
      completionHistory: [],
      recurrence: null,
      createdAt: 1,
      updatedAt: 1,
    };

    const onSave = vi.fn().mockResolvedValue(true);
    const onUpdateCompletionDate = vi.fn().mockResolvedValue(undefined);

    const view = mount(
      <QuickAddSheet
        isOpen={true}
        initialTask={completedOverdueTask}
        onClose={vi.fn()}
        onSave={onSave}
        onUpdateCompletionDate={onUpdateCompletionDate}
      />
    );

    const completedDateButton = view.container.querySelector<HTMLButtonElement>('button[aria-label="Completed date"]');
    expect(completedDateButton?.textContent?.trim()).toContain('Done: Today');

    act(() => {
      completedDateButton!.click();
    });

    const menu = view.container.querySelector('#date-choice-menu');
    const choices = Array.from(menu!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((el) =>
      el.textContent?.trim(),
    );
    expect(choices).toEqual(['Today', 'Yesterday', 'Select']);
    const dateInput = menu!.querySelector<HTMLInputElement>('input[type="date"]');
    expect(dateInput?.max).toBe(todayStr);

    const yesterdayItem = Array.from(menu!.querySelectorAll('[role="menuitemradio"]')).find(
      (el) => el.textContent?.trim() === 'Yesterday',
    ) as HTMLButtonElement | undefined;
    act(() => {
      yesterdayItem!.click();
    });
    expect(completedDateButton?.textContent?.trim()).toContain('Done: Yesterday');

    const saveButton = view.container.querySelector<HTMLButtonElement>('button[aria-label="Save routine"]');
    act(() => {
      saveButton!.click();
    });

    await act(async () => {
      await Promise.resolve();
    });

    expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ dueAt: yesterdayStr }));
    expect(onUpdateCompletionDate).toHaveBeenCalledWith('done-overdue', todayStr, yesterdayStr);

    view.unmount();
  });

  it('edits completed date via onUpdateCompletionDate when editing a completed recurring or window-periodic occurrence', async () => {
    const today = new Date();
    const todayStr = formatDate(today);
    const yesterdayStr = formatDate(addDays(parseDate(todayStr), -1));
    const todayMs = today.getTime();

    const fixedRecurringTask: Task = {
      id: 'fixed-recurring',
      title: 'Daily task',
      dueAt: todayStr,
      completedAt: todayMs,
      completionHistory: [todayMs],
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      createdAt: 1,
      updatedAt: 1,
    };

    const windowPeriodicTask: Task = {
      id: 'window-periodic',
      title: 'Window task',
      dueAt: null,
      completedAt: todayMs,
      completionHistory: [todayMs],
      recurrence: { type: 'after_completion', intervalValue: 3, maxIntervalValue: 5, intervalUnit: 'days' },
      createdAt: 1,
      updatedAt: 1,
    };

    const onSave = vi.fn().mockResolvedValue(true);
    const onUpdateCompletionDate = vi.fn().mockResolvedValue(undefined);

    for (const task of [fixedRecurringTask, windowPeriodicTask]) {
      const view = mount(
        <QuickAddSheet
          isOpen={true}
          initialTask={task}
          onClose={vi.fn()}
          onSave={onSave}
          onUpdateCompletionDate={onUpdateCompletionDate}
        />
      );

      const completedDateButton = view.container.querySelector<HTMLButtonElement>('button[aria-label="Completed date"]');
      expect(completedDateButton?.textContent?.trim()).toContain('Done: Today');

      act(() => {
        completedDateButton!.click();
      });

      const menu = view.container.querySelector('#date-choice-menu');
      const choices = Array.from(menu!.querySelectorAll('[role="menuitemradio"], [role="menuitem"]')).map((el) =>
        el.textContent?.trim(),
      );
      expect(choices).toEqual(['Today', 'Yesterday', 'Select']);

      const yesterdayItem = Array.from(menu!.querySelectorAll('[role="menuitemradio"]')).find(
        (el) => el.textContent?.trim() === 'Yesterday',
      ) as HTMLButtonElement | undefined;
      act(() => {
        yesterdayItem!.click();
      });
      expect(completedDateButton?.textContent?.trim()).toContain('Done: Yesterday');

      const saveButton = view.container.querySelector<HTMLButtonElement>('button[aria-label="Save routine"]');
      act(() => {
        saveButton!.click();
      });

      await act(async () => {
        await Promise.resolve();
      });

      expect(onUpdateCompletionDate).toHaveBeenCalledWith(task.id, todayStr, yesterdayStr);

      view.unmount();
    }
  });
});
