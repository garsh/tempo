import { db, ensureInboxList } from '../db/db';
import { recordDiagEvent } from '../domain/diagnostics';
import { mergeFolders, mergeLists, mergeTasks } from '../domain/merge';
import {
  compactSyncData,
  MAX_SYNC_BYTES,
  parseSyncPayload,
  readResponseTextCapped,
  SyncPayloadError,
  utf8ByteLength,
} from '../domain/syncPayload';
import type { Folder, SyncData, Task, TaskList } from '../types/task';

const BACKUP_FILENAME = 'tempo_backup.json';
const DRIVE_API_URL = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API_URL = 'https://www.googleapis.com/upload/drive/v3';
const DRIVE_FILE_ID_KEY = 'tempo_drive_backup_file_id';
const DRIVE_FILE_ID_RE = /^[A-Za-z0-9_-]+$/;

/** Use Google Drive's resumable upload protocol above 4 MB (simple media upload limit is 5 MB). */
export const SIMPLE_UPLOAD_MAX_BYTES = 4 * 1024 * 1024;

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

export function isSafeDriveFileId(id: string): boolean {
  return DRIVE_FILE_ID_RE.test(id);
}

/**
 * Keep using the remembered file when it is still in the list.
 * Otherwise use the newest safe id. Never deletes the extras.
 * `idsNewestFirst` must already be ordered by modifiedTime descending.
 */
export function selectBackupFileId(remembered: string | null, idsNewestFirst: string[]): string | null {
  const safe = idsNewestFirst.filter(isSafeDriveFileId);
  if (remembered && isSafeDriveFileId(remembered) && safe.includes(remembered)) return remembered;
  return safe[0] ?? null;
}

/**
 * Order Drive file metadata objects newest-first by `modifiedTime` descending.
 * Entries without a valid timestamp are sorted after dated ones, preserving order on ties.
 */
export function orderBackupFileIdsNewestFirst(
  files: ReadonlyArray<{ id?: string; modifiedTime?: string }>
): string[] {
  const parseModifiedMs = (value: string | undefined): number => {
    if (!value) return -Infinity;
    const ms = Date.parse(value);
    return Number.isNaN(ms) ? -Infinity : ms;
  };
  return [...files]
    .sort((a, b) => {
      const aTime = parseModifiedMs(a.modifiedTime);
      const bTime = parseModifiedMs(b.modifiedTime);
      if (aTime === bTime) return 0;
      return bTime > aTime ? 1 : -1;
    })
    .map((file) => file.id ?? '');
}

function readRememberedFileId(): string | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(DRIVE_FILE_ID_KEY);
  } catch {
    return null;
  }
}

function rememberFileId(fileId: string): void {
  try {
    if (typeof localStorage === 'undefined') return;
    localStorage.setItem(DRIVE_FILE_ID_KEY, fileId);
  } catch {
    /* private mode */
  }
}

export function driveFileResourcePath(fileId: string): string {
  if (!isSafeDriveFileId(fileId)) throw new Error('Invalid Drive file id');
  return `/files/${encodeURIComponent(fileId)}`;
}

