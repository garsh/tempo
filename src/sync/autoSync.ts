import {
  ensureGoogleAccessToken,
  getStoredClientId,
  loadGoogleScript,
} from './googleAuth';
import { syncWithGoogleDrive, type DriveSyncResult } from './googleDrive';

const LAST_SYNC_KEY = 'tempo_last_synced_at';
const AUTO_SYNC_KEY = 'tempo_auto_sync_enabled';
const LAST_ERROR_KEY = 'tempo_last_sync_error';

/** Default interval for background sync while the app is open. */
export const AUTO_SYNC_INTERVAL_MS = 10 * 60 * 1000;

export type SyncPhase = 'idle' | 'syncing' | 'ok' | 'error' | 'skipped';

export interface SyncStatusSnapshot {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  lastError: string | null;
  autoSyncEnabled: boolean;
}

export function isAutoSyncEnabled(): boolean {
  const v = localStorage.getItem(AUTO_SYNC_KEY);
  // Default on when client id exists; explicit '0' disables
  if (v === '0') return false;
  if (v === '1') return true;
  return Boolean(getStoredClientId());
}

export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(AUTO_SYNC_KEY, enabled ? '1' : '0');
}

export function getLastSyncedAt(): number | null {
  const raw = localStorage.getItem(LAST_SYNC_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function getLastSyncError(): string | null {
  return localStorage.getItem(LAST_ERROR_KEY);
}

export function recordSyncSuccess(syncedAt: number): void {
  localStorage.setItem(LAST_SYNC_KEY, String(syncedAt));
  localStorage.removeItem(LAST_ERROR_KEY);
}

export function recordSyncError(message: string): void {
  localStorage.setItem(LAST_ERROR_KEY, message);
}

export function readSyncStatusSnapshot(phase: SyncPhase = 'idle'): SyncStatusSnapshot {
  return {
    phase,
    lastSyncedAt: getLastSyncedAt(),
    lastError: getLastSyncError(),
    autoSyncEnabled: isAutoSyncEnabled(),
  };
}

let inflight: Promise<DriveSyncResult | null> | null = null;

/**
 * Run a Drive sync if a client ID is configured.
 * Silent by default (no OAuth popup). Interactive when allowInteractive.
 * Dedupes concurrent calls.
 */
export async function runDriveSync(opts: {
  allowInteractive?: boolean;
  force?: boolean;
} = {}): Promise<DriveSyncResult | null> {
  const clientId = getStoredClientId();
  if (!clientId) return null;
  if (!opts.force && !isAutoSyncEnabled() && !opts.allowInteractive) return null;

  if (inflight) return inflight;

  inflight = (async () => {
    try {
      await loadGoogleScript();
      const token = await ensureGoogleAccessToken(clientId, {
        allowInteractive: opts.allowInteractive === true,
      });
      const result = await syncWithGoogleDrive(token);
      if (result.success) {
        recordSyncSuccess(result.syncedAt);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Silent failures (popup_closed / interaction_required) stay quiet for background
      const quiet =
        /popup_closed|access_denied|interaction_required|user_closed|Token request failed/i.test(
          message
        );
      if (!quiet || opts.allowInteractive) {
        recordSyncError(message);
      }
      throw err;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}
