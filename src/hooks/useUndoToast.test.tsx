// @vitest-environment happy-dom
import { act, type MutableRefObject } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useUndoToast, type PendingUndo } from './useUndoToast';

function mountHarness() {
  const api: { current: ReturnType<typeof useUndoToast> | null } = { current: null };
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);

  function Harness() {
    const value = useUndoToast();
    api.current = value;
    return (
      <div>
        <span data-testid="toast">{value.undoToast?.message ?? ''}</span>
        <span data-testid="offer">{value.undoToast ? String(value.undoToast.offerUndo) : 'none'}</span>
        <span data-testid="pending">{value.pendingUndo?.message ?? ''}</span>
      </div>
    );
  }

  act(() => {
    root.render(<Harness />);
  });

  return {
    api: api as MutableRefObject<ReturnType<typeof useUndoToast>>,
    toast: () => container.querySelector('[data-testid="toast"]')?.textContent ?? '',
    offer: () => container.querySelector('[data-testid="offer"]')?.textContent ?? '',
    pending: () => container.querySelector('[data-testid="pending"]')?.textContent ?? '',
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

const meta = { taskId: 't1', title: 'Milk', baselineUpdatedAt: 10 };

describe('useUndoToast', () => {
  afterEach(() => {
    vi.useRealTimers();
    document.body.replaceChildren();
  });

  it('keeps the pending undo after the popup times out or is dismissed', () => {
    vi.useFakeTimers();
    const view = mountHarness();
    const onUndo = vi.fn();

    act(() => {
      view.api.current.showUndoToast('Deleted "Milk"', onUndo, meta);
    });
    expect(view.toast()).toBe('Deleted "Milk"');
    expect(view.offer()).toBe('true');
    expect(view.pending()).toBe('Deleted "Milk"');

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(view.toast()).toBe('');
    expect(view.pending()).toBe('Deleted "Milk"');

    act(() => {
      view.api.current.showUndoToast('Deleted "Milk"', onUndo, meta);
    });
    act(() => {
      view.api.current.hideUndoToast();
    });
    expect(view.toast()).toBe('');
    expect(view.pending()).toBe('Deleted "Milk"');

    const firstTake: { taken: PendingUndo | null } = { taken: null };
    act(() => {
      firstTake.taken = view.api.current.takePendingUndo();
    });
    expect(firstTake.taken?.onUndo).toBe(onUndo);
    act(() => {
      expect(view.api.current.takePendingUndo()).toBeNull();
      view.api.current.endUndoConsume();
    });
    expect(view.pending()).toBe('');
    view.unmount();
  });

  it('replaces the previous undo and does not let an info toast clear it', () => {
    const view = mountHarness();
    const first = vi.fn();
    const second = vi.fn();

    act(() => {
      view.api.current.showUndoToast('Deleted "Milk"', first, meta);
      view.api.current.showUndoToast('Skipped "Eggs"', second, {
        taskId: 't2',
        title: 'Eggs',
        baselineUpdatedAt: 20,
      });
    });
    expect(view.pending()).toBe('Skipped "Eggs"');

    const replaced: { taken: PendingUndo | null } = { taken: null };
    act(() => {
      replaced.taken = view.api.current.takePendingUndo();
    });
    expect(replaced.taken?.onUndo).toBe(second);
    expect(first).not.toHaveBeenCalled();

    act(() => {
      view.api.current.endUndoConsume();
      view.api.current.showUndoToast('Deleted "Milk"', first, meta);
      view.api.current.showInfoToast('Can\'t undo; "Milk" changed');
    });
    expect(view.toast()).toBe('Can\'t undo; "Milk" changed');
    expect(view.offer()).toBe('false');
    expect(view.pending()).toBe('Deleted "Milk"');
    view.unmount();
  });
});
