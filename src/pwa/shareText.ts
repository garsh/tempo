export const SHARE_CACHE = 'tempo-share';
export const SHARE_PAYLOAD_PATH = '/tempo-share-payload';
export const SHARE_TEXT_MAX = 2000;

/** Join a share target's title, text, and url. Caps the result so a huge query cannot stall the tab. */
export function shareTextFromParts(title?: string | null, text?: string | null, url?: string | null): string {
  const parts = [title, text, url].map((part) => (part ?? '').trim()).filter(Boolean);
  const combined = parts.join(' — ');
  return combined.length > SHARE_TEXT_MAX ? combined.slice(0, SHARE_TEXT_MAX) : combined;
}

/** Read the note stashed by the service worker for POST /share, then delete it. */
export async function takeSharedText(): Promise<string | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(SHARE_CACHE);
    const res = await cache.match(SHARE_PAYLOAD_PATH);
    if (!res) return null;
    await cache.delete(SHARE_PAYLOAD_PATH);
    const data = (await res.json()) as { text?: unknown };
    if (typeof data.text !== 'string' || !data.text) return null;
    return data.text.length > SHARE_TEXT_MAX ? data.text.slice(0, SHARE_TEXT_MAX) : data.text;
  } catch {
    return null;
  }
}
