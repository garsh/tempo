import { describe, expect, it } from 'vitest';
import source from '../../../public/sw-notify.js?raw';

function loadWorkerHelpers() {
  const self = {
    location: { origin: 'https://tempo.bot.nu' },
    addEventListener() {},
  };
  return new Function(
    'self',
    `${source}\nreturn { shareTextFromForm };`
  )(self) as {
    shareTextFromForm: (title: unknown, text: unknown, url: unknown) => string;
  };
}

describe('service worker share helpers', () => {
  const { shareTextFromForm } = loadWorkerHelpers();

  it('caps shared text', () => {
    const text = shareTextFromForm('Title', 'x'.repeat(5000), 'https://example.com');
    expect(text.length).toBe(2000);
    expect(text.startsWith('Title — ')).toBe(true);
  });
});
