import { useCallback, useEffect, useState } from 'react';
import {
  AUTO_SYNC_INTERVAL_MS,
  cancelPendingAutoSync,
  canAutoSync,
  clearSyncAuthPrompt,
  clearSyncError,
  dismissSyncAuthPrompt,
  formatSyncErrorMessage,
  getLastSyncError,
  isAutoSyncEnabled,
  isDriveSyncInflight,
  isQuietSyncError,
  readSyncStatusSnapshot,
  runDriveSync,
  subscribeSyncStatusChange,
  triggerDebouncedSync,
  type SyncPhase,
  type SyncStatusSnapshot,
} from '../sync/autoSync';
import {
  applyRemoteSignOut,
  getStoredClientId,
  isAuthInteractionError,
  isPopupBlockedError,
  subscribeGoogleSignOut,
} from '../sync/googleAuth';
import { getGoogleAccount, setGoogleAccount } from '../sync/googleAccount';
import { clearSyncWatermarkState } from '../sync/syncWatermark';

export interface SyncNowResult {
  synced: boolean;
  authBlocked?: boolean;
  error?: string;
}

export function useAutoSync(): {
  status: SyncStatusSnapshot;
  syncNow: (interactive?: boolean) => Promise<SyncNowResult>;
  scheduleSync: (delayMs?: number) => void;
  refreshStatus: () => void;
  dismissAuthPrompt: () => void;
} {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());

  const scheduleSync = useCallback((delayMs = 2000) => {
    triggerDebouncedSync(delayMs);
  }, []);

  const refreshStatus = useCallback((phase?: SyncPhase) => {
    setStatus(readSyncStatusSnapshot(phase ?? 'idle'));
  }, []);

  const dismissAuthPrompt = useCallback(() => {
    dismissSyncAuthPrompt();
  }, []);

  const syncNow = useCallback(
    async (interactive = false): Promise<SyncNowResult> => {
      // Background sync requires both a client ID and an already signed-in Google account
      if (!getStoredClientId() || (!interactive && !getGoogleAccount())) {
        refreshStatus('skipped');
        return { synced: false };
      }
      setStatus((s) => ({ ...s, phase: 'syncing' }));
      try {
        const result = await runDriveSync({
          allowInteractive: interactive,
          force: interactive || isAutoSyncEnabled(),
        });
        if (result?.success) {
          setStatus(readSyncStatusSnapshot('ok'));
          return { synced: true };
        }
        setStatus(readSyncStatusSnapshot('skipped'));
        return { synced: false };
      } catch (err: unknown) {
        if (isPopupBlockedError(err) || isAuthInteractionError(err)) {
          setStatus(readSyncStatusSnapshot('idle'));
          return { synced: false, authBlocked: true };
        }
        // Silent background auth expiry shouldn't flag a scary error banner
        if (!interactive && isQuietSyncError(err)) {
          setStatus(readSyncStatusSnapshot('idle'));
          return { synced: false };
        }
        setStatus(readSyncStatusSnapshot('error'));
        return { synced: false, error: formatSyncErrorMessage(err) };
      }
    },
    [refreshStatus]
  );

  useEffect(() => {
    const staleError = getLastSyncError();
    if (staleError && isPopupBlockedError(staleError)) {
      clearSyncError();
      refreshStatus('idle');
    }

    const unsubscribeSyncStatus = subscribeSyncStatusChange(() => {
      setStatus(
        readSyncStatusSnapshot(
          isDriveSyncInflight() ? 'syncing' : getLastSyncError() ? 'error' : 'idle'
        )
      );
    });

    if (canAutoSync()) {
      void syncNow(false);
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!canAutoSync()) return;
      void syncNow(false);
    }, AUTO_SYNC_INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!canAutoSync()) return;
      const last = readSyncStatusSnapshot().lastSyncedAt;
      if (last && Date.now() - last < 2 * 60 * 1000) return;
      void syncNow(false);
    };
    document.addEventListener('visibilitychange', onVis);

    const onOnline = () => {
      if (!canAutoSync()) return;
      void syncNow(false);
    };
    window.addEventListener('online', onOnline);
    const unsubscribeSignOut = subscribeGoogleSignOut(() => {
      applyRemoteSignOut();
      cancelPendingAutoSync();
      setGoogleAccount(null);
      clearSyncWatermarkState();
      clearSyncAuthPrompt();
      clearSyncError();
      refreshStatus('idle');
    });

    return () => {
      unsubscribeSyncStatus();
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      unsubscribeSignOut();
    };
  }, [syncNow, refreshStatus]);

  return { status, syncNow, scheduleSync, refreshStatus, dismissAuthPrompt };
}
