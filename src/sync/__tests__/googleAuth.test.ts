import { beforeEach, describe, expect, it, vi } from 'vitest';

function createStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (key: string) => map.get(key) ?? null,
    setItem: (key: string, value: string) => void map.set(key, String(value)),
    removeItem: (key: string) => void map.delete(key),
    clear: () => void map.clear(),
  };
}

const mockLocalStorage = createStorage();
const mockSessionStorage = createStorage();
(globalThis as unknown as { localStorage: unknown }).localStorage = mockLocalStorage;
(globalThis as unknown as { sessionStorage: unknown }).sessionStorage = mockSessionStorage;

import {
  clearStoredToken,
  getCachedAccessToken,
  getCustomClientId,
  getDefaultClientId,
  getStoredClientId,
  setStoredClientId,
  signOutGoogleSession,
  storeAccessToken,
} from '../googleAuth';

describe('googleAuth client id resolution', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
    clearStoredToken();
  });

  it('defaults to empty string when neither env nor custom id is set', () => {
    expect(getCustomClientId()).toBe('');
    expect(getStoredClientId()).toBe(getDefaultClientId());
  });

  it('stores and retrieves custom client id in localStorage', () => {
    setStoredClientId('custom-client-id.apps.googleusercontent.com');
    expect(getCustomClientId()).toBe('custom-client-id.apps.googleusercontent.com');
    expect(getStoredClientId()).toBe('custom-client-id.apps.googleusercontent.com');
  });

  it('removes custom client id when set to empty string', () => {
    setStoredClientId('custom-client-id.apps.googleusercontent.com');
    expect(getCustomClientId()).toBe('custom-client-id.apps.googleusercontent.com');

    setStoredClientId('   ');
    expect(getCustomClientId()).toBe('');
    expect(getStoredClientId()).toBe(getDefaultClientId());
  });

  it('refuses a client id that is not a Google web client id', () => {
    setStoredClientId('custom-client-id.apps.googleusercontent.com');
    expect(setStoredClientId('not-a-client')).toBe(false);
    expect(setStoredClientId('https://evil.example/stolen.apps.googleusercontent.com')).toBe(false);
    expect(getCustomClientId()).toBe('custom-client-id.apps.googleusercontent.com');
  });

  it('ignores a previously stored client id that does not match the suffix', () => {
    mockLocalStorage.setItem('tempo_google_client_id', 'not-a-client');
    expect(getCustomClientId()).toBe('');
    expect(getStoredClientId()).toBe(getDefaultClientId());
  });

  it('caches the access token in memory and does not write sessionStorage', () => {
    expect(getCachedAccessToken()).toBeNull();

    storeAccessToken('fake-token-123', 3600);
    expect(getCachedAccessToken()).toBe('fake-token-123');
    expect(mockSessionStorage.getItem('tempo_google_access_token')).toBeNull();

    clearStoredToken();
    expect(getCachedAccessToken()).toBeNull();
  });

  it('revokes the in-memory token on sign-out via GIS when the script is loaded', async () => {
    storeAccessToken('fake-token-123', 3600);
    const revoke = vi.fn((_token: string, done: () => void) => done());
    const previousWindow = (globalThis as { window?: unknown }).window;
    vi.stubGlobal('window', { google: { accounts: { oauth2: { revoke } } } });
    try {
      await signOutGoogleSession();
      expect(revoke).toHaveBeenCalledWith('fake-token-123', expect.any(Function));
      expect(getCachedAccessToken()).toBeNull();
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        vi.stubGlobal('window', previousWindow);
      }
    }
  });

  it('considers tokens expired if remaining lifetime is within the 60s skew window', () => {
    // Storing a token with 30s remaining lifetime (less than 60s skew)
    storeAccessToken('short-lived-token', 30);
    expect(getCachedAccessToken()).toBeNull();
  });

  it('returns token when expiration is well beyond the 60s skew window', () => {
    // Storing a token with 300s (5 minutes) remaining lifetime
    storeAccessToken('long-lived-token', 300);
    expect(getCachedAccessToken()).toBe('long-lived-token');
  });
});
