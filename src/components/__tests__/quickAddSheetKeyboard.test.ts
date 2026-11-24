// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { QuickAddSheet } from '../QuickAddSheet';

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

describe('QuickAddSheet VisualViewport keyboard tracking (Item N)', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  function installMockVisualViewport(initialHeight: number) {
    const listeners = new Map<string, Set<EventListener>>();
    const vv = {
      width: 390,
      height: initialHeight,
      offsetTop: 0,
      offsetLeft: 0,
      addEventListener: vi.fn((type: string, cb: EventListener) => {
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(cb);
      }),
      removeEventListener: vi.fn((type: string, cb: EventListener) => {
        listeners.get(type)?.delete(cb);
      }),
      dispatch(type: string) {
        const event = new Event(type);
        for (const cb of listeners.get(type) ?? []) cb(event);
      },
    };
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: vv });
    return vv;
  }

  it('does not fabricate a fallback keyboard inset when visualViewport reports activeInset === 0', () => {
    installMockVisualViewport(800);
    const view = mount(
      createElement(QuickAddSheet, { isOpen: true, onSave: vi.fn(), onClose: vi.fn() })
    );

    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.style.maxHeight).toBe(
      'calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))'
    );

    view.unmount();
  });

  it('applies keyboardInset when visualViewport shrinks >100px and clears it back to 0 when dismissed', () => {
    const vv = installMockVisualViewport(800);
    const view = mount(
      createElement(QuickAddSheet, { isOpen: true, onSave: vi.fn(), onClose: vi.fn() })
    );

    const dialog = view.container.querySelector<HTMLElement>('[role="dialog"]')!;
    expect(dialog.style.maxHeight).toBe(
      'calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))'
    );

    vv.height = 500;
    act(() => {
      vv.dispatch('resize');
    });
    expect(dialog.style.maxHeight).toBe('calc(100dvh - 300px - max(24px, env(safe-area-inset-top)))');

    vv.height = 800;
    act(() => {
      vv.dispatch('resize');
    });
    expect(dialog.style.maxHeight).toBe(
      'calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))'
    );

    view.unmount();
  });
});
