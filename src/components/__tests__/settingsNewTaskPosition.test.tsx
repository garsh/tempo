// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../settings/SettingsPage';
import { getPrefs, PREFS_STORAGE_KEY, resetPrefsCache } from '../../prefs/prefs';

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

describe('SettingsPage new task placement', () => {
  beforeEach(() => {
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
  });

  afterEach(() => {
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
    document.body.replaceChildren();
  });

  it('defaults to Bottom of list and toggles newTaskPosition between bottom and top', () => {
    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="general"
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

    const group = view.container.querySelector('[role="radiogroup"][aria-label="New task placement"]');
    expect(group).toBeTruthy();

    const radios = Array.from(group!.querySelectorAll<HTMLButtonElement>('[role="radio"]'));
    const bottomBtn = radios.find((btn) => btn.textContent?.includes('Bottom of list'));
    const topBtn = radios.find((btn) => btn.textContent?.includes('Top of list'));
    expect(bottomBtn).toBeTruthy();
    expect(topBtn).toBeTruthy();

    expect(bottomBtn!.getAttribute('aria-checked')).toBe('true');
    expect(topBtn!.getAttribute('aria-checked')).toBe('false');
    expect(getPrefs().newTaskPosition).toBe('bottom');

    act(() => {
      topBtn!.click();
    });

    expect(bottomBtn!.getAttribute('aria-checked')).toBe('false');
    expect(topBtn!.getAttribute('aria-checked')).toBe('true');
    expect(getPrefs().newTaskPosition).toBe('top');

    act(() => {
      bottomBtn!.click();
    });

    expect(bottomBtn!.getAttribute('aria-checked')).toBe('true');
    expect(topBtn!.getAttribute('aria-checked')).toBe('false');
    expect(getPrefs().newTaskPosition).toBe('bottom');

    view.unmount();
  });
});
