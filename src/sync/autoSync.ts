import {
  AuthOfflineError,
  ensureGoogleAccessToken,
  getAuthGeneration,
  getStoredClientId,
  loadGoogleScript,
} from './googleAuth';
import { syncWithGoogleDrive, type DriveSyncResult } from './googleDrive';
import { fetchDriveAccount, getGoogleAccount, setGoogleAccount, type GoogleAccount } from './googleAccount';

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
  account: GoogleAccount | null;
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

export function clearSyncError(): void {
  localStorage.removeItem(LAST_ERROR_KEY);
}

export function readSyncStatusSnapshot(phase: SyncPhase = 'idle'): SyncStatusSnapshot {
  return {
    phase,
    lastSyncedAt: getLastSyncedAt(),
    lastError: getLastSyncError(),
    autoSyncEnabled: isAutoSyncEnabled(),
    account: getGoogleAccount(),
  };
}

/** Cache the Drive account (email/avatar) for the drawer + Settings. Never throws. */
export async function refreshGoogleAccount(accessToken: string): Promise<void> {
  const account = await fetchDriveAccount(accessToken);
  if (account) setGoogleAccount(account);
}

let inflight: Promise<DriveSyncResult | null> | null = null;
let queuedSync = false;
let syncDebounceTimer: ReturnType<typeof setTimeout> | null = null;

const QUIET_SYNC_ERROR_RE =
  /popup_closed|access_denied|interaction_required|user_logged_out|user_closed|Token request failed|Offline; sync paused|failed to fetch|networkerror|offline/i;

export function isQuietSyncError(err: unknown): boolean {
  if (err instanceof AuthOfflineError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : String(err);
  return QUIET_SYNC_ERROR_RE.test(message);
}

export function canAutoSync(): boolean {
  return Boolean(getStoredClientId() && isAutoSyncEnabled() && getGoogleAccount());
}

/**
 * Schedule a background Drive sync after a brief debounce period (e.g. after local edits).
 */
export function triggerDebouncedSync(delayMs = 2000): void {
  if (!canAutoSync()) return;
  if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
  syncDebounceTimer = setTimeout(() => {
    syncDebounceTimer = null;
    void runDriveSync();
  }, delayMs);
}

/**
 * Run a Drive sync if a client ID is configured.
 * Silent by default (no OAuth popup). Interactive when allowInteractive.
 * Dedupes concurrent calls and queues follow-up if called while in-flight.
 */
export async function runDriveSync(opts: {
  allowInteractive?: boolean;
  force?: boolean;
} = {}): Promise<DriveSyncResult | null> {
  const clientId = getStoredClientId();
  if (!clientId) return null;
  if (!opts.force && !isAutoSyncEnabled() && !opts.allowInteractive) return null;

  if (inflight) {
    queuedSync = true;
    return inflight;
  }

  inflight = (async () => {
    const generation = getAuthGeneration();
    const signedOut = () => generation !== getAuthGeneration();
    try {
      await loadGoogleScript();
      if (signedOut()) return null;
      const token = await ensureGoogleAccessToken(clientId, {
        allowInteractive: opts.allowInteractive === true,
      });
      if (signedOut()) return null;
      await refreshGoogleAccount(token);
      if (signedOut()) return null;
      const result = await syncWithGoogleDrive(token);
      if (signedOut()) return null;
      if (result.success) {
        recordSyncSuccess(result.syncedAt);
        await refreshGoogleAccount(token);
      }
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // Silent failures and offline reloads stay quiet. The cached account is kept.
      if (!opts.allowInteractive && isQuietSyncError(err)) return null;
      recordSyncError(message);
      throw err;
    } finally {
      inflight = null;
      if (queuedSync) {
        queuedSync = false;
        triggerDebouncedSync(1000);
      }
    }
  })();

  return inflight;
}
