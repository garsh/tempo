import { db } from '../db/db';
import { mergeTasks } from '../domain/merge';
import type { PeriodicTask, SyncData } from '../types/task';

const BACKUP_FILENAME = 'tempo_backup.json';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';

export interface DriveSyncResult {
  success: boolean;
  tasksCount: number;
  syncedAt: number;
  error?: string;
}

/**
 * Search or create the tempo_backup.json file inside user's appDataFolder
 */
export async function getOrCreateAppDataFile(accessToken: string): Promise<string> {
  const query = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const searchRes = await fetch(
    `${DRIVE_API_URL}/files?spaces=appDataFolder&q=${query}&fields=files(id,name)`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
    }
  );

  if (!searchRes.ok) {
    throw new Error(`Drive search failed: ${searchRes.statusText}`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // Create file in appDataFolder
  const createRes = await fetch(`${DRIVE_API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: BACKUP_FILENAME,
      parents: ['appDataFolder'],
    }),
  });

  if (!createRes.ok) {
    throw new Error(`Failed to create backup file in Drive: ${createRes.statusText}`);
  }

  const createdFile = await createRes.json();
  return createdFile.id;
}

/**
 * Download remote backup from Google Drive
 */
export async function downloadDriveBackup(
  fileId: string,
  accessToken: string
): Promise<{ data: SyncData | null; etag: string | null }> {
  const res = await fetch(`${DRIVE_API_URL}/files/${fileId}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404 || res.headers.get('content-length') === '0') {
    return { data: null, etag: res.headers.get('ETag') };
  }

  if (!res.ok) {
    throw new Error(`Failed to download backup: ${res.statusText}`);
  }

  const text = await res.text();
  if (!text || text.trim() === '') {
    return { data: null, etag: res.headers.get('ETag') };
  }

  try {
    const data: SyncData = JSON.parse(text);
    return { data, etag: res.headers.get('ETag') };
  } catch {
    return { data: null, etag: res.headers.get('ETag') };
  }
}

/**
 * Upload merged payload to Google Drive
 */
export async function uploadDriveBackup(
  fileId: string,
  accessToken: string,
  data: SyncData,
  etag?: string | null
): Promise<void> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json',
  };

  if (etag) {
    headers['If-Match'] = etag;
  }

  const res = await fetch(`${UPLOAD_API_URL}/files/${fileId}?uploadType=media`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify(data, null, 2),
  });

  if (!res.ok) {
    throw new Error(`Failed to upload to Drive: ${res.status} ${res.statusText}`);
  }
}

/**
 * High-level Sync function: Fetch remote -> Merge with local -> Save locally -> Upload remote
 */
export async function syncWithGoogleDrive(accessToken: string): Promise<DriveSyncResult> {
  const fileId = await getOrCreateAppDataFile(accessToken);
  const { data: remoteData, etag } = await downloadDriveBackup(fileId, accessToken);

  const localTasks = await db.tasks.toArray();
  const remoteTasks: PeriodicTask[] = remoteData?.tasks || [];

  const merged = mergeTasks(localTasks, remoteTasks);

  // Write merged tasks to IndexedDB
  await db.tasks.bulkPut(merged);

  const now = Date.now();
  const syncPayload: SyncData = {
    version: 1,
    exportedAt: now,
    tasks: merged,
  };

  // Upload back to Drive
  await uploadDriveBackup(fileId, accessToken, syncPayload, etag);

  return {
    success: true,
    tasksCount: merged.length,
    syncedAt: now,
  };
}
