const TOMBSTONES_PRUNED_BEFORE_KEY = 'tempo_tombstones_pruned_before';
const TOMBSTONES_PRUNED_FILE_ID_KEY = 'tempo_tombstones_pruned_file_id';
const LAST_SYNCED_FILE_ID_KEY = 'tempo_last_synced_file_id';
const LAST_SYNC_KEY = 'tempo_last_synced_at';
const DRIVE_FILE_ID_KEY = 'tempo_drive_backup_file_id';

function readStorage(key: string): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function writeStorage(key: string, value: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(key, value);
  } catch {
    /* private mode / unavailable storage */
  }
}

function removeStorage(key: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.removeItem(key);
  } catch {
    /* private mode / unavailable storage */
  }
}

/**
 * Read the local tombstone-pruned-before watermark (epoch ms), scoped to `fileId` when both
 * `fileId` and a stored file ID are non-empty. Returns 0 when absent or invalid.
 */
export function getTombstonesPrunedBefore(fileId?: string | null): number {
  const raw = readStorage(TOMBSTONES_PRUNED_BEFORE_KEY);
  if (!raw) return 0;
  const ts = Number(raw);
  if (!Number.isFinite(ts) || ts <= 0) return 0;

  const storedFileId = readStorage(TOMBSTONES_PRUNED_FILE_ID_KEY);
  if (fileId && storedFileId && storedFileId !== fileId) {
    return 0;
  }
  return ts;
}

/**
 * Advance and persist the tombstone-pruned-before watermark.
 * When `fileId` is provided, scopes the watermark to that Drive file; otherwise keeps any existing
 * scope or stores an unscoped `''` marker for the next sync.
 */
export function setTombstonesPrunedBefore(ts: number, fileId?: string | null): void {
  if (!Number.isFinite(ts) || ts <= 0) return;
  if (fileId) {
    const next = Math.max(getTombstonesPrunedBefore(fileId), ts);
    writeStorage(TOMBSTONES_PRUNED_BEFORE_KEY, String(next));
    writeStorage(TOMBSTONES_PRUNED_FILE_ID_KEY, fileId);
    return;
  }

  const next = Math.max(getTombstonesPrunedBefore(), ts);
  writeStorage(TOMBSTONES_PRUNED_BEFORE_KEY, String(next));
  if (readStorage(TOMBSTONES_PRUNED_FILE_ID_KEY) === null) {
    writeStorage(TOMBSTONES_PRUNED_FILE_ID_KEY, '');
  }
}

/**
 * Return this device's last successful sync timestamp for `fileId` so merge can tell stale
 * pre-prune local records apart from offline edits or newly restored backups.
 */
export function getLocalSyncedBeforeForFile(fileId: string, now = Date.now()): number | null {
  if (!fileId) return null;
  const rawAt = readStorage(LAST_SYNC_KEY);
  if (!rawAt) return null;
  const lastSyncedAt = Number(rawAt);
  if (!Number.isFinite(lastSyncedAt) || lastSyncedAt <= 0 || lastSyncedAt > now) {
    return null;
  }

  const stored = readStorage(LAST_SYNCED_FILE_ID_KEY);
  if (stored === '') return null;
  if (stored !== null) return stored === fileId ? lastSyncedAt : null;

  // Upgrade fallback for devices already synced prior to LAST_SYNCED_FILE_ID_KEY.
  const legacyFileId = readStorage(DRIVE_FILE_ID_KEY);
  return legacyFileId === fileId ? lastSyncedAt : null;
}

export function recordSyncedFile(fileId: string): void {
  if (!fileId) return;
  writeStorage(LAST_SYNCED_FILE_ID_KEY, fileId);
}

/**
 * Mark that a local JSON restore just occurred so the next Drive sync treats older restored
 * active tasks as new local state rather than stale deleted items.
 */
export function markLocalRestorePending(): void {
  writeStorage(LAST_SYNCED_FILE_ID_KEY, '');
}

export function clearSyncWatermarkState(): void {
  removeStorage(TOMBSTONES_PRUNED_BEFORE_KEY);
  removeStorage(TOMBSTONES_PRUNED_FILE_ID_KEY);
  removeStorage(LAST_SYNCED_FILE_ID_KEY);
  removeStorage(DRIVE_FILE_ID_KEY);
}
