import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUTO_SYNC_INTERVAL_MS,
  canAutoSync,
  isAutoSyncEnabled,
  isQuietSyncError,
  readSyncStatusSnapshot,
  runDriveSync,
  triggerDebouncedSync,
  type SyncPhase,
  type SyncStatusSnapshot,
} from '../sync/autoSync';
import {
  applyRemoteSignOut,
  getStoredClientId,
  subscribeGoogleSignOut,
} from '../sync/googleAuth';
import { getGoogleAccount, setGoogleAccount } from '../sync/googleAccount';

export function useAutoSync(onSynced?: () => void): {
  status: SyncStatusSnapshot;
  syncNow: (interactive?: boolean) => Promise<void>;
  scheduleSync: (delayMs?: number) => void;
  refreshStatus: () => void;
} {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const scheduleSync = useCallback((delayMs = 2000) => {
    triggerDebouncedSync(delayMs);
  }, []);

  const refreshStatus = useCallback((phase?: SyncPhase) => {
    setStatus(readSyncStatusSnapshot(phase ?? 'idle'));
  }, []);

  const syncNow = useCallback(
    async (interactive = false) => {
      // Background sync requires both a client ID and an already signed-in Google account
      if (!getStoredClientId() || (!interactive && !getGoogleAccount())) {
        refreshStatus('skipped');
        return;
      }
      setStatus((s) => ({ ...s, phase: 'syncing' }));
      try {
        const result = await runDriveSync({
          allowInteractive: interactive,
          force: interactive || isAutoSyncEnabled(),
        });
        if (result?.success) {
          setStatus(readSyncStatusSnapshot('ok'));
          onSyncedRef.current?.();
        } else {
          setStatus(readSyncStatusSnapshot('skipped'));
        }
      } catch (err: unknown) {
        // Silent background auth expiry shouldn't flag a scary error banner
        if (!interactive && isQuietSyncError(err)) {
          setStatus(readSyncStatusSnapshot('idle'));
        } else {
          setStatus(readSyncStatusSnapshot('error'));
        }
      }
    },
    [refreshStatus]
  );

  useEffect(() => {
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
      setGoogleAccount(null);
      refreshStatus('idle');
    });

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
      unsubscribeSignOut();
    };
  }, [syncNow, refreshStatus]);

  return { status, syncNow, scheduleSync, refreshStatus };
}
