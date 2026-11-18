import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  isMobileKeyboardDevice,
  getStoredOrEstimatedKeyboardHeight,
  computeQuickAddSheetBottom,
  computeQuickAddSheetMaxHeight,
  KEYBOARD_HEIGHT_STORAGE_KEY,
} from '../QuickAddSheet';

function createMockStorage(): Storage {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] ?? null,
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
}

describe('QuickAddSheet Mobile Keyboard & Viewport Tracking', () => {
  let mockStorage: Storage;

  beforeEach(() => {
    mockStorage = createMockStorage();
    vi.stubGlobal('localStorage', mockStorage);
    vi.stubGlobal('window', {
      innerWidth: 1280,
      innerHeight: 800,
      navigator: { maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
      matchMedia: vi.fn().mockReturnValue({ matches: false }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isMobileKeyboardDevice', () => {
    it('returns false when window is undefined', () => {
      vi.stubGlobal('window', undefined);
      expect(isMobileKeyboardDevice()).toBe(false);
    });

    it('returns false for wide desktop screen with mouse/fine pointer', () => {
      vi.stubGlobal('window', {
        innerWidth: 1280,
        innerHeight: 800,
        navigator: { maxTouchPoints: 0, userAgent: 'Mozilla/5.0 (X11; Linux x86_64)' },
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      });
      expect(isMobileKeyboardDevice()).toBe(false);
    });

    it('returns true for phone screen with touch capability', () => {
      vi.stubGlobal('window', {
        innerWidth: 390,
        innerHeight: 844,
        navigator: { maxTouchPoints: 5, userAgent: 'iPhone' },
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      });
      expect(isMobileKeyboardDevice()).toBe(true);
    });

    it('returns true for Android mobile user agent on small screen', () => {
      vi.stubGlobal('window', {
        innerWidth: 412,
        innerHeight: 915,
        navigator: { maxTouchPoints: 1, userAgent: 'Mozilla/5.0 (Android; Mobile)' },
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      });
      expect(isMobileKeyboardDevice()).toBe(true);
    });
  });

  describe('getStoredOrEstimatedKeyboardHeight', () => {
    it('returns 0 when window is undefined', () => {
      vi.stubGlobal('window', undefined);
      expect(getStoredOrEstimatedKeyboardHeight()).toBe(0);
    });

    it('returns 0 on desktop devices', () => {
      vi.stubGlobal('window', {
        innerWidth: 1440,
        innerHeight: 900,
        navigator: { maxTouchPoints: 0, userAgent: 'Macintosh' },
        matchMedia: vi.fn().mockReturnValue({ matches: false }),
      });
      expect(getStoredOrEstimatedKeyboardHeight()).toBe(0);
    });

    it('returns stored keyboard height from localStorage if available and within valid range', () => {
      vi.stubGlobal('window', {
        innerWidth: 390,
        innerHeight: 844,
        navigator: { maxTouchPoints: 5, userAgent: 'iPhone' },
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      });
      mockStorage.setItem(KEYBOARD_HEIGHT_STORAGE_KEY, '312');

      expect(getStoredOrEstimatedKeyboardHeight()).toBe(312);
    });

    it('falls back to proportional viewport heuristic on mobile when no stored value exists', () => {
      vi.stubGlobal('window', {
        innerWidth: 390,
        innerHeight: 800,
        navigator: { maxTouchPoints: 5, userAgent: 'iPhone' },
        matchMedia: vi.fn().mockReturnValue({ matches: true }),
      });

      // 800 * 0.36 = 288
      expect(getStoredOrEstimatedKeyboardHeight()).toBe(288);
    });
  });

  describe('computeQuickAddSheetBottom', () => {
    it('keeps bottom at 0 on desktop when no virtual keyboard is active', () => {
      const bottom = computeQuickAddSheetBottom({
        isMobile: false,
        activeKeyboardInset: 0,
        lastKnownKeyboardInset: 0,
        fallbackHeight: 280,
      });
      expect(bottom).toBe(0);
    });

    it('immediately appears above keyboard height on mobile prior to keyboard opening', () => {
      const bottom = computeQuickAddSheetBottom({
        isMobile: true,
        activeKeyboardInset: 0,
        lastKnownKeyboardInset: 295,
        fallbackHeight: 280,
      });
      expect(bottom).toBe(295);
    });

    it('uses fallback height on mobile if no lastKnownKeyboardInset is available yet', () => {
      const bottom = computeQuickAddSheetBottom({
        isMobile: true,
        activeKeyboardInset: 0,
        lastKnownKeyboardInset: 0,
        fallbackHeight: 288,
      });
      expect(bottom).toBe(288);
    });

    it('tracks active keyboard inset when virtual keyboard is open', () => {
      const bottom = computeQuickAddSheetBottom({
        isMobile: true,
        activeKeyboardInset: 320,
        lastKnownKeyboardInset: 295,
        fallbackHeight: 280,
      });
      expect(bottom).toBe(320);
    });

    it('remains elevated above keyboard when virtual keyboard dismisses (e.g. non-text field tapped)', () => {
      // User tapped Date or Repeat button: active keyboard inset drops to 0
      const bottom = computeQuickAddSheetBottom({
        isMobile: true,
        activeKeyboardInset: 0,
        lastKnownKeyboardInset: 320,
        fallbackHeight: 280,
      });
      // Stays at 320px rather than dropping to 0 (no jumping down!)
      expect(bottom).toBe(320);
    });
  });

  describe('computeQuickAddSheetMaxHeight', () => {
    it('constrains maximum height when virtual keyboard is active so content never clips behind keyboard', () => {
      const maxHeight = computeQuickAddSheetMaxHeight({ keyboardInset: 300 });
      expect(maxHeight).toBe('calc(100dvh - 300px - max(24px, env(safe-area-inset-top)))');
    });

    it('allows full viewport height minus safe areas when no keyboard is active', () => {
      const maxHeight = computeQuickAddSheetMaxHeight({ keyboardInset: 0 });
      expect(maxHeight).toBe('calc(100dvh - max(24px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))');
    });
  });
});
