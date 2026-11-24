// @vitest-environment happy-dom
import { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useTodayKey } from '../useTodayKey';

function mountReader(onRender: (key: string) => void) {
  function Reader() {
    const todayKey = useTodayKey();
    useEffect(() => {
      onRender(todayKey);
    }, [todayKey]);
    return <span data-testid="today-key">{todayKey}</span>;
  }

  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(<Reader />);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe('useTodayKey', () => {
  it('automatically updates when crossing local midnight via scheduled timeout', () => {
    vi.useFakeTimers();
    // 2026-11-23 23:59:55 local time
    vi.setSystemTime(new Date(2026, 10, 23, 23, 59, 55, 0));

    const seen: string[] = [];
    const view = mountReader((k) => seen.push(k));
    expect(view.container.textContent).toBe('2026-11-23');

    // Advance 6 seconds -> past midnight + 500ms buffer
    act(() => {
      vi.advanceTimersByTime(6_000);
    });
    expect(view.container.textContent).toBe('2026-11-24');
    expect(seen).toEqual(['2026-11-23', '2026-11-24']);

    view.unmount();
  });

  it('refreshes immediately on visibilitychange / focus after system sleep across midnight and tears down listeners on unmount', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 23, 22, 0, 0, 0));

    const removeWindowSpy = vi.spyOn(window, 'removeEventListener');
    const removeDocSpy = vi.spyOn(document, 'removeEventListener');

    const view = mountReader(() => {});
    expect(view.container.textContent).toBe('2026-11-23');

    // Simulate OS suspend jumping system clock forward without firing timers
    vi.setSystemTime(new Date(2026, 10, 25, 8, 30, 0, 0));

    // Hidden visibility event should not trigger spurious updates before wakeup
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'hidden',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(view.container.textContent).toBe('2026-11-23');

    // Becoming visible updates immediately to the new calendar day
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      value: 'visible',
    });
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    expect(view.container.textContent).toBe('2026-11-25');

    // Next jump via window focus
    vi.setSystemTime(new Date(2026, 10, 26, 9, 0, 0, 0));
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    expect(view.container.textContent).toBe('2026-11-26');

    view.unmount();
    expect(removeWindowSpy).toHaveBeenCalledWith('focus', expect.any(Function));
    expect(removeWindowSpy).toHaveBeenCalledWith('pageshow', expect.any(Function));
    expect(removeDocSpy).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
  });
});
