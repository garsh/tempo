import { useEffect, useRef } from 'react';
import { RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const MIN_CHECK_INTERVAL_MS = 30_000;
const POLL_INTERVAL_MS = 5 * 60 * 1000;

/**
 * Registers the PWA service worker in prompt mode and checks for updates when the
 * app returns to the foreground, regains connectivity, or stays open.
 * Never refreshes the page unless a new service worker is waiting and the user accepts.
 */
export function PwaUpdatePrompt() {
  const cleanupRef = useRef<(() => void) | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration || import.meta.env.DEV) return;

      cleanupRef.current?.();

      let lastCheckAt = Date.now();
      const checkForUpdate = () => {
        if (!navigator.onLine) return;
        if (registration.installing || registration.waiting) return;
        const now = Date.now();
        if (now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
        lastCheckAt = now;
        void registration.update().catch(() => {});
      };

      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      };
      const onFocus = () => checkForUpdate();
      const onOnline = () => checkForUpdate();

      document.addEventListener('visibilitychange', onVisibilityChange);
      window.addEventListener('focus', onFocus);
      window.addEventListener('online', onOnline);
      const intervalId = window.setInterval(() => {
        if (document.visibilityState === 'visible') checkForUpdate();
      }, POLL_INTERVAL_MS);

      cleanupRef.current = () => {
        document.removeEventListener('visibilitychange', onVisibilityChange);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('online', onOnline);
        window.clearInterval(intervalId);
      };
    },
  });

  useEffect(() => {
    return () => {
      cleanupRef.current?.();
      cleanupRef.current = null;
    };
  }, []);

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 sm:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--tt-elevated)] text-[var(--tt-text)] border border-[var(--tt-border)] shadow-[0_8px_24px_var(--tt-shadow)] max-w-[calc(100vw-2rem)]"
    >
      <RefreshCw className="w-4 h-4 shrink-0 text-[var(--tt-blue)]" aria-hidden="true" />
      <span className="text-sm font-medium whitespace-nowrap">Update available</span>
      <button
        type="button"
        onClick={() => void updateServiceWorker(true)}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--tt-blue)] hover:bg-[var(--tt-blue-hover)] text-white transition-colors cursor-pointer"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={() => setNeedRefresh(false)}
        aria-label="Dismiss update notification"
        className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
