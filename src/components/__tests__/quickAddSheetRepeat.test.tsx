// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from '../QuickAddSheet';

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

describe('QuickAddSheet recurrence UI', () => {
  it('Repeat button starts greyed out on white background, touching highlights blue and opens repeat dialog', async () => {
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

    // Tap Repeat toolbar button: highlights blue and opens repeat dialog
    act(() => {
      repeatToolbarBtn!.click();
    });

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('true');
    expect(repeatToolbarBtn!.className).toContain('bg-tt-blue');
    expect(repeatToolbarBtn!.className).toContain('text-white');

    // Check that repeat panel is now open directly with interval and unit inputs
    const intervalInput = view.container.querySelector<HTMLInputElement>('#repeat-interval-input');
    expect(intervalInput).toBeTruthy();
    expect(intervalInput!.value).toBe('1');

    const unitSelect = view.container.querySelector<HTMLSelectElement>('#repeat-unit-select');
    expect(unitSelect).toBeTruthy();
    expect(unitSelect!.value).toBe('days');

    // Check recurrence logic selection box defaults to fixed_interval
    const logicSelect = view.container.querySelector<HTMLSelectElement>('#recurrence-logic-select');
    expect(logicSelect).toBeTruthy();
    expect(logicSelect!.value).toBe('fixed_interval');

    // Check ends mode selection box defaults to never
    const endModeSelect = view.container.querySelector<HTMLSelectElement>('#end-mode-select');
    expect(endModeSelect).toBeTruthy();
    expect(endModeSelect!.value).toBe('never');

    // Redundant header, enable switch, and "Every day" banner should NOT exist
    expect(view.container.textContent).not.toContain('Repeat routine');
    expect(view.container.querySelector('button[role="switch"]')).toBeNull();

    view.unmount();
  });

  it('allows toggling recurrence off by tapping the highlighted Repeat toolbar button or Remove repeat', async () => {
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
    // Open repeat panel
    act(() => {
      repeatToolbarBtn!.click();
    });

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('true');
    expect(view.container.querySelector('#repeat-interval-input')).toBeTruthy();

    // Tap highlighted Repeat button again: turns off repeat and closes panel
    act(() => {
      repeatToolbarBtn!.click();
    });

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('false');
    expect(repeatToolbarBtn!.className).toContain('bg-white');
    expect(view.container.querySelector('#repeat-interval-input')).toBeNull();

    // Re-open and test "Remove repeat" button
    act(() => {
      repeatToolbarBtn!.click();
    });
    expect(view.container.querySelector('#repeat-interval-input')).toBeTruthy();

    const removeRepeatBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Remove repeat')
    );
    expect(removeRepeatBtn).toBeTruthy();

    act(() => {
      removeRepeatBtn!.click();
    });

    expect(repeatToolbarBtn!.getAttribute('aria-pressed')).toBe('false');
    expect(view.container.querySelector('#repeat-interval-input')).toBeNull();

    view.unmount();
  });

  it('updates recurrence parameters and saves with the configured recurrence rule', async () => {
    const onSave = vi.fn();
    const onClose = vi.fn();
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={onSave}
        onClose={onClose}
      />
    );

    // Type title
    const titleInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Routine title"]');
    expect(titleInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(titleInput, 'Water the plants');
      titleInput!.dispatchEvent(new Event('input', { bubbles: true }));
      titleInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Open repeat panel
    const repeatToolbarBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Repeat"]'
    );
    act(() => {
      repeatToolbarBtn!.click();
    });

    // Change unit to weeks
    const unitSelect = view.container.querySelector<HTMLSelectElement>('#repeat-unit-select');
    expect(unitSelect).toBeTruthy();
    act(() => {
      unitSelect!.value = 'weeks';
      unitSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Change interval to 2
    const intervalInput = view.container.querySelector<HTMLInputElement>('#repeat-interval-input');
    expect(intervalInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(intervalInput, '2');
      intervalInput!.dispatchEvent(new Event('input', { bubbles: true }));
      intervalInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Select Mon (1) and Fri (5)
    const weekdayBtns = Array.from(view.container.querySelectorAll('button')).filter((b) =>
      ['Mon', 'Fri'].includes(b.textContent?.trim() || '')
    );
    expect(weekdayBtns.length).toBe(2);
    act(() => {
      weekdayBtns.forEach((btn) => btn.click());
    });

    // Recurrence logic is fixed_interval by default; switch to after_completion to test selection box
    const logicSelect = view.container.querySelector<HTMLSelectElement>('#recurrence-logic-select');
    expect(logicSelect).toBeTruthy();
    act(() => {
      logicSelect!.value = 'after_completion';
      logicSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Set end mode to after occurrences
    const endModeSelect = view.container.querySelector<HTMLSelectElement>('#end-mode-select');
    expect(endModeSelect).toBeTruthy();
    act(() => {
      endModeSelect!.value = 'after_count';
      endModeSelect!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    const endCountInput = view.container.querySelector<HTMLInputElement>('#end-after-count-input');
    expect(endCountInput).toBeTruthy();
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
      setter?.call(endCountInput, '10');
      endCountInput!.dispatchEvent(new Event('input', { bubbles: true }));
      endCountInput!.dispatchEvent(new Event('change', { bubbles: true }));
    });

    // Submit form
    const createBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Create routine"]');
    expect(createBtn).toBeTruthy();
    expect(createBtn!.disabled).toBe(false);

    await act(async () => {
      createBtn!.click();
    });

    expect(onSave).toHaveBeenCalledTimes(1);
    const savedTask = onSave.mock.calls[0][0];
    expect(savedTask.title).toBe('Water the plants');
    expect(savedTask.recurrence).toEqual({
      type: 'after_completion',
      intervalValue: 2,
      intervalUnit: 'weeks',
      weekdays: [1, 5],
      monthDay: undefined,
      endOnDate: null,
      endAfterCount: 10,
    });

    view.unmount();
  });
});
