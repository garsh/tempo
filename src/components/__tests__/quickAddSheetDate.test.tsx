// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dateChoiceMenuPosition } from '../menu/DateChoiceMenu';
import { QuickAddSheet } from '../QuickAddSheet';
import { formatDate } from '../../domain/recurrence';
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
    listId: 'inbox',
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
});
