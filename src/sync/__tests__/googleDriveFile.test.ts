import { describe, expect, it } from 'vitest';
import {
  driveFileResourcePath,
  isSafeDriveFileId,
  orderBackupFileIdsNewestFirst,
  selectBackupFileId,
} from '../googleDrive';

describe('Drive backup file id', () => {
  it('keeps the remembered id when it is still in the list', () => {
    expect(selectBackupFileId('older', ['newest', 'older', 'ancient'])).toBe('older');
  });

  it('uses the newest safe id when nothing is remembered', () => {
    expect(selectBackupFileId(null, ['newest', 'older'])).toBe('newest');
  });

  it('ignores ids that could change the request path', () => {
    expect(isSafeDriveFileId('abc-DEF_123')).toBe(true);
    expect(isSafeDriveFileId('foo/bar')).toBe(false);
    expect(isSafeDriveFileId('foo?alt=json')).toBe(false);
    expect(selectBackupFileId(null, ['foo/bar', 'foo?x', 'safeId'])).toBe('safeId');
    expect(() => driveFileResourcePath('foo/bar')).toThrow(/Invalid Drive file id/);
    expect(driveFileResourcePath('safeId')).toBe('/files/safeId');
  });

  it('picks the same id on a second pass', () => {
    const first = selectBackupFileId(null, ['newest', 'older']);
    expect(selectBackupFileId(first, ['newest', 'older'])).toBe(first);
    expect(selectBackupFileId(first, ['older', 'newest'])).toBe(first);
  });

  it('orders Drive files newest-first by modifiedTime client-side', () => {
    expect(
      orderBackupFileIdsNewestFirst([
        { id: 'older', modifiedTime: '2026-11-01T10:00:00.000Z' },
        { id: 'newest', modifiedTime: '2026-11-23T10:00:00.000Z' },
        { id: 'middle', modifiedTime: '2026-11-15T10:00:00.000Z' },
      ])
    ).toEqual(['newest', 'middle', 'older']);
  });

  it('places dated files before undated ones and preserves input order when modifiedTime is absent', () => {
    expect(
      orderBackupFileIdsNewestFirst([
        { id: 'undated-1' },
        { id: 'older', modifiedTime: '2026-11-01T10:00:00.000Z' },
        { id: 'invalid', modifiedTime: 'not-a-date' },
        { id: 'newest', modifiedTime: '2026-11-23T10:00:00.000Z' },
      ])
    ).toEqual(['newest', 'older', 'undated-1', 'invalid']);

    expect(
      orderBackupFileIdsNewestFirst([{ id: 'first' }, { id: 'second' }, { id: 'third' }])
    ).toEqual(['first', 'second', 'third']);
  });
});
