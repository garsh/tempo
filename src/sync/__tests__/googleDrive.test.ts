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
  syncWithGoogleDrive,
} from '../googleDrive';

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
          body: JSON.stringify(payload, null, 2),
        })
      );
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
