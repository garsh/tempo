import { beforeEach, describe, expect, it } from 'vitest';

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
  storeAccessToken,
} from '../googleAuth';

describe('googleAuth client id resolution', () => {
  beforeEach(() => {
    mockLocalStorage.clear();
    mockSessionStorage.clear();
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

  it('caches and clears access tokens in sessionStorage', () => {
    expect(getCachedAccessToken()).toBeNull();

    storeAccessToken('fake-token-123', 3600);
    expect(getCachedAccessToken()).toBe('fake-token-123');

    clearStoredToken();
    expect(getCachedAccessToken()).toBeNull();
  });
});