export async function getOrCreateAppDataFile(accessToken: string): Promise<string> {
  const query = encodeURIComponent(`name='${BACKUP_FILENAME}' and trashed=false`);
  const fields = 'files(id,name,modifiedTime)';
  const searchUrl =
    `${DRIVE_API_URL}/files?spaces=appDataFolder&q=${query}&orderBy=modifiedTime desc&pageSize=10&fields=${fields}`;
  let searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  // Some Drive views reject orderBy. Fall back so sync still finds the file.
  if (searchRes.status === 400) {
    searchRes = await fetch(
      `${DRIVE_API_URL}/files?spaces=appDataFolder&q=${query}&pageSize=10&fields=${fields}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
  }

  if (!searchRes.ok) {
    throw new Error(`Drive search failed: ${searchRes.statusText}`);
  }

  const searchData = (await searchRes.json()) as {
    files?: { id?: string; modifiedTime?: string }[];
  };
  const ids = orderBackupFileIdsNewestFirst(searchData.files ?? []);
  const chosen = selectBackupFileId(readRememberedFileId(), ids);
  if (chosen) {
    rememberFileId(chosen);
    recordDiagEvent('drive_file', `chosen=${chosen} matches=${ids.filter(isSafeDriveFileId).length}`);
    return chosen;
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

  const createdFile = (await createRes.json()) as { id?: string };
  if (!createdFile.id || !isSafeDriveFileId(createdFile.id)) {
    throw new Error('Drive returned an invalid file id');
  }
  rememberFileId(createdFile.id);
  recordDiagEvent('drive_file', `created=${createdFile.id}`);
  return createdFile.id;
}

export async function downloadDriveBackup(
  fileId: string,
  accessToken: string
): Promise<{ data: SyncData | null; etag: string | null }> {
  const res = await fetch(`${DRIVE_API_URL}${driveFileResourcePath(fileId)}?alt=media`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (res.status === 404 || res.headers.get('content-length') === '0') {
    return { data: null, etag: res.headers.get('ETag') };
  }

  if (!res.ok) {
    throw new Error(`Failed to download backup: ${res.statusText}`);
  }

  let text: string;
  try {
    text = await readResponseTextCapped(res, MAX_SYNC_BYTES);
  } catch (err) {
    if (err instanceof SyncPayloadError) {
      recordDiagEvent('drive_download_rejected', err.message);
    }
    throw err;
  }
  if (!text || text.trim() === '') {
    return { data: null, etag: res.headers.get('ETag') };
  }

  try {
    const parsed = parseSyncPayload(text);
    const data: SyncData = {
      version: SYNC_VERSION,
      exportedAt: parsed.exportedAt ?? Date.now(),
      tasks: parsed.tasks,
      lists: parsed.lists,
      folders: parsed.folders,
    };
    return { data, etag: res.headers.get('ETag') };
  } catch (err) {
    // Do not replace a rejected backup with a local upload.
    if (err instanceof SyncPayloadError) {
      recordDiagEvent('drive_download_rejected', err.message);
      throw err;
    }
    return { data: null, etag: res.headers.get('ETag') };
  }
}

function isSafeDriveUploadUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'www.googleapis.com' &&
      url.pathname.startsWith('/upload/drive/v3/')
    );
  } catch {
    return false;
  }
}

function checkUploadResponse(res: Response): void {
  if (res.status === 412) {
    throw new DriveConflictError();
  }
  if (!res.ok) {
    throw new Error(`Failed to upload to Drive: ${res.status} ${res.statusText}`);
  }
}

export async function uploadDriveBackup(
  fileId: string,
  accessToken: string,
  data: SyncData,
  etag?: string | null
): Promise<string | null> {
  const bodyText = JSON.stringify(compactSyncData(data));
  const byteLen = utf8ByteLength(bodyText);
  const filePath = driveFileResourcePath(fileId);

  if (byteLen <= SIMPLE_UPLOAD_MAX_BYTES) {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
    if (etag) {
      headers['If-Match'] = etag;
    }

    const res = await fetch(`${UPLOAD_API_URL}${filePath}?uploadType=media`, {
      method: 'PATCH',
      headers,
      body: bodyText,
    });
    checkUploadResponse(res);
    recordDiagEvent('drive_upload', `bytes=${byteLen} mode=media`);
    return res.headers.get('ETag');
  }

  const initHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'Content-Type': 'application/json; charset=UTF-8',
    'X-Upload-Content-Type': 'application/json',
    'X-Upload-Content-Length': String(byteLen),
  };
  if (etag) {
    initHeaders['If-Match'] = etag;
  }

  const initRes = await fetch(`${UPLOAD_API_URL}${filePath}?uploadType=resumable`, {
    method: 'PATCH',
    headers: initHeaders,
    body: '{}',
  });
  checkUploadResponse(initRes);

  const uploadUrl = initRes.headers.get('Location');
  if (!uploadUrl || !isSafeDriveUploadUrl(uploadUrl)) {
    throw new Error('Failed to upload to Drive: invalid resumable upload URL');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: bodyText,
  });
  checkUploadResponse(putRes);
  recordDiagEvent('drive_upload', `bytes=${byteLen} mode=resumable`);
  return putRes.headers.get('ETag');
}

function getChangedEntities<T extends { id: string }>(local: T[], merged: T[]): T[] {
  const localMap = new Map(local.map((item) => [item.id, item]));
  return merged.filter((item) => {
    const existing = localMap.get(item.id);
    if (!existing) return true;
    return JSON.stringify(existing) !== JSON.stringify(item);
  });
}

async function mergeRemoteIntoLocal(remoteData: SyncData | null): Promise<{
  tasks: Task[];
  lists: TaskList[];
  folders: Folder[];
}> {
  const remoteTasks: Task[] = remoteData?.tasks || [];
  const remoteLists: TaskList[] = remoteData?.lists || [];
  const remoteFolders: Folder[] = remoteData?.folders || [];

  return await db.transaction('rw', db.tasks, db.lists, db.folders, async () => {
    const [localTasks, localLists, localFolders] = await Promise.all([
      db.tasks.toArray(),
      db.lists.toArray(),
      db.folders.toArray(),
    ]);

    const mergedTasks = mergeTasks(localTasks, remoteTasks);
    const mergedLists = mergeLists(localLists, remoteLists);
    const mergedFolders = mergeFolders(localFolders, remoteFolders);

    const tasksToPut = getChangedEntities(localTasks, mergedTasks);
    const listsToPut = getChangedEntities(localLists, mergedLists);
    const foldersToPut = getChangedEntities(localFolders, mergedFolders);

    if (tasksToPut.length > 0) await db.tasks.bulkPut(tasksToPut);
    if (listsToPut.length > 0) await db.lists.bulkPut(listsToPut);
    if (foldersToPut.length > 0) await db.folders.bulkPut(foldersToPut);

    await ensureInboxList();
    recordDiagEvent(
      'drive_sync',
      `local=${localTasks.length} remote=${remoteTasks.length} merged=${mergedTasks.length} updatedTasks=${tasksToPut.length}`
    );

    return {
      tasks: mergedTasks,
      lists: await db.lists.toArray(),
      folders: mergedFolders,
    };
  });
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
    };

    await uploadDriveBackup(fileId, accessToken, syncPayload, etag);

    return {
      success: true,
      tasksCount: merged.tasks.length,
      listsCount: merged.lists.length,
      foldersCount: merged.folders.length,
      filtersCount: 0,
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
