/* global self, caches, Response, URL, URLSearchParams, TextDecoder */
const SHARE_CACHE = 'tempo-share';
const SHARE_PAYLOAD_PATH = '/tempo-share-payload';
const SHARE_TEXT_MAX = 2000;
const SHARE_BODY_MAX = 100_000;

function shareTextFromForm(title, text, url) {
  const parts = [title, text, url].map((part) => String(part || '').trim()).filter(Boolean);
  const combined = parts.join(' — ');
  return combined.length > SHARE_TEXT_MAX ? combined.slice(0, SHARE_TEXT_MAX) : combined;
}

async function readBodyTextCapped(request, maxBytes) {
  const declared = Number(request.headers.get('content-length') || 0);
  if (declared > maxBytes) return null;

  const body = request.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await request.text();
    return text.length > maxBytes ? null : text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already consumed */
      }
      return null;
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

async function handleShare(request) {
  const fetchSite = (request.headers.get('sec-fetch-site') || '').toLowerCase();
  if (fetchSite === 'cross-site') {
    return Response.redirect(new URL('/', self.location.origin).href, 303);
  }

  let combined = '';
  try {
    const bodyText = await readBodyTextCapped(request, SHARE_BODY_MAX);
    if (bodyText === null) {
      return Response.redirect(new URL('/', self.location.origin).href, 303);
    }
    const params = new URLSearchParams(bodyText);
    combined = shareTextFromForm(params.get('title'), params.get('text'), params.get('url'));
  } catch {
    combined = '';
  }

  if (!combined) {
    return Response.redirect(new URL('/', self.location.origin).href, 303);
  }

  const cache = await caches.open(SHARE_CACHE);
  await cache.put(
    new Request(new URL(SHARE_PAYLOAD_PATH, self.location.origin).href),
    new Response(JSON.stringify({ text: combined }), {
      headers: { 'Content-Type': 'application/json' },
    })
  );
  return Response.redirect(new URL('/?share=1', self.location.origin).href, 303);
}

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'POST') return;
  if (url.origin !== self.location.origin || url.pathname !== '/share') return;
  if (event.request.mode && event.request.mode !== 'navigate') return;
  event.respondWith(handleShare(event.request));
});
