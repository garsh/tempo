import { describe, expect, it } from 'vitest';
import { driveFileResourcePath, isSafeDriveFileId, selectBackupFileId } from '../googleDrive';

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
});
