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
  ensureGoogleAccessToken,
  getCachedAccessToken,
  getCustomClientId,
  getDefaultClientId,
  getStoredClientId,
  isAuthInteractionError,
  isPopupBlockedError,
  loadGoogleScript,
  requestGoogleAccessToken,
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

  it('classifies popup_failed_to_open, popup_closed, and interaction_required errors', async () => {
    expect(isPopupBlockedError(new Error('Failed to open popup window'))).toBe(true);
    expect(isPopupBlockedError(new Error('popup_failed_to_open'))).toBe(true);
    expect(isAuthInteractionError(new Error('interaction_required'))).toBe(true);
    expect(isAuthInteractionError(new Error('popup_closed'))).toBe(true);

    const previousWindow = (globalThis as { window?: unknown }).window;
    const initTokenClient = vi.fn(
      (config: {
        callback: (resp: { access_token?: string; error?: string }) => void;
        error_callback?: (err: { type?: string; message?: string }) => void;
      }) => ({
        requestAccessToken: vi.fn((override?: { prompt?: string }) => {
          if (override?.prompt === '') {
            config.error_callback?.({
              type: 'popup_failed_to_open',
              message: 'Failed to open popup window',
            });
          } else {
            config.callback({ error: 'interaction_required' });
          }
        }),
      })
    );

    vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient } } } });
    try {
      await expect(
        requestGoogleAccessToken('client.apps.googleusercontent.com', 'silent')
      ).rejects.toMatchObject({
        name: 'GoogleAuthError',
        code: 'popup_failed_to_open',
      });

      await expect(
        requestGoogleAccessToken('client.apps.googleusercontent.com', 'interactive')
      ).rejects.toMatchObject({
        name: 'GoogleAuthError',
        code: 'interaction_required',
      });

      initTokenClient.mockImplementationOnce((config) => ({
        requestAccessToken: vi.fn(() => config.error_callback?.({ type: 'popup_closed' })),
      }));
      await expect(
        requestGoogleAccessToken('client.apps.googleusercontent.com', 'interactive')
      ).rejects.toMatchObject({
        name: 'GoogleAuthError',
        code: 'popup_closed',
      });
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        vi.stubGlobal('window', previousWindow);
      }
    }
  });

  it('invokes requestAccessToken synchronously on interactive calls when GIS is already loaded', async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const requestAccessToken = vi.fn();
    const initTokenClient = vi.fn(
      (config: {
        callback: (resp: { access_token?: string; expires_in?: number }) => void;
      }) => {
        requestAccessToken.mockImplementation(() => {
          queueMicrotask(() => {
            config.callback({ access_token: 'fresh-token', expires_in: 3600 });
          });
        });
        return { requestAccessToken };
      }
    );

    vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient } } } });
    try {
      const promiseWithHint = ensureGoogleAccessToken('client.apps.googleusercontent.com', {
        allowInteractive: true,
        hint: 'user@example.com',
      });
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
      expect(requestAccessToken).toHaveBeenCalledWith({
        prompt: '',
        hint: 'user@example.com',
      });
      await expect(promiseWithHint).resolves.toBe('fresh-token');

      clearStoredToken();
      requestAccessToken.mockClear();

      const promiseNoHint = ensureGoogleAccessToken('client.apps.googleusercontent.com', {
        allowInteractive: true,
      });
      expect(requestAccessToken).toHaveBeenCalledTimes(1);
      expect(requestAccessToken).toHaveBeenCalledWith();
      await expect(promiseNoHint).resolves.toBe('fresh-token');
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        vi.stubGlobal('window', previousWindow);
      }
    }
  });

  it('clears cached token when changing or clearing custom client id', () => {
    storeAccessToken('old-client-token', 3600);
    expect(getCachedAccessToken()).toBe('old-client-token');

    expect(setStoredClientId('new-client.apps.googleusercontent.com')).toBe(true);
    expect(getCachedAccessToken()).toBeNull();

    storeAccessToken('new-client-token', 3600);
    expect(setStoredClientId('')).toBe(true);
    expect(getCachedAccessToken()).toBeNull();
  });

  it('loadGoogleScript removes failed script tags and recovers on subsequent retry', async () => {
    const previousWindow = (globalThis as { window?: unknown }).window;
    const previousDocument = (globalThis as { document?: unknown }).document;
    const win: Record<string, unknown> = {};
    const scripts: Array<{
      src: string;
      async: boolean;
      defer: boolean;
      onload: (() => void) | null;
      onerror: (() => void) | null;
      remove: ReturnType<typeof vi.fn>;
    }> = [];
    const doc = {
      querySelector: vi.fn(() => scripts[0] ?? null),
      createElement: vi.fn(() => {
        const el = {
          src: '',
          async: false,
          defer: false,
          onload: null as (() => void) | null,
          onerror: null as (() => void) | null,
          remove: vi.fn(() => {
            const idx = scripts.indexOf(el);
            if (idx >= 0) scripts.splice(idx, 1);
          }),
        };
        return el;
      }),
      head: {
        appendChild: vi.fn((el: (typeof scripts)[number]) => {
          scripts.push(el);
        }),
      },
    };
    vi.stubGlobal('window', win);
    vi.stubGlobal('document', doc);

    try {
      // Pre-existing failed script from initial offline page load
      scripts.push({
        src: 'https://accounts.google.com/gsi/client',
        async: true,
        defer: true,
        onload: null,
        onerror: null,
        remove: vi.fn(() => {
          scripts.shift();
        }),
      });

      const firstAttempt = loadGoogleScript();
      expect(scripts).toHaveLength(1);
      scripts[0]!.onerror?.();
      await expect(firstAttempt).rejects.toThrow('Failed to load Google Sign-In script');
      expect(scripts).toHaveLength(0);

      // Next attempt after reconnect appends a new script and resolves once GIS loads
      const secondAttempt = loadGoogleScript();
      expect(scripts).toHaveLength(1);
      win.google = { accounts: { oauth2: { initTokenClient: vi.fn() } } };
      scripts[0]!.onload?.();
      await expect(secondAttempt).resolves.toBeUndefined();
    } finally {
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        vi.stubGlobal('window', previousWindow);
      }
      if (previousDocument === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        vi.stubGlobal('document', previousDocument);
      }
    }
  });

  it('times out silent access token requests that never invoke GIS callbacks', async () => {
    vi.useFakeTimers();
    const previousWindow = (globalThis as { window?: unknown }).window;
    const initTokenClient = vi.fn(() => ({
      requestAccessToken: vi.fn(),
    }));
    vi.stubGlobal('window', { google: { accounts: { oauth2: { initTokenClient } } } });
    try {
      const pending = requestGoogleAccessToken('client.apps.googleusercontent.com', 'silent');
      const assertion = expect(pending).rejects.toMatchObject({
        name: 'GoogleAuthError',
        code: 'interaction_required',
      });
      await vi.advanceTimersByTimeAsync(20_000);
      await assertion;
    } finally {
      vi.useRealTimers();
      if (previousWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        vi.stubGlobal('window', previousWindow);
      }
    }
  });
});
