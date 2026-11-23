import { useEffect, useState } from 'react';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const MIN_CHECK_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 60 * 1000;

export function triggerAppUpdate() {
  window.dispatchEvent(new CustomEvent('tempo:force-update'));
}

interface UpdateStatus {
  type: 'checking' | 'downloading' | 'applying' | 'up-to-date' | 'error';
  message: string;
}

/**
 * Registers the PWA service worker in prompt mode and checks for updates when the
 * app returns to the foreground, regains connectivity, stays open, or when
 * explicitly triggered from the user menu ("Update App").
 */
export function PwaUpdatePrompt() {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      if (reg) setRegistration(reg);
    },
  });

  useEffect(() => {
    if (!registration || import.meta.env.DEV) return;

    if (registration.waiting) {
      setNeedRefresh(true);
    }

    let lastCheckAt = 0;
    const checkForUpdate = () => {
      if (!navigator.onLine) return;
      if (registration.installing || registration.waiting) return;
      const now = Date.now();
      if (now - lastCheckAt < MIN_CHECK_INTERVAL_MS) return;
      lastCheckAt = now;
      void registration.update().catch(() => {});
    };

    checkForUpdate();

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

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [registration, setNeedRefresh]);

  useEffect(() => {
    if (!import.meta.env.DEV && 'serviceWorker' in navigator) {
      let refreshing = false;
      const hadController = Boolean(navigator.serviceWorker.controller);
      const onControllerChange = () => {
        if (!hadController || refreshing) return;
        refreshing = true;
        window.location.reload();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      return () => {
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
      };
    }
  }, []);

  useEffect(() => {
    let timerId: ReturnType<typeof setTimeout> | null = null;

    const showError = (message: string) => {
      setStatus({ type: 'error', message });
      timerId = setTimeout(() => setStatus(null), 3000);
    };

    const handleForceUpdate = async () => {
      if (timerId) clearTimeout(timerId);

      if (!navigator.onLine) {
        showError('Cannot update while offline');
        return;
      }

      if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
        setStatus({ type: 'applying', message: 'Reloading app...' });
        timerId = setTimeout(() => window.location.reload(), 500);
        return;
      }

      setStatus({ type: 'checking', message: 'Checking for updates...' });

      try {
        const reg = registration ?? (await navigator.serviceWorker.getRegistration());
        if (!reg) {
          setStatus({ type: 'applying', message: 'Reloading app...' });
          timerId = setTimeout(() => window.location.reload(), 500);
          return;
        }

        const applyWorker = (worker: ServiceWorker) => {
          setStatus({ type: 'applying', message: 'Applying update...' });
          worker.postMessage({ type: 'SKIP_WAITING' });
          navigator.serviceWorker.addEventListener(
            'controllerchange',
            () => window.location.reload(),
            { once: true }
          );
          timerId = setTimeout(() => window.location.reload(), 1000);
        };

        const watchInstallingWorker = (worker: ServiceWorker) => {
          setStatus({ type: 'downloading', message: 'Downloading update...' });
          worker.addEventListener('statechange', () => {
            if (worker.state === 'installed') {
              applyWorker(worker);
            }
          });
        };

        if (reg.waiting) {
          applyWorker(reg.waiting);
          return;
        }

        if (reg.installing) {
          watchInstallingWorker(reg.installing);
          return;
        }

        let updateFound = false;
        const onUpdateFound = () => {
          updateFound = true;
          if (reg.installing) {
            watchInstallingWorker(reg.installing);
          }
        };

        reg.addEventListener('updatefound', onUpdateFound, { once: true });

        await reg.update();

        timerId = setTimeout(() => {
          if (!updateFound && !reg.waiting && !reg.installing) {
            reg.removeEventListener('updatefound', onUpdateFound);
            setStatus({ type: 'up-to-date', message: 'App is up to date' });
            timerId = setTimeout(() => setStatus(null), 2500);
          }
        }, 2500);
      } catch {
        showError('Update check failed');
      }
    };

    window.addEventListener('tempo:force-update', handleForceUpdate);
    return () => {
      window.removeEventListener('tempo:force-update', handleForceUpdate);
      if (timerId) clearTimeout(timerId);
    };
  }, [registration]);

  if (status) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="fixed bottom-20 desktop:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--tt-elevated)] text-[var(--tt-text)] border border-[var(--tt-border)] shadow-[0_8px_24px_var(--tt-shadow)] max-w-[calc(100dvw-2rem)]"
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {status.type === 'checking' || status.type === 'downloading' || status.type === 'applying' ? (
          <RefreshCw className="w-4 h-4 shrink-0 text-[var(--tt-blue)] animate-spin" aria-hidden="true" />
        ) : status.type === 'up-to-date' ? (
          <Check className="w-4 h-4 shrink-0 text-emerald-500" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <span className="text-sm font-medium whitespace-nowrap">{status.message}</span>
        <button
          type="button"
          onClick={() => setStatus(null)}
          aria-label="Dismiss notification"
          className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>
    );
  }

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-20 desktop:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--tt-elevated)] text-[var(--tt-text)] border border-[var(--tt-border)] shadow-[0_8px_24px_var(--tt-shadow)] max-w-[calc(100dvw-2rem)]"
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
