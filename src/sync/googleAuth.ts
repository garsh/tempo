// Google Identity Services OAuth Helper

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: {
              access_token?: string;
              expires_in?: number;
              error?: string;
            }) => void;
            error_callback?: (err: { type?: string; message?: string }) => void;
            prompt?: string;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string }) => void;
          };
          /** Present when the GIS script has loaded. Revokes an access token. */
          revoke?: (accessToken: string, done: () => void) => void;
        };
      };
    };
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'tempo_google_access_token';
const EXPIRES_KEY = 'tempo_google_token_expires_at';
const CLIENT_ID_KEY = 'tempo_google_client_id';
const CLIENT_ID_SUFFIX = '.apps.googleusercontent.com';
const MAX_CLIENT_ID_LENGTH = 200;
const SIGNOUT_CHANNEL = 'tempo-auth-signout';

/** Skew so we refresh slightly before real expiry. */
const EXPIRY_SKEW_MS = 60_000;

type CachedToken = { token: string; expiresAt: number };

/** In-memory only. A reload uses silent GIS refresh instead of reading storage. */
let cachedToken: CachedToken | null = null;
let authGeneration = 0;

export class AuthOfflineError extends Error {
  constructor() {
    super('Offline; sync paused');
    this.name = 'AuthOfflineError';
  }
}

export function getAuthGeneration(): number {
  return authGeneration;
}

export function isValidGoogleClientId(clientId: string): boolean {
  const trimmed = clientId.trim();
  if (!trimmed || trimmed.length > MAX_CLIENT_ID_LENGTH) return false;
  if (trimmed.length <= CLIENT_ID_SUFFIX.length) return false;
  if (/[\s/:]/.test(trimmed)) return false;
  return trimmed.endsWith(CLIENT_ID_SUFFIX);
}

export function getDefaultClientId(): string {
  const envId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim();
  return envId || '';
}

export function getCustomClientId(): string {
  try {
    const stored = localStorage.getItem(CLIENT_ID_KEY)?.trim() || '';
    return isValidGoogleClientId(stored) ? stored : '';
  } catch {
    return '';
  }
}

export function getStoredClientId(): string {
  return getCustomClientId() || getDefaultClientId();
}

/** Empty string clears the override. An invalid id is refused and the previous value stays. */
export function setStoredClientId(clientId: string): boolean {
  const trimmed = clientId.trim();
  try {
    if (!trimmed) {
      localStorage.removeItem(CLIENT_ID_KEY);
      return true;
    }
    if (!isValidGoogleClientId(trimmed)) return false;
    localStorage.setItem(CLIENT_ID_KEY, trimmed);
    return true;
  } catch {
    return false;
  }
}

function forgetLegacySessionToken(): void {
  try {
    if (typeof sessionStorage === 'undefined') return;
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(EXPIRES_KEY);
  } catch {
    /* private mode */
  }
}

// Older builds persisted the Drive token here. Drop it so a script cannot read it.
forgetLegacySessionToken();

export function clearStoredToken(): void {
  cachedToken = null;
  forgetLegacySessionToken();
}

export function storeAccessToken(token: string, expiresInSec?: number): void {
  const ttl = (expiresInSec && expiresInSec > 0 ? expiresInSec : 3600) * 1000;
  cachedToken = { token, expiresAt: Date.now() + ttl };
  forgetLegacySessionToken();
}

export function getCachedAccessToken(): string | null {
  if (!cachedToken) return null;
  if (Date.now() >= cachedToken.expiresAt - EXPIRY_SKEW_MS) {
    clearStoredToken();
    return null;
  }
  return cachedToken.token;
}

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined') {
      resolve();
      return;
    }
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', (e) => reject(e));
      // Script may already be loaded
      if (window.google?.accounts?.oauth2) resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

export type TokenRequestMode = 'interactive' | 'silent';

/**
 * Request a Drive AppData access token.
 * - interactive: may show Google consent UI
 * - silent: prompt '' — fails if user must consent again
 * The token stays in memory for this page load only.
 */
export function requestGoogleAccessToken(
  clientId: string,
  mode: TokenRequestMode = 'interactive'
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script not loaded.'));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) {
            clearStoredToken();
            reject(new Error(resp.error));
          } else if (resp.access_token) {
            storeAccessToken(resp.access_token, resp.expires_in);
            resolve(resp.access_token);
          } else {
            reject(new Error('No access token returned from Google Sign-In.'));
          }
        },
        error_callback: (err) => {
          reject(new Error(err?.message || err?.type || 'Token request failed'));
        },
      });

      if (mode === 'silent') {
        client.requestAccessToken({ prompt: '' });
      } else {
        client.requestAccessToken();
      }
    } catch (err) {
      reject(err);
    }
  });
}

function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Prefer the in-memory token; otherwise try silent refresh, then optional interactive.
 * Offline reloads fail soft with AuthOfflineError so the cached account stays put.
 */
export async function ensureGoogleAccessToken(
  clientId: string,
  opts: { allowInteractive?: boolean } = {}
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;

  if (browserIsOffline()) throw new AuthOfflineError();

  await loadGoogleScript();
  try {
    return await requestGoogleAccessToken(clientId, 'silent');
  } catch (silentErr) {
    if (!opts.allowInteractive || browserIsOffline()) {
      if (browserIsOffline()) throw new AuthOfflineError();
      throw silentErr;
    }
    return requestGoogleAccessToken(clientId, 'interactive');
  }
}

function broadcastSignOut(): void {
  if (typeof BroadcastChannel === 'undefined') return;
  try {
    const channel = new BroadcastChannel(SIGNOUT_CHANNEL);
    channel.postMessage({ type: 'signout' });
    channel.close();
  } catch {
    /* ignore */
  }
}

/** Other tabs (and this tab's listener) drop the in-memory token and stop sync. */
export function applyRemoteSignOut(): void {
  authGeneration += 1;
  clearStoredToken();
}

export function subscribeGoogleSignOut(listener: () => void): () => void {
  if (typeof BroadcastChannel === 'undefined') return () => {};
  const channel = new BroadcastChannel(SIGNOUT_CHANNEL);
  const onMessage = () => listener();
  channel.addEventListener('message', onMessage);
  return () => {
    channel.removeEventListener('message', onMessage);
    channel.close();
  };
}

async function revokeWithGis(token: string): Promise<boolean> {
  const revoke = typeof window !== 'undefined' ? window.google?.accounts?.oauth2?.revoke : undefined;
  if (!revoke) return false;
  return new Promise((resolve) => {
    try {
      revoke(token, () => resolve(true));
    } catch {
      resolve(false);
    }
  });
}

async function revokeWithHttp(token: string): Promise<void> {
  try {
    await fetch('https://oauth2.googleapis.com/revoke', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(token)}`,
    });
  } catch {
    /* offline or blocked; local sign-out still stands */
  }
}

/**
 * Drop the token, tell other tabs, and best-effort revoke it at Google.
 * Does not block on the network. Does not delete local tasks.
 */
export async function signOutGoogleSession(): Promise<void> {
  const token = cachedToken?.token ?? null;
  applyRemoteSignOut();
  broadcastSignOut();
  if (!token) return;
  const revoked = await revokeWithGis(token);
  if (!revoked) await revokeWithHttp(token);
}
