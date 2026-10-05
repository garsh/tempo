import { db, ensureInboxList } from '../db/db';
import { mergeFolders, mergeLists, mergeSavedFilters, mergeTasks } from '../domain/merge';
import type { Folder, SavedFilter, SyncData, Task, TaskList } from '../types/task';

const BACKUP_FILENAME = 'tempo_backup.json';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';

/** Sync payload version: Task + lists + folders + filters. */
export const SYNC_VERSION = 4;

export interface DriveSyncResult {
  success: boolean;
  tasksCount: number;
  listsCount: number;
  foldersCount: number;
  filtersCount: number;
  syncedAt: number;
  error?: string;
}

export class DriveConflictError extends Error {
  constructor(message = 'Drive upload conflict (412)') {
    super(message);
    this.name = 'DriveConflictError';
  }
}

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

export async function uploadDriveBackup(
  fileId: string,
  accessToken: string,
  data: SyncData,
  etag?: string | null
): Promise<string | null> {
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

  if (res.status === 412) {
    throw new DriveConflictError();
  }

  if (!res.ok) {
    throw new Error(`Failed to upload to Drive: ${res.status} ${res.statusText}`);
  }

  return res.headers.get('ETag');
}

async function mergeRemoteIntoLocal(remoteData: SyncData | null): Promise<{
  tasks: Task[];
  lists: TaskList[];
  folders: Folder[];
  filters: SavedFilter[];
}> {
  const localTasks = await db.tasks.toArray();
  const localLists = await db.lists.toArray();
  const localFolders = await db.folders.toArray();
  const localFilters = await db.savedFilters.toArray();
  const remoteTasks: Task[] = remoteData?.tasks || [];
  const remoteLists: TaskList[] = remoteData?.lists || [];
  const remoteFolders: Folder[] = remoteData?.folders || [];
  const remoteFilters: SavedFilter[] = remoteData?.savedFilters || [];

  const mergedTasks = mergeTasks(localTasks, remoteTasks);
  const mergedLists = mergeLists(localLists, remoteLists);
  const mergedFolders = mergeFolders(localFolders, remoteFolders);
  const mergedFilters = mergeSavedFilters(localFilters, remoteFilters);

  await db.transaction('rw', db.tasks, db.lists, db.folders, db.savedFilters, async () => {
    await db.tasks.bulkPut(mergedTasks);
    await db.lists.bulkPut(mergedLists);
    await db.folders.bulkPut(mergedFolders);
    await db.savedFilters.bulkPut(mergedFilters);
  });

  await ensureInboxList();

  return {
    tasks: mergedTasks,
    lists: await db.lists.toArray(),
    folders: await db.folders.toArray(),
    filters: await db.savedFilters.toArray(),
  };
}

/**
 * Full Drive sync with ETag / If-Match. On 412 conflict, re-download, re-merge, retry once.
 */
export async function syncWithGoogleDrive(accessToken: string): Promise<DriveSyncResult> {
  await ensureInboxList();

  const fileId = await getOrCreateAppDataFile(accessToken);

  const attempt = async (): Promise<DriveSyncResult> => {
    const { data: remoteData, etag } = await downloadDriveBackup(fileId, accessToken);
    const merged = await mergeRemoteIntoLocal(remoteData);

    const now = Date.now();
    const syncPayload: SyncData = {
      version: SYNC_VERSION,
      exportedAt: now,
      tasks: merged.tasks,
      lists: merged.lists,
      folders: merged.folders,
      savedFilters: merged.filters,
    };

    await uploadDriveBackup(fileId, accessToken, syncPayload, etag);

    return {
      success: true,
      tasksCount: merged.tasks.length,
      listsCount: merged.lists.length,
      foldersCount: merged.folders.length,
      filtersCount: merged.filters.length,
      syncedAt: now,
    };
  };

  try {
    return await attempt();
  } catch (err) {
    if (err instanceof DriveConflictError) {
      // Another client wrote — merge again and retry upload once
      return await attempt();
    }
    throw err;
  }
}
