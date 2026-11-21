/**
 * The signed-in Google account shown in the drawer header + Settings account card.
 * Fetched from Drive `about` after a successful sync (works with the drive.appdata
 * scope, no extra consent) and cached in localStorage.
 */
export interface GoogleAccount {
  email: string;
  name?: string;
  photoUrl?: string;
}

const ACCOUNT_KEY = 'tempo_google_account';

/** Google profile photos are served from these hosts. Anything else is dropped. */
const PHOTO_HOST = /(^|\.)googleusercontent\.com$|(^|\.)ggpht\.com$/i;

export function sanitizePhotoUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== 'string') return undefined;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return undefined;
    if (!PHOTO_HOST.test(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
}

function normalizeGoogleAccount(account: GoogleAccount): GoogleAccount {
  const photoUrl = sanitizePhotoUrl(account.photoUrl);
  return photoUrl
    ? { email: account.email, name: account.name, photoUrl }
    : { email: account.email, name: account.name };
}

export function getGoogleAccount(): GoogleAccount | null {
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as GoogleAccount;
    if (!v || typeof v.email !== 'string' || !v.email) return null;
    return normalizeGoogleAccount(v);
  } catch {
    return null;
  }
}

export function setGoogleAccount(account: GoogleAccount | null): void {
  if (!account) {
    localStorage.removeItem(ACCOUNT_KEY);
    return;
  }
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(normalizeGoogleAccount(account)));
}

/** Best-effort; returns null on any failure (offline, scope, etc.). */
export async function fetchDriveAccount(accessToken: string): Promise<GoogleAccount | null> {
  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,displayName,photoLink)',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      user?: { emailAddress?: string; displayName?: string; photoLink?: string };
    };
    const email = data.user?.emailAddress;
    if (!email) return null;
    return { email, name: data.user?.displayName, photoUrl: sanitizePhotoUrl(data.user?.photoLink) };
  } catch {
    return null;
  }
}
