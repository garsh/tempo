import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SyncData, Task } from '../../types/task';

vi.mock('../../db/db', () => ({
  db: {
    transaction: vi.fn(async (...args: unknown[]) => {
      const cb = args[args.length - 1] as () => Promise<unknown>;
      return cb();
    }),
    tasks: {
      toArray: vi.fn().mockResolvedValue([]),
      bulkPut: vi.fn(),
      bulkGet: vi.fn().mockResolvedValue([]),
      bulkDelete: vi.fn(),
    },
  },
}));

import { db } from '../../db/db';
import { TOMBSTONE_TTL_MS } from '../../domain/merge';
import {
  getOrCreateAppDataFile,
  downloadDriveBackup,
  uploadDriveBackup,
  DriveConflictError,
  SIMPLE_UPLOAD_MAX_BYTES,
  SYNC_VERSION,
  syncWithGoogleDrive,
} from '../googleDrive';
import { compactSyncData, SyncPayloadError, utf8ByteLength } from '../../domain/syncPayload';

function createMockStorage(initial: Record<string, string> = {}) {
  const store = new Map<string, string>(Object.entries(initial));
  return {
    store,
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => store.set(k, String(v)),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

function wireMockDbTables(seed: {
  tasks?: Task[];
}) {
  const wireTable = <T extends { id: string }>(table: unknown, initial: T[]) => {
    const map = new Map<string, T>(initial.map((item) => [item.id, structuredClone(item)]));
    const mockTable = table as {
      toArray: ReturnType<typeof vi.fn>;
      bulkPut: ReturnType<typeof vi.fn>;
      bulkGet: ReturnType<typeof vi.fn>;
      bulkDelete: ReturnType<typeof vi.fn>;
    };
    mockTable.toArray.mockImplementation(async () => Array.from(map.values()).map((x) => structuredClone(x)));
    mockTable.bulkPut.mockImplementation(async (items: T[]) => {
      for (const item of items) map.set(item.id, structuredClone(item));
    });
    mockTable.bulkGet.mockImplementation(async (ids: string[]) =>
      ids.map((id) => {
        const found = map.get(id);
        return found ? structuredClone(found) : undefined;
      })
    );
    mockTable.bulkDelete.mockImplementation(async (ids: string[]) => {
      for (const id of ids) map.delete(id);
    });
    return map;
  };

  return {
    tasks: wireTable(db.tasks, seed.tasks ?? []),
  };
}

describe('googleDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (db.tasks.toArray as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.tasks.bulkGet as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (db.tasks.bulkPut as ReturnType<typeof vi.fn>).mockReset();
    (db.tasks.bulkDelete as ReturnType<typeof vi.fn>).mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  describe('getOrCreateAppDataFile', () => {
    it('returns existing file id if tempo_backup.json is found in appDataFolder', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          files: [{ id: 'existing-file-id-123', name: 'tempo_backup.json' }],
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const fileId = await getOrCreateAppDataFile('test-access-token');
      expect(fileId).toBe('existing-file-id-123');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('spaces=appDataFolder'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-access-token' },
        })
      );
    });

    it('creates a new file in appDataFolder when search returns no files', async () => {
      const mockFetch = vi
        .fn()
        // 1st call: search returns empty list
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        // 2nd call: create returns new file object
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: 'newly-created-file-id' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const fileId = await getOrCreateAppDataFile('test-access-token');
      expect(fileId).toBe('newly-created-file-id');

      // Verify POST call
      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        'https://www.googleapis.com/drive/v3/files',
        expect.objectContaining({
          method: 'POST',
          headers: {
            Authorization: 'Bearer test-access-token',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: 'tempo_backup.json',
            parents: ['appDataFolder'],
          }),
        })
      );
    });

    it('throws when Drive search fails with non-ok status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        statusText: 'Forbidden',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(getOrCreateAppDataFile('bad-token')).rejects.toThrow(
        'Drive search failed: Forbidden'
      );
    });

    it('throws when file creation fails', async () => {
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          statusText: 'Internal Error',
        });
      vi.stubGlobal('fetch', mockFetch);

      await expect(getOrCreateAppDataFile('test-token')).rejects.toThrow(
        'Failed to create backup file in Drive: Internal Error'
      );
    });

    it('sorts unsorted fallback results by modifiedTime when orderBy is rejected with 400', async () => {
      const store = new Map<string, string>();
      vi.stubGlobal('localStorage', {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => store.set(k, v),
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({
            files: [
              { id: 'older-file', name: 'tempo_backup.json', modifiedTime: '2026-11-01T12:00:00.000Z' },
              { id: 'newest-file', name: 'tempo_backup.json', modifiedTime: '2026-11-23T12:00:00.000Z' },
              { id: 'middle-file', name: 'tempo_backup.json', modifiedTime: '2026-11-10T12:00:00.000Z' },
            ],
          }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const fileId = await getOrCreateAppDataFile('test-token');
      expect(fileId).toBe('newest-file');
      expect(store.get('tempo_drive_backup_file_id')).toBe('newest-file');
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('downloadDriveBackup', () => {
    it('downloads and parses JSON payload with ETag', async () => {
      const mockPayload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [{ id: 't1', title: 'Task 1', completionHistory: [], createdAt: 1, updatedAt: 1 }],
      };

      const mockHeaders = new Headers({ ETag: '"etag-version-1"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        text: async () => JSON.stringify(mockPayload),
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadDriveBackup('file-123', 'token-abc');
      expect(result.data).toEqual({ ...mockPayload, version: SYNC_VERSION });
      expect(result.etag).toBe('"etag-version-1"');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/file-123?alt=media',
        expect.objectContaining({ headers: { Authorization: 'Bearer token-abc' } })
      );
    });

    it('returns null data when file is not found (404)', async () => {
      const mockHeaders = new Headers();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        headers: mockHeaders,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadDriveBackup('file-123', 'token-abc');
      expect(result.data).toBeNull();
    });

    it('returns null data when file content length is 0 or text is empty', async () => {
      const mockHeaders = new Headers({ 'content-length': '0', ETag: '"empty"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        text: async () => '',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadDriveBackup('file-123', 'token-abc');
      expect(result.data).toBeNull();
      expect(result.etag).toBe('"empty"');
    });

    it('rejects corrupted JSON instead of treating the backup as empty', async () => {
      const mockHeaders = new Headers({ ETag: '"corrupt"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        text: async () => '{{{bad json text',
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(downloadDriveBackup('file-123', 'token-abc')).rejects.toThrow(SyncPayloadError);
    });

    it('throws error when response status is non-ok and not 404', async () => {
      const mockHeaders = new Headers();
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Server Error',
        headers: mockHeaders,
      });
      vi.stubGlobal('fetch', mockFetch);

      await expect(downloadDriveBackup('file-123', 'token-abc')).rejects.toThrow(
        'Failed to download backup: 500 Server Error'
      );
    });

    it('downloads and parses legacy pretty-printed backups larger than 5 MB', async () => {
      const bigNote = 'n'.repeat(9_000);
      const mockPayload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: Array.from({ length: 650 }, (_, i) => ({
          id: `t-${i}`,
          title: `Task ${i}`,
          notes: bigNote,
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
      };
      const prettyText = JSON.stringify(mockPayload, null, 2);
      expect(utf8ByteLength(prettyText)).toBeGreaterThan(5 * 1024 * 1024);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: '"big-etag"' }),
        text: async () => prettyText,
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadDriveBackup('file-123', 'token-abc');
      expect(result.data?.tasks).toHaveLength(650);
      expect(result.etag).toBe('"big-etag"');
    });
  });

  describe('uploadDriveBackup', () => {
    it('uploads data with PATCH and returns new ETag', async () => {
      const mockHeaders = new Headers({ ETag: '"etag-version-2"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [],
      };

      const newEtag = await uploadDriveBackup('file-123', 'token-abc', payload);
      expect(newEtag).toBe('"etag-version-2"');

      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/upload/drive/v3/files/file-123?uploadType=media',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer token-abc',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        })
      );
    });

    it('compacts tombstones and omits pretty-print whitespace and empty fields on upload', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: new Headers({ ETag: '"compact-etag"' }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [
          {
            id: 't1',
            title: 'Active',
            notes: '',
            dueAt: null,
            startDate: null,
            priority: 'none',
            pinned: false,
            subtasks: [],
            recurrence: null,
            completedAt: null,
            completionHistory: [],
            skippedDates: [],
            deletedAt: null,
            createdAt: 10,
            updatedAt: 20,
          },
          {
            id: 't2',
            title: 'Deleted task with secret notes',
            notes: 'x'.repeat(200),
            completionHistory: [100, 200],
            deletedAt: 50,
            createdAt: 10,
            updatedAt: 50,
          },
        ],
      };

      await uploadDriveBackup('file-123', 'token-abc', payload);

      const requestInit = mockFetch.mock.calls[0]?.[1] as RequestInit;
      const body = String(requestInit.body);
      expect(body).not.toContain('\n  ');
      expect(body).not.toContain('Deleted task with secret notes');
      expect(JSON.parse(body)).toEqual({
        version: 4,
        exportedAt: 123456,
        tasks: [
          {
            id: 't1',
            title: 'Active',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 20,
          },
          {
            id: 't2',
            title: '',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 50,
            deletedAt: 50,
          },
        ],
      });
    });

    it('uses two-step resumable upload when compacted payload exceeds SIMPLE_UPLOAD_MAX_BYTES', async () => {
      const sessionUri = 'https://www.googleapis.com/upload/drive/v3/files/file-123?uploadType=resumable&upload_id=session-1';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ Location: sessionUri }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"resumable-etag"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const bigNote = 'a'.repeat(10_000);
      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: Array.from({ length: 450 }, (_, i) => ({
          id: `t-${i}`,
          title: `Task ${i}`,
          notes: bigNote,
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
      };
      const expectedBody = JSON.stringify(compactSyncData(payload));
      expect(utf8ByteLength(expectedBody)).toBeGreaterThan(SIMPLE_UPLOAD_MAX_BYTES);

      const newEtag = await uploadDriveBackup('file-123', 'token-abc', payload, '"etag-v1"');
      expect(newEtag).toBe('"resumable-etag"');
      expect(mockFetch).toHaveBeenCalledTimes(2);

      expect(mockFetch).toHaveBeenNthCalledWith(
        1,
        'https://www.googleapis.com/upload/drive/v3/files/file-123?uploadType=resumable',
        expect.objectContaining({
          method: 'PATCH',
          headers: {
            Authorization: 'Bearer token-abc',
            'Content-Type': 'application/json; charset=UTF-8',
            'X-Upload-Content-Type': 'application/json',
            'X-Upload-Content-Length': String(utf8ByteLength(expectedBody)),
            'If-Match': '"etag-v1"',
          },
          body: '{}',
        })
      );

      expect(mockFetch).toHaveBeenNthCalledWith(
        2,
        sessionUri,
        expect.objectContaining({
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: expectedBody,
        })
      );
    });

    it('throws DriveConflictError on 412 during resumable init and rejects untrusted Location URLs', async () => {
      const bigNote = 'b'.repeat(10_000);
      const bigPayload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: Array.from({ length: 450 }, (_, i) => ({
          id: `t-${i}`,
          title: `Task ${i}`,
          notes: bigNote,
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
      };

      const conflictFetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 412,
        statusText: 'Precondition Failed',
        headers: new Headers(),
      });
      vi.stubGlobal('fetch', conflictFetch);
      await expect(
        uploadDriveBackup('file-123', 'token-abc', bigPayload, '"stale-etag"')
      ).rejects.toThrow(DriveConflictError);

      const evilLocationFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers({ Location: 'https://evil.example.com/upload/drive/v3/files/x' }),
      });
      vi.stubGlobal('fetch', evilLocationFetch);
      await expect(
        uploadDriveBackup('file-123', 'token-abc', bigPayload, '"etag-v1"')
      ).rejects.toThrow('Failed to upload to Drive: invalid resumable upload URL');
      expect(evilLocationFetch).toHaveBeenCalledTimes(1);
    });

    it('includes If-Match header when etag is provided', async () => {
      const mockHeaders = new Headers({ ETag: '"new-etag"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [],
      };

      await uploadDriveBackup('file-123', 'token-abc', payload, '"etag-v1"');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'If-Match': '"etag-v1"',
          }),
        })
      );
    });

    it('throws DriveConflictError when upload returns 412 Precondition Failed', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 412,
        statusText: 'Precondition Failed',
        headers: new Headers(),
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [],
      };

      await expect(
        uploadDriveBackup('file-123', 'token-abc', payload, '"stale-etag"')
      ).rejects.toThrow(DriveConflictError);
    });

    it('throws generic error when upload fails with non-412 status', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        headers: new Headers(),
      });
      vi.stubGlobal('fetch', mockFetch);

      const payload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [],
      };

      await expect(
        uploadDriveBackup('file-123', 'token-abc', payload)
      ).rejects.toThrow('Failed to upload to Drive: 503 Service Unavailable');
    });
  });

  describe('syncWithGoogleDrive', () => {
    it('runs full sync flow: gets fileId, downloads backup, merges, and uploads with ETag', async () => {
      wireMockDbTables({
        tasks: [
          {
            id: 'local-1',
            title: 'Local task',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 20,
          },
        ],
      });
      const mockFetch = vi
        .fn()
        // 1. getOrCreateAppDataFile search
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        // 2. downloadDriveBackup
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () =>
            JSON.stringify({
              version: 4,
              exportedAt: 100,
              tasks: [],
            }),
        })
        // 3. uploadDriveBackup
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v2"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.success).toBe(true);
      expect(result.tasksCount).toBe(1);
      expect(result.syncedAt).toBeGreaterThan(0);
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('skips uploadDriveBackup when remote and merged content signatures match', async () => {
      wireMockDbTables({
        tasks: [
          {
            id: 'same-1',
            title: 'Same task',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 20,
          },
        ],
      });
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () =>
            JSON.stringify({
              version: 4,
              exportedAt: 100,
              tasks: [
                {
                  id: 'same-1',
                  title: 'Same task',
                  completionHistory: [],
                  createdAt: 10,
                  updatedAt: 20,
                },
              ],
            }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.success).toBe(true);
      expect(result.tasksCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('retries once when upload encounters DriveConflictError (412)', async () => {
      wireMockDbTables({
        tasks: [
          {
            id: 'local-conflict',
            title: 'Local task',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 20,
          },
        ],
      });
      const mockFetch = vi
        .fn()
        // 1. getOrCreateAppDataFile search
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        // 2. downloadDriveBackup (1st attempt)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () => JSON.stringify({ version: 4, exportedAt: 100, tasks: [] }),
        })
        // 3. uploadDriveBackup (1st attempt -> 412 conflict)
        .mockResolvedValueOnce({
          ok: false,
          status: 412,
          statusText: 'Precondition Failed',
          headers: new Headers(),
        })
        // 4. downloadDriveBackup (2nd attempt retry)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v2"' }),
          text: async () => JSON.stringify({ version: 4, exportedAt: 200, tasks: [] }),
        })
        // 5. uploadDriveBackup (2nd attempt retry -> succeeds)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v3"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(5);
    });

    it('automatically prunes tombstones older than 30 days and updates local DB and watermark', async () => {
      const now = 1_795_461_688_588;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      const storage = createMockStorage();
      vi.stubGlobal('localStorage', storage);

      const expiredAt = now - TOMBSTONE_TTL_MS - 5 * 24 * 60 * 60 * 1000;
      const recentDelAt = now - 5 * 24 * 60 * 60 * 1000;
      const stores = wireMockDbTables({
        tasks: [
          {
            id: 'active-1',
            title: 'Active Task',
            completionHistory: [],
            createdAt: 100,
            updatedAt: now - 1000,
          },
          {
            id: 'old-del-task',
            title: '',
            completionHistory: [],
            createdAt: 100,
            updatedAt: expiredAt,
            deletedAt: expiredAt,
          },
          {
            id: 'recent-del-task',
            title: '',
            completionHistory: [],
            createdAt: 100,
            updatedAt: recentDelAt,
            deletedAt: recentDelAt,
          },
        ],
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () => JSON.stringify({ version: 4, exportedAt: 100, tasks: [] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v2"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.success).toBe(true);
      expect(result.tasksCount).toBe(2);

      const uploadedBody = JSON.parse(String((mockFetch.mock.calls[2]?.[1] as RequestInit).body));
      expect(uploadedBody.tombstonesPrunedBefore).toBe(now - TOMBSTONE_TTL_MS);
      expect(uploadedBody.tasks.map((t: Task) => t.id)).toEqual(['active-1', 'recent-del-task']);
      expect(uploadedBody).not.toHaveProperty('lists');
      expect(uploadedBody).not.toHaveProperty('folders');

      expect(Array.from(stores.tasks.keys())).toEqual(['active-1', 'recent-del-task']);
      expect(storage.store.get('tempo_tombstones_pruned_before')).toBe(String(now - TOMBSTONE_TTL_MS));
      expect(storage.store.get('tempo_last_synced_file_id')).toBe('drive-file-123');
    });

    it('drops stale active items on a previously synced device while keeping offline edits and honoring legacy drive file fallback', async () => {
      const lastSyncAt = 1_795_000_000_000;
      const pruneAt = 1_795_400_000_000;
      const now = 1_795_461_688_588;
      vi.useFakeTimers();
      vi.setSystemTime(now);

      const storage = createMockStorage({
        tempo_drive_backup_file_id: 'drive-file-123',
        tempo_last_synced_at: String(lastSyncAt),
      });
      vi.stubGlobal('localStorage', storage);

      const stores = wireMockDbTables({
        tasks: [
          {
            id: 'kept-task',
            title: 'Kept',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 100,
          },
          {
            id: 'stale-imported',
            title: 'Old TickTick Completed',
            completionHistory: [50],
            completedAt: 50,
            createdAt: 50,
            updatedAt: lastSyncAt - 1000,
          },
          {
            id: 'offline-edit',
            title: 'Edited Offline',
            completionHistory: [],
            createdAt: 10,
            updatedAt: lastSyncAt + 5000,
          },
          {
            id: 'old-tombstone',
            title: '',
            completionHistory: [],
            createdAt: 10,
            updatedAt: pruneAt - 100,
            deletedAt: pruneAt - 100,
          },
        ],
      });

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () =>
            JSON.stringify({
              version: 4,
              exportedAt: pruneAt,
              tombstonesPrunedBefore: pruneAt,
              tasks: [
                {
                  id: 'kept-task',
                  title: 'Kept',
                  completionHistory: [],
                  createdAt: 10,
                  updatedAt: 100,
                },
              ],
            }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v2"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.tasksCount).toBe(2);

      const uploadedBody = JSON.parse(String((mockFetch.mock.calls[2]?.[1] as RequestInit).body));
      expect(uploadedBody.tombstonesPrunedBefore).toBe(pruneAt);
      expect(uploadedBody.tasks.map((t: Task) => t.id)).toEqual(['kept-task', 'offline-edit']);
      expect(Array.from(stores.tasks.keys())).toEqual(['kept-task', 'offline-edit']);
    });

    it('waits until uploadDriveBackup succeeds before bulkDeleting pruned tombstones on 412 retry', async () => {
      const now = 1_795_461_688_588;
      vi.useFakeTimers();
      vi.setSystemTime(now);
      vi.stubGlobal('localStorage', createMockStorage());

      const expiredAt = now - TOMBSTONE_TTL_MS - 1000;
      const stores = wireMockDbTables({
        tasks: [
          {
            id: 'expired-tombstone',
            title: '',
            completionHistory: [],
            createdAt: 1,
            updatedAt: expiredAt,
            deletedAt: expiredAt,
          },
        ],
      });

      let sawTombstoneOnRetry = false;
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ files: [{ id: 'drive-file-123' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v1"' }),
          text: async () => JSON.stringify({ version: 4, exportedAt: 100, tasks: [] }),
        })
        .mockImplementationOnce(async () => {
          expect(stores.tasks.has('expired-tombstone')).toBe(true);
          return {
            ok: false,
            status: 412,
            statusText: 'Precondition Failed',
            headers: new Headers(),
          };
        })
        .mockImplementationOnce(async () => {
          sawTombstoneOnRetry = stores.tasks.has('expired-tombstone');
          return {
            ok: true,
            status: 200,
            headers: new Headers({ ETag: '"v2"' }),
            text: async () => JSON.stringify({ version: 4, exportedAt: 200, tasks: [] }),
          };
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          headers: new Headers({ ETag: '"v3"' }),
        });
      vi.stubGlobal('fetch', mockFetch);

      const result = await syncWithGoogleDrive('token-123');
      expect(result.success).toBe(true);
      expect(sawTombstoneOnRetry).toBe(true);
      expect(stores.tasks.has('expired-tombstone')).toBe(false);
    });
  });
});
