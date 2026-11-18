// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  LONG_DESCRIPTION_MIN_LENGTH,
  QuickAddSheet,
  descriptionExpandsDialog,
} from '../QuickAddSheet';
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

function dialogOf(container: HTMLElement): HTMLElement {
  const dialog = container.querySelector<HTMLElement>('[role="dialog"]');
  if (!dialog) throw new Error('dialog missing');
  return dialog;
}

function setDescription(textarea: HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
  setter?.call(textarea, value);
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function taskWithNotes(notes: string): Task {
  return {
    id: 't1',
    title: 'Existing routine',
    listId: 'inbox',
    notes,
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

describe('descriptionExpandsDialog', () => {
  it('stays compact for an empty or short one-line description', () => {
    expect(descriptionExpandsDialog('')).toBe(false);
    expect(descriptionExpandsDialog('Check the ferns')).toBe(false);
    expect(descriptionExpandsDialog('a'.repeat(LONG_DESCRIPTION_MIN_LENGTH - 1))).toBe(false);
    expect(descriptionExpandsDialog(`${'a'.repeat(LONG_DESCRIPTION_MIN_LENGTH - 1)}   `)).toBe(false);
  });

  it('expands for a line break or a long description', () => {
    expect(descriptionExpandsDialog('Buy milk\n')).toBe(true);
    expect(descriptionExpandsDialog('a'.repeat(LONG_DESCRIPTION_MIN_LENGTH))).toBe(true);
    expect(descriptionExpandsDialog(`  ${'a'.repeat(LONG_DESCRIPTION_MIN_LENGTH)}  `)).toBe(true);
  });
});

describe('QuickAddSheet description auto-expand', () => {
  it('has no expand button and grows the dialog when the description becomes long', () => {
    const onClose = vi.fn();
    const view = mount(
      <QuickAddSheet isOpen={true} onSave={vi.fn()} onClose={onClose} />
    );

    expect(view.container.querySelector('button[aria-label="Full screen"]')).toBeNull();
    expect(view.container.querySelector('button[aria-label="Exit full screen"]')).toBeNull();
    expect(view.container.textContent).not.toContain('Full screen');

    const textarea = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]');
    expect(textarea).toBeTruthy();
    expect(Number(textarea!.rows)).toBe(1);
    expect(dialogOf(view.container).className).toContain('max-w-xl');
    expect(dialogOf(view.container).className).not.toContain('inset-0');

    act(() => {
      setDescription(textarea!, 'a'.repeat(LONG_DESCRIPTION_MIN_LENGTH - 1));
    });
    expect(Number(textarea!.rows)).toBe(1);
    expect(dialogOf(view.container).className).toContain('max-w-xl');

    act(() => {
      setDescription(textarea!, 'a'.repeat(LONG_DESCRIPTION_MIN_LENGTH));
    });
    expect(Number(textarea!.rows)).toBe(6);
    expect(dialogOf(view.container).className).not.toContain('max-w-xl');
    expect(dialogOf(view.container).className).toContain('inset-0');

    act(() => {
      view.container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!.click();
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    act(() => {
      setDescription(textarea!, 'Buy milk');
    });
    expect(Number(textarea!.rows)).toBe(1);
    expect(dialogOf(view.container).className).toContain('max-w-xl');

    act(() => {
      setDescription(textarea!, 'Buy milk\n');
    });
    expect(Number(textarea!.rows)).toBe(6);
    expect(dialogOf(view.container).className).toContain('inset-0');

    view.unmount();
  });

  it('opens expanded when editing a routine that already has a long description', () => {
    const view = mount(
      <QuickAddSheet
        isOpen={true}
        onSave={vi.fn()}
        onClose={vi.fn()}
        initialTask={taskWithNotes('Line one\nLine two')}
      />
    );

    const textarea = view.container.querySelector<HTMLTextAreaElement>('textarea[aria-label="Description"]');
    expect(textarea!.value).toBe('Line one\nLine two');
    expect(Number(textarea!.rows)).toBe(6);
    expect(dialogOf(view.container).className).toContain('inset-0');
    expect(view.container.querySelector('button[aria-label="Full screen"]')).toBeNull();

    view.unmount();
  });
});
