import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as autoSync from '../autoSync';
import * as googleAuth from '../googleAuth';
import * as googleAccount from '../googleAccount';
import * as googleDrive from '../googleDrive';

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => store.set(key, String(value)),
    removeItem: (key: string) => store.delete(key),
    clear: () => store.clear(),
  };
}

describe('autoSync', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockStorage());
    vi.stubGlobal('sessionStorage', createMockStorage());
    vi.clearAllMocks();
    googleAuth.clearStoredToken();
    autoSync.clearSyncAuthPrompt();
    vi.useFakeTimers();
  });

  afterEach(() => {
    autoSync.clearSyncAuthPrompt();
    googleAuth.clearStoredToken();
    vi.restoreAllMocks();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('toggles autoSyncEnabled in localStorage', () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('');
    expect(autoSync.isAutoSyncEnabled()).toBe(false);
    autoSync.setAutoSyncEnabled(true);
    expect(autoSync.isAutoSyncEnabled()).toBe(true);
    autoSync.setAutoSyncEnabled(false);
    expect(autoSync.isAutoSyncEnabled()).toBe(false);
  });

  it('records sync success and errors', () => {
    expect(autoSync.getLastSyncedAt()).toBeNull();
    expect(autoSync.getLastSyncError()).toBeNull();

    autoSync.recordSyncSuccess(123456789);
    expect(autoSync.getLastSyncedAt()).toBe(123456789);
    expect(autoSync.getLastSyncError()).toBeNull();

    autoSync.recordSyncError('Network request failed');
    expect(autoSync.getLastSyncError()).toBe('Network request failed');

    // Success clears error
    autoSync.recordSyncSuccess(987654321);
    expect(autoSync.getLastSyncedAt()).toBe(987654321);
    expect(autoSync.getLastSyncError()).toBeNull();

    // clearSyncError removes stored error without erasing lastSyncedAt
    autoSync.recordSyncError('Upload interrupted');
    expect(autoSync.getLastSyncError()).toBe('Upload interrupted');
    autoSync.clearSyncError();
    expect(autoSync.getLastSyncError()).toBeNull();
    expect(autoSync.getLastSyncedAt()).toBe(987654321);
  });

  it('reads sync status snapshot with requested phase', () => {
    autoSync.recordSyncSuccess(1000);
    const snap = autoSync.readSyncStatusSnapshot('syncing');
    expect(snap.phase).toBe('syncing');
    expect(snap.lastSyncedAt).toBe(1000);
    expect(snap.lastError).toBeNull();
  });

  it('pauses sync when offline and does not drop the account or record an error', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAuth, 'ensureGoogleAccessToken').mockRejectedValue(new googleAuth.AuthOfflineError());
    const setAccount = vi.spyOn(googleAccount, 'setGoogleAccount');
    autoSync.setAutoSyncEnabled(true);

    const result = await autoSync.runDriveSync();

    expect(result).toBeNull();
    expect(autoSync.getLastSyncError()).toBeNull();
    expect(setAccount).not.toHaveBeenCalled();
  });

  it('triggerDebouncedSync debounces calls and executes when configured', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAuth, 'loadGoogleScript').mockResolvedValue();
    vi.spyOn(googleAuth, 'ensureGoogleAccessToken').mockResolvedValue('test-token');
    vi.spyOn(googleAccount, 'fetchDriveAccount').mockResolvedValue(null);
    vi.spyOn(googleDrive, 'syncWithGoogleDrive').mockResolvedValue({
      success: true,
      tasksCount: 0,
      listsCount: 0,
      foldersCount: 0,
      filtersCount: 0,
      syncedAt: Date.now(),
    });
    autoSync.setAutoSyncEnabled(true);

    autoSync.triggerDebouncedSync(500);
    autoSync.triggerDebouncedSync(500);

    // Should not fire immediately
    expect(vi.getTimerCount()).toBe(1);

    vi.advanceTimersByTime(499);
    expect(vi.getTimerCount()).toBe(1);

    // Fast-forward past delay
    vi.advanceTimersByTime(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('runDriveSync returns null if no client ID is configured', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('');
    const result = await autoSync.runDriveSync({ force: true });
    expect(result).toBeNull();
  });

  it('handles background popup_failed_to_open without storing lastError, clears stale error, and pauses repeat background popups', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAuth, 'loadGoogleScript').mockResolvedValue();
    const tokenSpy = vi
      .spyOn(googleAuth, 'ensureGoogleAccessToken')
      .mockRejectedValue(
        new googleAuth.GoogleAuthError('Failed to open popup window', 'popup_failed_to_open')
      );
    autoSync.setAutoSyncEnabled(true);
    autoSync.recordSyncError('Failed to open popup window');

    const listener = vi.fn();
    const unsubscribe = autoSync.subscribeSyncStatusChange(listener);
    try {
      const first = await autoSync.runDriveSync();
      expect(first).toBeNull();
      expect(autoSync.getLastSyncError()).toBeNull();
      expect(autoSync.getSyncAuthPrompt()).toEqual({
        reason: 'popup_blocked',
        dismissed: false,
      });
      expect(listener).toHaveBeenCalled();

      // Subsequent background sync must not keep retrying popups while authPrompt is active
      const second = await autoSync.runDriveSync();
      expect(second).toBeNull();
      expect(tokenSpy).toHaveBeenCalledTimes(1);

      // Dismissing hides the toast but continues to suppress background popup attempts
      autoSync.dismissSyncAuthPrompt();
      expect(autoSync.getSyncAuthPrompt()).toEqual({
        reason: 'popup_blocked',
        dismissed: true,
      });
      await autoSync.runDriveSync();
      expect(tokenSpy).toHaveBeenCalledTimes(1);
    } finally {
      unsubscribe();
    }
  });

  it('sets popup_blocked_interactive on interactive popup block and clears authPrompt once interactive sync succeeds', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAuth, 'loadGoogleScript').mockResolvedValue();
    const tokenSpy = vi
      .spyOn(googleAuth, 'ensureGoogleAccessToken')
      .mockRejectedValueOnce(
        new googleAuth.GoogleAuthError('Failed to open popup window', 'popup_failed_to_open')
      );

    await expect(
      autoSync.runDriveSync({ allowInteractive: true, force: true })
    ).rejects.toMatchObject({ code: 'popup_failed_to_open' });

    expect(autoSync.getLastSyncError()).toBeNull();
    expect(autoSync.getSyncAuthPrompt()).toEqual({
      reason: 'popup_blocked_interactive',
      dismissed: false,
    });

    tokenSpy.mockResolvedValueOnce('fresh-token');
    vi.spyOn(googleAccount, 'fetchDriveAccount').mockResolvedValue(null);
    vi.spyOn(googleDrive, 'syncWithGoogleDrive').mockResolvedValue({
      success: true,
      tasksCount: 1,
      listsCount: 1,
      foldersCount: 0,
      filtersCount: 0,
      syncedAt: 555_000,
    });

    const result = await autoSync.runDriveSync({ allowInteractive: true, force: true });
    expect(result?.success).toBe(true);
    expect(autoSync.getSyncAuthPrompt()).toBeNull();
    expect(autoSync.getLastSyncError()).toBeNull();
  });
});
