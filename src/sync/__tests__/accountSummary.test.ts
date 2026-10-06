import { describe, it, expect } from 'vitest';
import { formatAgo, summarizeAccount } from '../accountSummary';
import type { SyncStatusSnapshot } from '../autoSync';

const snap = (p: Partial<SyncStatusSnapshot> = {}): SyncStatusSnapshot => ({
  phase: 'idle',
  lastSyncedAt: null,
  lastError: null,
  autoSyncEnabled: true,
  account: null,
  ...p,
});

describe('account summary (drawer header / settings account)', () => {
  it('not signed in → amber call to action', () => {
    expect(summarizeAccount(null, snap(), false)).toEqual({
      title: 'Not signed in',
      subtitle: 'Sign in to sync with Drive',
      warn: true,
    });
  });

  it('signed in → email + synced time', () => {
    const now = Date.now();
    const s = summarizeAccount({ email: 'brad@example.com' }, snap({ lastSyncedAt: now - 5 * 60_000 }), true);
    expect(s.title).toBe('brad@example.com');
    expect(s.subtitle).toBe('Synced 5m ago');
    expect(s.warn).toBe(false);
  });

  it('errors and syncing states', () => {
    expect(summarizeAccount({ email: 'a@b.c' }, snap({ phase: 'error', lastSyncedAt: 1 }), true).warn).toBe(true);
    expect(summarizeAccount({ email: 'a@b.c' }, snap({ phase: 'syncing' }), true).subtitle).toBe('Syncing…');
    expect(summarizeAccount(null, snap({ lastSyncedAt: 1, autoSyncEnabled: false }), true).subtitle).toMatch(/auto-sync off$/);
  });

  it('formats relative times', () => {
    expect(formatAgo(1000, 1000 + 30_000)).toBe('just now');
    expect(formatAgo(0, 3 * 3600_000)).toBe('3h ago');
    expect(formatAgo(0, 2 * 86400_000)).toBe('2d ago');
  });
});
