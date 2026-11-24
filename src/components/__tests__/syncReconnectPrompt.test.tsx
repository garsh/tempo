// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncReconnectPrompt } from '../SyncReconnectPrompt';
import type { SyncNowResult } from '../../hooks/useAutoSync';

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

describe('SyncReconnectPrompt', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    document.body.innerHTML = '';
  });

  it('renders nothing when authPrompt is null, dismissed, or hidden', () => {
    const view = mount(
      <SyncReconnectPrompt authPrompt={null} onReconnect={vi.fn()} onDismiss={vi.fn()} />
    );
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).toBeNull();

    view.rerender(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked', dismissed: true }}
        onReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).toBeNull();

    view.rerender(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked', dismissed: false }}
        hidden={true}
        onReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(view.container.querySelector('[data-testid="sync-reconnect-prompt"]')).toBeNull();

    view.unmount();
  });

  it('renders appropriate copy and action labels for each authPrompt reason', () => {
    const view = mount(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked', dismissed: false }}
        onReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(view.container.textContent).toContain('Sync paused — popup blocked');
    expect(view.container.textContent).toContain('Allow & Sync');

    view.rerender(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked_interactive', dismissed: false }}
        onReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(view.container.textContent).toContain('Allow popups for this site, then retry');
    expect(view.container.textContent).toContain('Try again');

    view.rerender(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'auth_required', dismissed: false }}
        onReconnect={vi.fn()}
        onDismiss={vi.fn()}
      />
    );
    expect(view.container.textContent).toContain('Google Drive sign-in needed');
    expect(view.container.textContent).toContain('Sign in');

    view.unmount();
  });

  it('invokes onReconnect synchronously on click, shows syncing, and transitions to synced', async () => {
    let resolveReconnect!: (result: SyncNowResult) => void;
    let calledSynchronously = false;
    const onReconnect = vi.fn(() => {
      calledSynchronously = true;
      return new Promise<SyncNowResult>((resolve) => {
        resolveReconnect = resolve;
      });
    });

    const view = mount(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked', dismissed: false }}
        onReconnect={onReconnect}
        onDismiss={vi.fn()}
      />
    );

    const actionBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Allow & Sync')
    )!;
    expect(actionBtn).toBeTruthy();

    act(() => {
      actionBtn.click();
      expect(calledSynchronously).toBe(true);
    });

    expect(onReconnect).toHaveBeenCalledTimes(1);
    expect(view.container.textContent).toContain('Syncing with Google Drive…');

    await act(async () => {
      resolveReconnect({ synced: true });
      await Promise.resolve();
    });

    expect(view.container.textContent).toContain('Synced with Google Drive');
    view.unmount();
  });

  it('calls onDismiss when the dismiss button is clicked', () => {
    const onDismiss = vi.fn();
    const view = mount(
      <SyncReconnectPrompt
        authPrompt={{ reason: 'popup_blocked', dismissed: false }}
        onReconnect={vi.fn()}
        onDismiss={onDismiss}
      />
    );

    const dismissBtn = view.container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss sync notification"]'
    )!;
    act(() => {
      dismissBtn.click();
    });

    expect(onDismiss).toHaveBeenCalledTimes(1);
    view.unmount();
  });
});
