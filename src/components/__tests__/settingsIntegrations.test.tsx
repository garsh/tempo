// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Task } from '../../types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const dbMocks = vi.hoisted(() => ({
  clearAllData: vi.fn(async () => 4),
  clearSampleTasks: vi.fn(async () => 0),
  cleanupImportedAndTombstones: vi.fn(async () => ({
    removedImportedCompleted: 12,
    purgedTasks: 8,
    purgedLists: 1,
    purgedFolders: 0,
    needsSync: false,
  })),
  findImportedCompletedTaskIds: vi.fn(() => []),
  getClearAllDataPreview: vi.fn(async () => ({
    openTasks: 3,
    completedTasks: 5,
    activeTasks: 8,
  })),
  getStorageCleanupPreview: vi.fn(async () => ({
    importedCompletedTasks: 12,
    tombstonedTasks: 8,
    tombstonedLists: 1,
    tombstonedFolders: 0,
    activeRemainingTasks: 10,
  })),
  isSampleId: vi.fn(() => false),
  loadSampleTasks: vi.fn(async () => 0),
  repairAndDeduplicateDatabase: vi.fn(async () => ({
    deduplicatedTasks: 0,
    mergedLists: 0,
    purgedTombstones: 0,
  })),
  db: {
    tasks: { toArray: vi.fn(async () => []) },
    lists: { toArray: vi.fn(async () => []) },
    folders: { toArray: vi.fn(async () => []) },
  },
}));

vi.mock('../../db/db', () => dbMocks);

const dataTransferMocks = vi.hoisted(() => ({
  exportJsonBackup: vi.fn(async () => 'Exported 8 tasks.'),
  importJsonBackup: vi.fn(async () => 'Imported 2 tasks!'),
  previewJsonBackup: vi.fn(async () => ({
    exportedAt: 1_700_000_000_000,
    incomingActiveTasks: 2,
    incomingOpenTasks: 1,
    incomingCompletedTasks: 1,
    incomingRecurringTasks: 1,
    incomingTombstonedTasks: 3,
    skippedPrunedTombstones: 1,
    newTasksToAdd: 1,
    existingTasksToUpdate: 1,
    existingLocalTasksKept: 4,
  })),
  readFileText: vi.fn(async () => '{"version":4,"tasks":[]}'),
}));

vi.mock('../settings/dataTransfer', () => dataTransferMocks);

import { SettingsPage } from '../settings/SettingsPage';

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

async function flushUi() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 30));
  });
}

function renderDataPage(accountEmail?: string) {
  return mount(
    <SettingsPage
      isOpen={true}
      initialPage="data"
      onClose={vi.fn()}
      tasks={[] as Task[]}
      syncStatus={{
        phase: 'idle',
        lastSyncedAt: accountEmail ? 1_700_000_000_000 : null,
        lastError: null,
        autoSyncEnabled: Boolean(accountEmail),
        account: accountEmail ? { email: accountEmail } : null,
      }}
      onSyncStatusChange={vi.fn()}
      onShowShortcuts={vi.fn()}
    />
  );
}

