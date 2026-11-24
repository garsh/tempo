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
            hint?: string;
          }) => {
            requestAccessToken: (overrideConfig?: { prompt?: string; hint?: string }) => void;
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
const GIS_SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const GIS_SCRIPT_LOAD_TIMEOUT_MS = 15_000;
const SILENT_AUTH_TIMEOUT_MS = 20_000;

type CachedToken = { token: string; expiresAt: number };

/** In-memory only. A reload uses silent GIS refresh instead of reading storage. */
let cachedToken: CachedToken | null = null;
let authGeneration = 0;
let loadScriptPromise: Promise<void> | null = null;

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
      clearStoredToken();
      return true;
    }
    if (!isValidGoogleClientId(trimmed)) return false;
    localStorage.setItem(CLIENT_ID_KEY, trimmed);
    clearStoredToken();
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
  if (typeof window === 'undefined') {
    return Promise.resolve();
  }
  if (isGoogleScriptLoaded()) {
    return Promise.resolve();
  }
  if (loadScriptPromise) {
    return loadScriptPromise;
  }

  const existing = document.querySelector(`script[src="${GIS_SCRIPT_URL}"]`);
  existing?.remove();

  loadScriptPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = GIS_SCRIPT_URL;
    script.async = true;
    script.defer = true;

    let settled = false;
    const cleanup = () => {
      clearTimeout(timer);
      script.onload = null;
      script.onerror = null;
    };

    const fail = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      script.remove();
      loadScriptPromise = null;
      reject(new Error(message));
    };

    const timer = setTimeout(() => {
      fail('Timed out loading Google Sign-In script');
    }, GIS_SCRIPT_LOAD_TIMEOUT_MS);

    script.onload = () => {
      if (settled) return;
      settled = true;
      cleanup();
      loadScriptPromise = null;
      if (isGoogleScriptLoaded()) {
        resolve();
      } else {
        script.remove();
        reject(new Error('Google Sign-In script loaded without OAuth client'));
      }
    };

    script.onerror = () => {
      fail('Failed to load Google Sign-In script');
    };

    document.head.appendChild(script);
  });

  return loadScriptPromise;
}

export type TokenRequestMode = 'interactive' | 'silent';

export type AuthErrorCode =
  | 'popup_failed_to_open'
  | 'popup_closed'
  | 'interaction_required'
  | 'unknown';

const POPUP_BLOCKED_RE = /popup_failed_to_open|failed to open popup/i;
const INTERACTION_ERROR_RE =
  /interaction_required|login_required|consent_required|access_denied|user_logged_out|popup_closed|user_closed/i;

export class GoogleAuthError extends Error {
  readonly code: AuthErrorCode;

  constructor(message: string, code: AuthErrorCode) {
    super(message);
    this.name = 'GoogleAuthError';
    this.code = code;
  }
}

export function isPopupBlockedError(err: unknown): boolean {
  if (err instanceof GoogleAuthError) return err.code === 'popup_failed_to_open';
  const message = err instanceof Error ? err.message : String(err);
  return POPUP_BLOCKED_RE.test(message);
}

export function isAuthInteractionError(err: unknown): boolean {
  if (err instanceof GoogleAuthError) {
    return err.code === 'interaction_required' || err.code === 'popup_closed';
  }
  const message = err instanceof Error ? err.message : String(err);
  return INTERACTION_ERROR_RE.test(message);
}

export function isGoogleScriptLoaded(): boolean {
  return typeof window !== 'undefined' && Boolean(window.google?.accounts?.oauth2);
}

/**
 * Request a Drive AppData access token.
 * - interactive: may show Google consent UI
 * - silent: prompt '' — fails if user must consent again
 * The token stays in memory for this page load only.
 */
export function requestGoogleAccessToken(
  clientId: string,
  mode: TokenRequestMode = 'interactive',
  opts: { hint?: string } = {}
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.google?.accounts?.oauth2) {
      reject(new Error('Google Identity Services script not loaded.'));
      return;
    }

    const startGeneration = authGeneration;
    let settled = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const finishResolve = (token: string) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      resolve(token);
    };

    const finishReject = (err: unknown) => {
      if (settled) return;
      settled = true;
      if (timeoutId) clearTimeout(timeoutId);
      reject(err);
    };

    if (mode === 'silent') {
      timeoutId = setTimeout(() => {
        finishReject(new GoogleAuthError('Silent sign-in timed out', 'interaction_required'));
      }, SILENT_AUTH_TIMEOUT_MS);
    }

    try {
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (resp) => {
          if (authGeneration !== startGeneration) {
            finishReject(new Error('Signed out'));
            return;
          }
          if (resp.error) {
            clearStoredToken();
            finishReject(
              new GoogleAuthError(
                resp.error,
                INTERACTION_ERROR_RE.test(resp.error) ? 'interaction_required' : 'unknown'
              )
            );
          } else if (resp.access_token) {
            storeAccessToken(resp.access_token, resp.expires_in);
            finishResolve(resp.access_token);
          } else {
            finishReject(new Error('No access token returned from Google Sign-In.'));
          }
        },
        error_callback: (err) => {
          const rawMessage = err?.message || err?.type || 'Token request failed';
          if (err?.type === 'popup_failed_to_open' || POPUP_BLOCKED_RE.test(rawMessage)) {
            finishReject(
              new GoogleAuthError(
                err?.message || 'Failed to open popup window',
                'popup_failed_to_open'
              )
            );
          } else if (err?.type === 'popup_closed') {
            finishReject(new GoogleAuthError(rawMessage, 'popup_closed'));
          } else {
            finishReject(new GoogleAuthError(rawMessage, 'unknown'));
          }
        },
      });

      if (mode === 'silent') {
        client.requestAccessToken(opts.hint ? { prompt: '', hint: opts.hint } : { prompt: '' });
      } else if (opts.hint) {
        client.requestAccessToken({ prompt: '', hint: opts.hint });
      } else {
        client.requestAccessToken();
      }
    } catch (err) {
      finishReject(err);
    }
  });
}

function browserIsOffline(): boolean {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/**
 * Prefer the in-memory token; otherwise request silently or interactively.
 * Interactive requests run synchronously once the GIS script is loaded so
 * browser user-gesture activation is preserved for OAuth popups.
 * Offline reloads fail soft with AuthOfflineError so the cached account stays put.
 */
export async function ensureGoogleAccessToken(
  clientId: string,
  opts: { allowInteractive?: boolean; hint?: string } = {}
): Promise<string> {
  const cached = getCachedAccessToken();
  if (cached) return cached;

  if (browserIsOffline()) throw new AuthOfflineError();

  if (!isGoogleScriptLoaded()) {
    await loadGoogleScript();
    if (browserIsOffline()) throw new AuthOfflineError();
  }

  if (opts.allowInteractive) {
    return requestGoogleAccessToken(clientId, 'interactive', { hint: opts.hint });
  }

  return requestGoogleAccessToken(clientId, 'silent', { hint: opts.hint });
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
