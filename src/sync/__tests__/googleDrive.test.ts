import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { SyncData } from '../../types/task';

vi.mock('../../db/db', () => ({
  db: {
    transaction: vi.fn(async (_mode, _t1, _t2, _t3, cb) => cb()),
    tasks: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn() },
    lists: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn() },
    folders: { toArray: vi.fn().mockResolvedValue([]), bulkPut: vi.fn() },
  },
  ensureInboxList: vi.fn().mockResolvedValue(undefined),
}));

import {
  getOrCreateAppDataFile,
  downloadDriveBackup,
  uploadDriveBackup,
  DriveConflictError,
  SIMPLE_UPLOAD_MAX_BYTES,
  syncWithGoogleDrive,
} from '../googleDrive';
import { compactSyncData, utf8ByteLength } from '../../domain/syncPayload';

describe('googleDrive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
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
  });

  describe('downloadDriveBackup', () => {
    it('downloads and parses JSON payload with ETag', async () => {
      const mockPayload: SyncData = {
        version: 4,
        exportedAt: 123456,
        tasks: [{ id: 't1', title: 'Task 1', listId: 'inbox', completionHistory: [], createdAt: 1, updatedAt: 1 }],
        lists: [],
        folders: [],
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
      expect(result.data).toEqual(mockPayload);
      expect(result.etag).toBe('"etag-version-1"');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/files/file-123?alt=media',
        { headers: { Authorization: 'Bearer token-abc' } }
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

    it('returns null data when payload is invalid/corrupted JSON', async () => {
      const mockHeaders = new Headers({ ETag: '"corrupt"' });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        headers: mockHeaders,
        text: async () => '{{{bad json text',
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await downloadDriveBackup('file-123', 'token-abc');
      expect(result.data).toBeNull();
      expect(result.etag).toBe('"corrupt"');
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
        'Failed to download backup: Server Error'
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
          listId: 'inbox',
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
        lists: [],
        folders: [],
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
        lists: [],
        folders: [],
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
            listId: 'inbox',
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
            listId: 'work',
            completionHistory: [100, 200],
            deletedAt: 50,
            createdAt: 10,
            updatedAt: 50,
          },
        ],
        lists: [{ id: 'inbox', name: 'Inbox', folderId: null, createdAt: 1, updatedAt: 1, deletedAt: null }],
        folders: [],
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
            listId: 'inbox',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 20,
          },
          {
            id: 't2',
            title: '',
            listId: 'work',
            completionHistory: [],
            createdAt: 10,
            updatedAt: 50,
            deletedAt: 50,
          },
        ],
        lists: [{ id: 'inbox', name: 'Inbox', createdAt: 1, updatedAt: 1 }],
        folders: [],
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
          listId: 'inbox',
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
        lists: [],
        folders: [],
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
          listId: 'inbox',
          completionHistory: [],
          createdAt: 1,
          updatedAt: 1,
        })),
        lists: [],
        folders: [],
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
        lists: [],
        folders: [],
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
        lists: [],
        folders: [],
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
        lists: [],
        folders: [],
      };

      await expect(
        uploadDriveBackup('file-123', 'token-abc', payload)
      ).rejects.toThrow('Failed to upload to Drive: 503 Service Unavailable');
    });
  });

  describe('syncWithGoogleDrive', () => {
    it('runs full sync flow: gets fileId, downloads backup, merges, and uploads with ETag', async () => {
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
              lists: [],
              folders: [],
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
      expect(result.tasksCount).toBe(0);
      expect(result.syncedAt).toBeGreaterThan(0);
    });

    it('retries once when upload encounters DriveConflictError (412)', async () => {
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
          text: async () => JSON.stringify({ version: 4, exportedAt: 100, tasks: [], lists: [], folders: [] }),
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
          text: async () => JSON.stringify({ version: 4, exportedAt: 200, tasks: [], lists: [], folders: [] }),
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
    });
  });
});
