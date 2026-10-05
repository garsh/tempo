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
        };
      };
    };
  }
}

const SCOPES = 'https://www.googleapis.com/auth/drive.appdata';
const TOKEN_KEY = 'tempo_google_access_token';
const EXPIRES_KEY = 'tempo_google_token_expires_at';
const CLIENT_ID_KEY = 'tempo_google_client_id';

/** Skew so we refresh slightly before real expiry. */
const EXPIRY_SKEW_MS = 60_000;

export function getStoredClientId(): string {
  return localStorage.getItem(CLIENT_ID_KEY)?.trim() || '';
}

export function setStoredClientId(clientId: string): void {
  localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(EXPIRES_KEY);
}

export function storeAccessToken(token: string, expiresInSec?: number): void {
  sessionStorage.setItem(TOKEN_KEY, token);
  const ttl = (expiresInSec && expiresInSec > 0 ? expiresInSec : 3600) * 1000;
  sessionStorage.setItem(EXPIRES_KEY, String(Date.now() + ttl));
}

export function getCachedAccessToken(): string | null {
  const token = sessionStorage.getItem(TOKEN_KEY);
  const expiresAt = Number(sessionStorage.getItem(EXPIRES_KEY) || 0);
  if (!token || !expiresAt) return null;
  if (Date.now() >= expiresAt - EXPIRY_SKEW_MS) {
    clearStoredToken();
    return null;
  }
  return token;
}

export function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
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
 * Caches token in sessionStorage for reuse within expiry.
 */
export function requestGoogleAccessToken(
  clientId: string,
  mode: TokenRequestMode = 'interactive'
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    if (!window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script not loaded.'));
      return;
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (resp.error) {
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

/**
 * Prefer cached token; otherwise try silent refresh, then optional interactive.
 */
export async function ensureGoogleAccessToken(
  clientId: string,
  opts: { allowInteractive?: boolean } = {}
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;

  await loadGoogleScript();
  try {
    return await requestGoogleAccessToken(clientId, 'silent');
  } catch (silentErr) {
    if (!opts.allowInteractive) throw silentErr;
    return requestGoogleAccessToken(clientId, 'interactive');
  }
}
