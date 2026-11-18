import { describe, expect, it } from 'vitest';
import source from '../../../public/sw-notify.js?raw';

function loadWorkerHelpers() {
  const self = {
    location: { origin: 'https://tempo.bot.nu' },
    addEventListener() {},
  };
  return new Function(
    'self',
    `${source}\nreturn { safeNotificationUrl, shareTextFromForm };`
  )(self) as {
    safeNotificationUrl: (raw: unknown) => string;
    shareTextFromForm: (title: unknown, text: unknown, url: unknown) => string;
  };
}

describe('service worker notification and share helpers', () => {
  const { safeNotificationUrl, shareTextFromForm } = loadWorkerHelpers();

  it('opens only same-origin paths', () => {
    expect(safeNotificationUrl('https://evil.example/')).toBe('/');
    expect(safeNotificationUrl('//evil.example/phish')).toBe('/');
    expect(safeNotificationUrl('/')).toBe('/');
    expect(safeNotificationUrl('/?share=1')).toBe('/?share=1');
  });

  it('caps shared text', () => {
    const text = shareTextFromForm('Title', 'x'.repeat(5000), 'https://example.com');
    expect(text.length).toBe(2000);
    expect(text.startsWith('Title — ')).toBe(true);
  });
});
