import { afterEach, describe, expect, it, vi } from 'vitest';
import source from '../../../public/sw-notify.js?raw';

function loadWorkerHelpers() {
  let fetchListener: ((event: { request: Request; respondWith: (p: Promise<Response>) => void }) => void) | null = null;
  const self = {
    location: { origin: 'https://tempo.bot.nu' },
    addEventListener(type: string, fn: unknown) {
      if (type === 'fetch') {
        fetchListener = fn as typeof fetchListener;
      }
    },
  };

  const cacheEntries = new Map<string, Response>();
  const cacheObj = {
    put: vi.fn(async (req: Request | string, res: Response) => {
      const key = typeof req === 'string' ? req : new URL(req.url).pathname;
      cacheEntries.set(key, res);
    }),
    match: vi.fn(async (req: Request | string) => {
      const key = typeof req === 'string' ? req : new URL(req.url).pathname;
      return cacheEntries.get(key);
    }),
  };

  const mockCacheStorage = {
    open: vi.fn(async () => cacheObj),
  };

  const NativeResponse = globalThis.Response;
  class MockResponse extends NativeResponse {
    static override redirect(url: string | URL, status = 302) {
      return { status, url: String(url) } as unknown as Response;
    }
  }

  vi.stubGlobal('caches', mockCacheStorage);
  vi.stubGlobal('Response', MockResponse);

  const helpers = new Function(
    'self',
    'caches',
    'Response',
    `${source}\nreturn { shareTextFromForm, handleShare };`
  )(self, mockCacheStorage, MockResponse) as {
    shareTextFromForm: (title: unknown, text: unknown, url: unknown) => string;
    handleShare: (request: Request) => Promise<Response>;
  };

  return {
    ...helpers,
    fetchListener: fetchListener!,
    mockCacheStorage,
    cacheObj,
    cacheEntries,
  };
}

describe('service worker share helpers', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('caps shared text', () => {
    const { shareTextFromForm } = loadWorkerHelpers();
    const text = shareTextFromForm('Title', 'x'.repeat(5000), 'https://example.com');
    expect(text.length).toBe(2000);
    expect(text.startsWith('Title — ')).toBe(true);
  });

  it('handleShare rejects cross-site requests', async () => {
    const { handleShare, mockCacheStorage } = loadWorkerHelpers();
    const request = new Request('https://tempo.bot.nu/share', {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    const response = await handleShare(request);
    expect(response.status).toBe(303);
    expect(response.url).toBe('https://tempo.bot.nu/');
    expect(mockCacheStorage.open).not.toHaveBeenCalled();
  });

  it('handleShare rejects oversized streaming body without Content-Length and cancels reader', async () => {
    const { handleShare, mockCacheStorage } = loadWorkerHelpers();
    const cancelSpy = vi.fn();
    let chunksSent = 0;
    const readableStream = new ReadableStream({
      pull(controller) {
        if (chunksSent === 0) {
          controller.enqueue(new TextEncoder().encode('a'.repeat(60_000)));
        } else if (chunksSent === 1) {
          controller.enqueue(new TextEncoder().encode('b'.repeat(60_000)));
        } else {
          controller.close();
        }
        chunksSent += 1;
      },
      cancel: cancelSpy,
    });

    const request = new Request('https://tempo.bot.nu/share', {
      method: 'POST',
      body: readableStream,
      duplex: 'half',
    } as RequestInit);

    const response = await handleShare(request);
    expect(response.status).toBe(303);
    expect(response.url).toBe('https://tempo.bot.nu/');
    expect(cancelSpy).toHaveBeenCalled();
    expect(mockCacheStorage.open).not.toHaveBeenCalled();
  });

  it('handleShare accepts valid POST /share request and caches payload', async () => {
    const { handleShare, cacheObj } = loadWorkerHelpers();
    const request = new Request('https://tempo.bot.nu/share', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'title=Buy+milk&url=https%3A%2F%2Fexample.com',
    });

    const response = await handleShare(request);
    expect(response.status).toBe(303);
    expect(response.url).toBe('https://tempo.bot.nu/?share=1');

    const cachedResponse = await cacheObj.match('/tempo-share-payload');
    expect(cachedResponse).toBeDefined();
    const cachedData = await cachedResponse!.json();
    expect(cachedData).toEqual({ text: 'Buy milk — https://example.com' });
  });

  it('fetchListener ignores non-navigate POST /share requests', () => {
    const { fetchListener } = loadWorkerHelpers();
    const event = {
      request: new Request('https://tempo.bot.nu/share', {
        method: 'POST',
        mode: 'no-cors',
      }),
      respondWith: vi.fn(),
    };

    fetchListener(event);
    expect(event.respondWith).not.toHaveBeenCalled();
  });
});
