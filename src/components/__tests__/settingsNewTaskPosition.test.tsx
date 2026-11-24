// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SettingsPage } from '../settings/SettingsPage';
import { getPrefs, PREFS_STORAGE_KEY, resetPrefsCache } from '../../prefs/prefs';
import { getGoogleAccount, setGoogleAccount } from '../../sync/googleAccount';

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

function getSelectByLabel(container: HTMLElement, labelText: string): HTMLSelectElement {
  const label = Array.from(container.querySelectorAll('label')).find(
    (el) => el.textContent?.trim() === labelText
  );
  expect(label).toBeTruthy();
  const select = container.querySelector<HTMLSelectElement>(`#${CSS.escape(label!.htmlFor)}`);
  expect(select).toBeTruthy();
  return select!;
}

function selectOption(select: HTMLSelectElement, value: string): void {
  act(() => {
    Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(select, value);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}

describe('SettingsPage consolidated preferences', () => {
  beforeEach(() => {
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.removeItem(PREFS_STORAGE_KEY);
    resetPrefsCache();
    document.body.replaceChildren();
  });

  it('defaults to Bottom of list and changes newTaskPosition via a single select box', () => {
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

    const placementSelect = getSelectByLabel(view.container, 'New task placement');
    expect(placementSelect.value).toBe('bottom');
    expect(getPrefs().newTaskPosition).toBe('bottom');

    selectOption(placementSelect, 'top');
    expect(placementSelect.value).toBe('top');
    expect(getPrefs().newTaskPosition).toBe('top');

    selectOption(placementSelect, 'bottom');
    expect(placementSelect.value).toBe('bottom');
    expect(getPrefs().newTaskPosition).toBe('bottom');

    view.unmount();
  });

  it('renders Theme, New task placement, and Date & Time options as select boxes on one screen', () => {
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

    expect(view.container.querySelectorAll('[role="radiogroup"]')).toHaveLength(0);

    const themeSelect = getSelectByLabel(view.container, 'Theme');
    const weekStartSelect = getSelectByLabel(view.container, 'Week starts on');
    const seasonsSelect = getSelectByLabel(view.container, 'Seasons');

    expect(themeSelect.value).toBe('system');
    expect(weekStartSelect.value).toBe('0');
    expect(seasonsSelect.value).toBe('north');

    selectOption(themeSelect, 'dark');
    selectOption(weekStartSelect, '1');
    selectOption(seasonsSelect, 'south');

    expect(getPrefs()).toMatchObject({
      theme: 'dark',
      weekStart: 1,
      hemisphere: 'south',
    });

    view.unmount();
  });

  it('shows consolidated preference selects directly on the mobile root Settings screen', () => {
    vi.stubGlobal(
      'matchMedia',
      vi.fn((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }))
    );

    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="root"
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

    const root = view.container.querySelector('[data-testid="settings-page"]');
    expect(root?.getAttribute('data-settings-layout')).toBe('drilldown');
    expect(root?.getAttribute('data-settings-page')).toBe('root');
    expect(view.container.querySelectorAll('select')).toHaveLength(4);
    expect(view.container.textContent).toContain('Account');
    expect(view.container.textContent).toContain('Backup & Diagnostics');
    expect(view.container.textContent).toContain('Keyboard shortcuts');
    expect(view.container.textContent).not.toContain('Help & Feedback');
    expect(view.container.textContent).not.toContain('Load sample tasks');

    view.unmount();
  });

  it('requires confirmation before signing out and explains what happens to tasks', () => {
    setGoogleAccount({ email: 'user@example.com' });
    const onSyncStatusChange = vi.fn();
    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="account"
        onClose={vi.fn()}
        tasks={[]}
        syncStatus={{
          phase: 'idle',
          lastSyncedAt: 1_700_000_000_000,
          lastError: null,
          autoSyncEnabled: true,
          account: { email: 'user@example.com' },
        }}
        onSyncStatusChange={onSyncStatusChange}
        onShowShortcuts={vi.fn()}
      />
    );

    const signOutRow = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Sign out on this device')
    )!;
    expect(signOutRow).toBeTruthy();

    act(() => {
      signOutRow.click();
    });

    const dialog = view.container.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('aria-label')).toBe('Sign out on this device?');
    expect(dialog!.textContent).toContain('Your tasks stay on this device');
    expect(dialog!.textContent).toContain('Syncing stops on this device');
    expect(getGoogleAccount()).toEqual({ email: 'user@example.com' });

    const cancelBtn = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    act(() => {
      cancelBtn.click();
    });
    expect(view.container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(getGoogleAccount()).toEqual({ email: 'user@example.com' });
    expect(onSyncStatusChange).not.toHaveBeenCalled();

    act(() => {
      signOutRow.click();
    });
    const dialog2 = view.container.querySelector('[role="alertdialog"]')!;
    const confirmBtn = Array.from(dialog2.querySelectorAll('button')).find((b) => b.textContent === 'Sign out')!;
    act(() => {
      confirmBtn.click();
    });

    expect(getGoogleAccount()).toBeNull();
    expect(onSyncStatusChange).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain(
      'Signed out on this device. Local tasks are kept.'
    );

    view.unmount();
  });

  it('displays last sync error in Account settings even when previously synced', () => {
    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="account"
        onClose={vi.fn()}
        tasks={[]}
        syncStatus={{
          phase: 'idle',
          lastSyncedAt: 1_700_000_000_000,
          lastError: 'Backup is too large.',
          autoSyncEnabled: true,
          account: { email: 'user@example.com' },
        }}
        onSyncStatusChange={vi.fn()}
        onShowShortcuts={vi.fn()}
      />
    );

    const alert = view.container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(alert!.textContent).toContain('Last sync failed: Backup is too large.');
    expect(view.container.textContent).toContain('Sync failed — tap to fix');

    view.unmount();
  });
});
