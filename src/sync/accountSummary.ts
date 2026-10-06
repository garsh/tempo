import type { GoogleAccount } from './googleAccount';
import type { SyncStatusSnapshot } from './autoSync';

/** "just now" / "5m ago" / "3h ago" / "2d ago". */
export function formatAgo(ts: number, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - ts) / 1000));
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export interface AccountSummary {
  title: string;
  subtitle: string;
  /** Amber call-to-action (like TickTick's "Verify the email"). */
  warn: boolean;
}

/** Drawer + Settings account line from the cached Drive account and sync status. */
export function summarizeAccount(
  account: GoogleAccount | null,
  status: SyncStatusSnapshot,
  hasClientId: boolean
): AccountSummary {
  const title = account?.email ?? (status.lastSyncedAt ? 'Google Drive' : 'Not signed in');
  if (status.phase === 'syncing') return { title, subtitle: 'Syncing…', warn: false };
  if (status.phase === 'error' || (status.lastError && !status.lastSyncedAt)) {
    return { title, subtitle: 'Sync failed — tap to fix', warn: true };
  }
  if (!hasClientId && !account) return { title, subtitle: 'Sign in to sync with Drive', warn: true };
  if (!status.lastSyncedAt) return { title, subtitle: 'Tap to sign in & sync', warn: true };
  return {
    title,
    subtitle: `Synced ${formatAgo(status.lastSyncedAt)}${status.autoSyncEnabled ? '' : ' · auto-sync off'}`,
    warn: false,
  };
}