describe('SettingsPage Backup & Diagnostics', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
    document.body.replaceChildren();
  });

  it('removes TickTick/CSV import, groups JSON Backup together, and places Clear and Sample tasks in Diagnostics & Repair', async () => {
    const view = renderDataPage();
    const text = view.container.textContent ?? '';

    expect(text).not.toMatch(/TickTick/i);
    expect(text).not.toMatch(/\bCSV\b/);

    const jsonBackupHeading = Array.from(view.container.querySelectorAll('div')).find(
      (el) => el.textContent?.trim() === 'JSON Backup'
    );
    const diagHeading = Array.from(view.container.querySelectorAll('div')).find(
      (el) => el.textContent?.trim() === 'Diagnostics & Repair'
    );
    expect(jsonBackupHeading).toBeTruthy();
    expect(diagHeading).toBeTruthy();

    const jsonCard = jsonBackupHeading!.nextElementSibling!;
    const diagCard = diagHeading!.nextElementSibling!;

    expect(jsonCard.textContent).toContain('Export JSON backup');
    expect(jsonCard.textContent).toContain('Restore JSON backup');
    expect(jsonCard.textContent).not.toContain('Clear all current data');
    expect(jsonCard.textContent).not.toContain('Load sample tasks');

    const jsonNote = jsonCard.nextElementSibling!;
    expect(jsonNote.textContent).toContain(
      'Exports your active tasks. Restoring a JSON backup merges with your current tasks after confirmation.'
    );
    expect(jsonNote.textContent).not.toMatch(/lists|folders|tombstone/i);

    expect(diagCard.textContent).toContain('Background sync');
    expect(diagCard.textContent).toContain('Repair & Deduplicate Tasks');
    expect(diagCard.textContent).toContain('Clean Up Storage');
    expect(diagCard.textContent).toContain('Load sample tasks');
    expect(diagCard.textContent).toContain('Clear sample tasks');
    expect(diagCard.textContent).toContain('Clear all current data');
    expect(diagCard.textContent).toContain('Copy Diagnostics Report');

    const bgSwitch = diagCard.querySelector<HTMLButtonElement>('button[role="switch"][aria-label="Background sync"]')!;
    expect(bgSwitch).toBeTruthy();
    expect(bgSwitch.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      bgSwitch.click();
    });
    expect(bgSwitch.getAttribute('aria-checked')).toBe('false');
    expect(localStorage.getItem('tempo_auto_sync_enabled')).toBe('0');
    await act(async () => {
      bgSwitch.click();
    });
    expect(bgSwitch.getAttribute('aria-checked')).toBe('true');
    expect(localStorage.getItem('tempo_auto_sync_enabled')).toBe('1');

    const loadSampleBtn = Array.from(diagCard.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Load sample tasks')
    )!;
    await act(async () => {
      loadSampleBtn.click();
    });
    await flushUi();
    expect(dbMocks.loadSampleTasks).toHaveBeenCalledTimes(1);

    const clearSampleBtn = Array.from(diagCard.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear sample tasks')
    )!;
    await act(async () => {
      clearSampleBtn.click();
    });
    await flushUi();
    expect(dbMocks.clearSampleTasks).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('shows a detailed confirmation popup before restoring a JSON backup and respects Cancel vs Confirm', async () => {
    const view = renderDataPage('donna@example.com');
    const fileInput = view.container.querySelector<HTMLInputElement>('input[aria-label="Restore JSON backup"]')!;
    expect(fileInput).toBeTruthy();

    const selectFile = async () => {
      const file = new File(['{"version":4,"tasks":[]}'], 'tempo-backup.json', { type: 'application/json' });
      Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });
      await act(async () => {
        fileInput.dispatchEvent(new Event('change', { bubbles: true }));
      });
      await flushUi();
    };

    await selectFile();

    const dialog = view.container.querySelector('[role="alertdialog"]');
    expect(dialog).toBeTruthy();
    expect(dialog!.getAttribute('aria-label')).toBe('Restore JSON backup?');
    expect(dialog!.textContent).toContain('tempo-backup.json');
    expect(dialog!.textContent).toContain('2 active task(s)');
    expect(dialog!.textContent).toContain('1 open, 1 completed, 1 recurring');
    expect(dialog!.textContent).not.toMatch(/list\(s\)|folder\(s\)/);
    expect(dialog!.textContent).toContain('1 new task(s) added, 1 existing task(s) updated, and 4 local task(s)');
    expect(dialog!.textContent).toContain('3 deleted task tombstone(s)');
    expect(dialog!.textContent).toContain('donna@example.com');
    expect(dataTransferMocks.importJsonBackup).not.toHaveBeenCalled();

    const cancelBtn = Array.from(dialog!.querySelectorAll('button')).find((b) => b.textContent === 'Cancel')!;
    await act(async () => {
      cancelBtn.click();
    });
    expect(view.container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(dataTransferMocks.importJsonBackup).not.toHaveBeenCalled();

    // Re-select and confirm
    await selectFile();
    const dialog2 = view.container.querySelector('[role="alertdialog"]')!;
    const confirmBtn = Array.from(dialog2.querySelectorAll('button')).find(
      (b) => b.textContent === 'Restore Backup'
    )!;
    await act(async () => {
      confirmBtn.click();
    });
    await flushUi();

    expect(dataTransferMocks.importJsonBackup).toHaveBeenCalledTimes(1);
    expect(view.container.querySelector('[role="status"]')?.textContent).toContain('Imported 2 tasks');

    view.unmount();
  });

  it('shows detailed confirmation popups for Clear all current data and Clean Up Storage', async () => {
    const view = renderDataPage('donna@example.com');

    // Clear all current data popup
    const clearBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clear all current data')
    )!;
    await act(async () => {
      clearBtn.click();
    });
    await flushUi();

    const clearDialog = view.container.querySelector('[role="alertdialog"]');
    expect(clearDialog?.getAttribute('aria-label')).toBe('Clear all current data?');
    expect(clearDialog?.textContent).toContain('8 active task(s) (3 open, 5 completed)');
    expect(clearDialog?.textContent).not.toContain('list(s)');
    expect(clearDialog?.textContent).not.toContain('folder(s)');
    expect(clearDialog?.textContent).not.toContain('Inbox');
    expect(clearDialog?.textContent).toContain('donna@example.com');
    expect(clearDialog?.textContent).toContain('soft-deleted tombstones');
    expect(dbMocks.clearAllData).not.toHaveBeenCalled();

    const confirmClearBtn = Array.from(clearDialog!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clear all data'
    )!;
    await act(async () => {
      confirmClearBtn.click();
    });
    await flushUi();
    expect(dbMocks.clearAllData).toHaveBeenCalledTimes(1);

    // Clean Up Storage popup
    const cleanupBtn = Array.from(view.container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Clean Up Storage')
    )!;
    await act(async () => {
      cleanupBtn.click();
    });
    await flushUi();

    const cleanupDialog = view.container.querySelector('[role="alertdialog"]');
    expect(cleanupDialog?.getAttribute('aria-label')).toBe('Clean up storage?');
    expect(cleanupDialog?.textContent).toContain('12 bulk-imported historical completed task(s)');
    expect(cleanupDialog?.textContent).toContain('9 deleted tombstone record(s) (8 task(s), 1 list(s))');
    expect(cleanupDialog?.textContent).toContain('10 active task(s)');
    expect(cleanupDialog?.textContent).toContain('donna@example.com');
    expect(dbMocks.cleanupImportedAndTombstones).not.toHaveBeenCalled();

    const confirmCleanupBtn = Array.from(cleanupDialog!.querySelectorAll('button')).find(
      (b) => b.textContent === 'Clean Up Storage'
    )!;
    await act(async () => {
      confirmCleanupBtn.click();
    });
    await flushUi();
    expect(dbMocks.cleanupImportedAndTombstones).toHaveBeenCalledTimes(1);

    view.unmount();
  });

  it('closes only an open ConfirmDialog on Escape without closing SettingsPage (Item M)', async () => {
    const onClose = vi.fn();
    const view = mount(
      <SettingsPage
        isOpen={true}
        initialPage="data"
        onClose={onClose}
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

    const clearBtn = Array.from(view.container.querySelectorAll<HTMLButtonElement>('button')).find((b) =>
      b.textContent?.includes('Clear all current data')
    )!;
    expect(clearBtn).toBeTruthy();

    await act(async () => {
      clearBtn.click();
    });
    expect(view.container.textContent).toContain('Clear all current data?');

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(view.container.textContent).not.toContain('Clear all current data?');
    expect(onClose).not.toHaveBeenCalled();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);

    view.unmount();
  });
});
