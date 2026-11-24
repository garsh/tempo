/* global self, caches, Response, URL */
const SHARE_CACHE = 'tempo-share';
const SHARE_PAYLOAD_PATH = '/tempo-share-payload';
const SHARE_TEXT_MAX = 2000;
const SHARE_BODY_MAX = 100_000;

function shareTextFromForm(title, text, url) {
  const parts = [title, text, url].map((part) => String(part || '').trim()).filter(Boolean);
  const combined = parts.join(' — ');
  return combined.length > SHARE_TEXT_MAX ? combined.slice(0, SHARE_TEXT_MAX) : combined;
}

async function handleShare(request) {
  const declared = Number(request.headers.get('content-length') || 0);
  let combined = '';
  if (!declared || declared <= SHARE_BODY_MAX) {
    try {
      const form = await request.formData();
      combined = shareTextFromForm(form.get('title'), form.get('text'), form.get('url'));
    } catch {
      combined = '';
    }
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
  event.respondWith(handleShare(event.request));
});
