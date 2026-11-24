import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import * as autoSync from '../autoSync';
import * as googleAuth from '../googleAuth';
import * as googleAccount from '../googleAccount';
import * as googleDrive from '../googleDrive';
import * as syncWatermark from '../syncWatermark';

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
      syncedAt: 555_000,
    });

    const result = await autoSync.runDriveSync({ allowInteractive: true, force: true });
    expect(result?.success).toBe(true);
    expect(autoSync.getSyncAuthPrompt()).toBeNull();
    expect(autoSync.getLastSyncError()).toBeNull();
  });

  it('retries once with a fresh token when Drive returns 401 (DriveAuthError)', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAccount, 'fetchDriveAccount').mockResolvedValue(null);
    googleAuth.storeAccessToken('stale-token', 3600);
    const tokenSpy = vi
      .spyOn(googleAuth, 'ensureGoogleAccessToken')
      .mockResolvedValueOnce('stale-token')
      .mockResolvedValueOnce('fresh-token');
    const syncSpy = vi
      .spyOn(googleDrive, 'syncWithGoogleDrive')
      .mockRejectedValueOnce(new googleDrive.DriveAuthError())
      .mockResolvedValueOnce({
        success: true,
        tasksCount: 2,
        syncedAt: 777_000,
      });

    const result = await autoSync.runDriveSync({ allowInteractive: true, force: true });
    expect(result?.success).toBe(true);
    expect(tokenSpy).toHaveBeenCalledTimes(2);
    expect(syncSpy).toHaveBeenNthCalledWith(1, 'stale-token', expect.any(Object));
    expect(syncSpy).toHaveBeenNthCalledWith(2, 'fresh-token', expect.any(Object));
  });

  it('cancelPendingAutoSync cancels pending debounced sync and clearSyncWatermarkState clears lastSyncedAt', () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    autoSync.setAutoSyncEnabled(true);
    autoSync.recordSyncSuccess(123_456);
    expect(autoSync.getLastSyncedAt()).toBe(123_456);

    autoSync.triggerDebouncedSync(2000);
    expect(vi.getTimerCount()).toBe(1);
    autoSync.cancelPendingAutoSync();
    expect(vi.getTimerCount()).toBe(0);

    syncWatermark.clearSyncWatermarkState();
    expect(autoSync.getLastSyncedAt()).toBeNull();
  });

  it('interactive runDriveSync waits for failed silent inflight sync and retries interactively', async () => {
    vi.spyOn(googleAuth, 'getStoredClientId').mockReturnValue('client-123');
    vi.spyOn(googleAccount, 'getGoogleAccount').mockReturnValue({ email: 'test@example.com' });
    vi.spyOn(googleAccount, 'fetchDriveAccount').mockResolvedValue(null);
    autoSync.setAutoSyncEnabled(true);

    let rejectSilent!: (err: unknown) => void;
    const silentPromise = new Promise<string>((_res, rej) => {
      rejectSilent = rej;
    });

    vi.spyOn(googleAuth, 'ensureGoogleAccessToken')
      .mockReturnValueOnce(silentPromise)
      .mockResolvedValueOnce('interactive-token');
    vi.spyOn(googleDrive, 'syncWithGoogleDrive').mockResolvedValueOnce({
      success: true,
      tasksCount: 1,
      syncedAt: 888_000,
    });

    const silentRun = autoSync.runDriveSync({ allowInteractive: false });
    const interactiveRun = autoSync.runDriveSync({ allowInteractive: true, force: true });

    rejectSilent(new googleAuth.GoogleAuthError('interaction_required', 'interaction_required'));
    await expect(silentRun).resolves.toBeNull();
    const interactiveResult = await interactiveRun;
    expect(interactiveResult?.success).toBe(true);
  });
});
