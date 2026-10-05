import { useCallback, useEffect, useRef, useState } from 'react';
import {
  AUTO_SYNC_INTERVAL_MS,
  isAutoSyncEnabled,
  readSyncStatusSnapshot,
  runDriveSync,
  type SyncPhase,
  type SyncStatusSnapshot,
} from '../sync/autoSync';
import { getStoredClientId } from '../sync/googleAuth';

export function useAutoSync(onSynced?: () => void): {
  status: SyncStatusSnapshot;
  syncNow: (interactive?: boolean) => Promise<void>;
  refreshStatus: () => void;
} {
  const [status, setStatus] = useState<SyncStatusSnapshot>(() => readSyncStatusSnapshot());
  const onSyncedRef = useRef(onSynced);
  useEffect(() => {
    onSyncedRef.current = onSynced;
  }, [onSynced]);

  const refreshStatus = useCallback((phase?: SyncPhase) => {
    setStatus(readSyncStatusSnapshot(phase ?? 'idle'));
  }, []);

  const syncNow = useCallback(
    async (interactive = false) => {
      if (!getStoredClientId()) {
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
      } catch {
        setStatus(readSyncStatusSnapshot('error'));
      }
    },
    [refreshStatus]
  );

  useEffect(() => {
    if (getStoredClientId() && isAutoSyncEnabled()) {
      void syncNow(false);
    }

    const interval = setInterval(() => {
      if (document.visibilityState !== 'visible') return;
      if (!getStoredClientId() || !isAutoSyncEnabled()) return;
      void syncNow(false);
    }, AUTO_SYNC_INTERVAL_MS);

    const onVis = () => {
      if (document.visibilityState !== 'visible') return;
      if (!getStoredClientId() || !isAutoSyncEnabled()) return;
      const last = readSyncStatusSnapshot().lastSyncedAt;
      if (last && Date.now() - last < 2 * 60 * 1000) return;
      void syncNow(false);
    };
    document.addEventListener('visibilitychange', onVis);

    const onOnline = () => {
      if (!getStoredClientId() || !isAutoSyncEnabled()) return;
      void syncNow(false);
    };
    window.addEventListener('online', onOnline);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onOnline);
    };
  }, [syncNow]);

  return { status, syncNow, refreshStatus };
}
