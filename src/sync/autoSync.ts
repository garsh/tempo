import {
  AuthOfflineError,
  ensureGoogleAccessToken,
  getAuthGeneration,
  getCachedAccessToken,
  getStoredClientId,
  isAuthInteractionError,
  isGoogleScriptLoaded,
  isPopupBlockedError,
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

export type SyncAuthPromptReason =
  | 'popup_blocked'
  | 'popup_blocked_interactive'
  | 'auth_required';

export interface SyncAuthPromptState {
  reason: SyncAuthPromptReason;
  dismissed: boolean;
}

export interface SyncStatusSnapshot {
  phase: SyncPhase;
  lastSyncedAt: number | null;
  lastError: string | null;
  autoSyncEnabled: boolean;
  account: GoogleAccount | null;
  authPrompt?: SyncAuthPromptState | null;
}

let syncAuthPrompt: SyncAuthPromptState | null = null;
const syncListeners = new Set<() => void>();

function notifySyncListeners(): void {
  for (const listener of syncListeners) {
    listener();
  }
}

export function getSyncAuthPrompt(): SyncAuthPromptState | null {
  return syncAuthPrompt;
}

function setSyncAuthPrompt(next: SyncAuthPromptState | null): void {
  if (
    syncAuthPrompt?.reason === next?.reason &&
    syncAuthPrompt?.dismissed === next?.dismissed
  ) {
    return;
  }
  syncAuthPrompt = next;
  notifySyncListeners();
}

export function dismissSyncAuthPrompt(): void {
  if (!syncAuthPrompt || syncAuthPrompt.dismissed) return;
  syncAuthPrompt = { ...syncAuthPrompt, dismissed: true };
  notifySyncListeners();
}

export function clearSyncAuthPrompt(): void {
  if (!syncAuthPrompt) return;
  syncAuthPrompt = null;
  notifySyncListeners();
}

export function subscribeSyncStatusChange(listener: () => void): () => void {
  syncListeners.add(listener);
  return () => {
    syncListeners.delete(listener);
  };
}

export function formatSyncErrorMessage(err: unknown): string {
  if (isPopupBlockedError(err)) {
    return 'Popups are blocked by your browser. Allow popups for this site, then try again.';
  }
  return err instanceof Error ? err.message : String(err);
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
  notifySyncListeners();
}

export function recordSyncError(message: string): void {
  localStorage.setItem(LAST_ERROR_KEY, message);
  notifySyncListeners();
}

export function clearSyncError(): void {
  localStorage.removeItem(LAST_ERROR_KEY);
  notifySyncListeners();
}

export function readSyncStatusSnapshot(phase: SyncPhase = 'idle'): SyncStatusSnapshot {
  return {
    phase,
    lastSyncedAt: getLastSyncedAt(),
    lastError: getLastSyncError(),
    autoSyncEnabled: isAutoSyncEnabled(),
    account: getGoogleAccount(),
    authPrompt: syncAuthPrompt,
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

export function isDriveSyncInflight(): boolean {
  return inflight !== null;
}

const QUIET_SYNC_ERROR_RE =
  /popup_closed|access_denied|interaction_required|user_logged_out|user_closed|Token request failed|Offline; sync paused|failed to fetch|networkerror|offline/i;

export function isQuietSyncError(err: unknown): boolean {
  if (err instanceof AuthOfflineError) return true;
  if (isPopupBlockedError(err) || isAuthInteractionError(err)) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const message = err instanceof Error ? err.message : String(err);
  return QUIET_SYNC_ERROR_RE.test(message);
}

function clearStalePopupError(): void {
  const existing = getLastSyncError();
  if (existing && isPopupBlockedError(existing)) {
    clearSyncError();
  }
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
  if (!opts.allowInteractive && !getCachedAccessToken() && syncAuthPrompt) return null;

  if (inflight) {
    queuedSync = true;
    return inflight;
  }

  inflight = (async () => {
    const generation = getAuthGeneration();
    const signedOut = () => generation !== getAuthGeneration();
    try {
      if (!isGoogleScriptLoaded()) {
        await loadGoogleScript();
        if (signedOut()) return null;
      }
      const token = await ensureGoogleAccessToken(clientId, {
        allowInteractive: opts.allowInteractive === true,
        hint: getGoogleAccount()?.email,
      });
      if (signedOut()) return null;
      await refreshGoogleAccount(token);
      if (signedOut()) return null;
      const result = await syncWithGoogleDrive(token);
      if (signedOut()) return null;
      if (result.success) {
        syncAuthPrompt = null;
        recordSyncSuccess(result.syncedAt);
        await refreshGoogleAccount(token);
      }
      return result;
    } catch (err) {
      if (signedOut()) return null;
      const message = err instanceof Error ? err.message : String(err);
      if (!opts.allowInteractive) {
        if (isPopupBlockedError(err)) {
          clearStalePopupError();
          if (getGoogleAccount()) {
            setSyncAuthPrompt({
              reason: 'popup_blocked',
              dismissed:
                syncAuthPrompt?.reason === 'popup_blocked' ? syncAuthPrompt.dismissed : false,
            });
          }
          return null;
        }
        if (isAuthInteractionError(err)) {
          clearStalePopupError();
          if (getGoogleAccount()) {
            setSyncAuthPrompt({
              reason: 'auth_required',
              dismissed:
                syncAuthPrompt?.reason === 'auth_required' ? syncAuthPrompt.dismissed : false,
            });
          }
          return null;
        }
        // Silent failures and offline reloads stay quiet. The cached account is kept.
        if (isQuietSyncError(err)) return null;
      } else {
        if (isPopupBlockedError(err)) {
          clearStalePopupError();
          if (getGoogleAccount()) {
            setSyncAuthPrompt({ reason: 'popup_blocked_interactive', dismissed: false });
          }
          throw err;
        }
        if (isAuthInteractionError(err)) {
          clearStalePopupError();
          if (getGoogleAccount()) {
            setSyncAuthPrompt({ reason: 'auth_required', dismissed: false });
          }
          throw err;
        }
      }
      recordSyncError(message);
      throw err;
    } finally {
      inflight = null;
      if (queuedSync) {
        queuedSync = false;
        if (!syncAuthPrompt) {
          triggerDebouncedSync(1000);
        }
      }
      notifySyncListeners();
    }
  })();

  return inflight;
}
