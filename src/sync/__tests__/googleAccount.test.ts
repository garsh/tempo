import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import type { GoogleAccount } from '../googleAccount';
import { getGoogleAccount, setGoogleAccount, fetchDriveAccount } from '../googleAccount';

function createMockStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void store.clear(),
  };
}

describe('googleAccount', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', createMockStorage());
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getGoogleAccount & setGoogleAccount', () => {
    it('returns null when no account is stored', () => {
      expect(getGoogleAccount()).toBeNull();
    });

    it('stores and retrieves a valid Google account', () => {
      const account: GoogleAccount = {
        email: 'user@example.com',
        name: 'Jane Doe',
        photoUrl: 'https://lh3.googleusercontent.com/a/avatar',
      };
      setGoogleAccount(account);
      expect(getGoogleAccount()).toEqual(account);
    });

    it('clears stored account when setGoogleAccount is called with null', () => {
      setGoogleAccount({ email: 'user@example.com' });
      expect(getGoogleAccount()).not.toBeNull();

      setGoogleAccount(null);
      expect(getGoogleAccount()).toBeNull();
    });

    it('returns null when stored value is malformed JSON', () => {
      localStorage.setItem('tempo_google_account', '{not-valid-json');
      expect(getGoogleAccount()).toBeNull();
    });

    it('returns null when stored account object has no email or empty email', () => {
      localStorage.setItem('tempo_google_account', JSON.stringify({ name: 'No Email' }));
      expect(getGoogleAccount()).toBeNull();

      localStorage.setItem('tempo_google_account', JSON.stringify({ email: '' }));
      expect(getGoogleAccount()).toBeNull();
    });
  });

  describe('fetchDriveAccount', () => {
    it('fetches user info from Drive API and maps email, displayName, and photoLink', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: {
            emailAddress: 'syncuser@example.com',
            displayName: 'Sync User',
            photoLink: 'https://lh3.googleusercontent.com/a/photo123',
          },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const account = await fetchDriveAccount('valid-token-abc');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName,photoLink)',
        { headers: { Authorization: 'Bearer valid-token-abc' } }
      );
      expect(account).toEqual({
        email: 'syncuser@example.com',
        name: 'Sync User',
        photoUrl: 'https://lh3.googleusercontent.com/a/photo123',
      });
    });

    it('returns null when response is not ok', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
      });
      vi.stubGlobal('fetch', mockFetch);

      const account = await fetchDriveAccount('expired-token');
      expect(account).toBeNull();
    });

    it('returns null when user has no emailAddress in response', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          user: { displayName: 'Ghost User' },
        }),
      });
      vi.stubGlobal('fetch', mockFetch);

      const account = await fetchDriveAccount('valid-token-abc');
      expect(account).toBeNull();
    });

    it('returns null when fetch throws a network error', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new Error('Network offline'));
      vi.stubGlobal('fetch', mockFetch);

      const account = await fetchDriveAccount('valid-token-abc');
      expect(account).toBeNull();
    });
  });
});
