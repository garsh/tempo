import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useBottomBannerSlot } from '../domain/bottomBannerCoordinator';

const MIN_CHECK_INTERVAL_MS = 15_000;
const POLL_INTERVAL_MS = 60 * 1000;
const APPLY_FALLBACK_TIMEOUT_MS = 2_000;
const INSTALL_TIMEOUT_MS = 15_000;
const FORCE_UPDATE_WAIT_MS = 2_500;
const STATUS_DISMISS_MS = 2_500;
const ERROR_DISMISS_MS = 3_000;
const DEV_RELOAD_DELAY_MS = 500;

export function triggerAppUpdate() {
  window.dispatchEvent(new CustomEvent('tempo:force-update'));
}

interface UpdateStatus {
  type: 'checking' | 'downloading' | 'applying' | 'up-to-date' | 'error';
  message: string;
}

interface PwaUpdatePromptProps {
  onReload?: () => void;
  isDev?: boolean;
}

/**
 * Registers the PWA service worker in prompt mode and checks for updates when the
 * app returns to the foreground, regains connectivity, stays open, or when
 * explicitly triggered from the user menu ("Update App").
 */
export function PwaUpdatePrompt({
  onReload,
  isDev = import.meta.env.DEV,
}: PwaUpdatePromptProps = {}) {
  const [registration, setRegistration] = useState<ServiceWorkerRegistration | null>(null);
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissedWorker, setDismissedWorker] = useState<ServiceWorker | null>(null);

  const mountedRef = useRef(true);
  const reloadingRef = useRef(false);
  const applyingUpdateRef = useRef(false);
  const onReloadRef = useRef(onReload);
  const dismissedWorkerRef = useRef<ServiceWorker | null>(null);
  const pendingCleanupRef = useRef<() => void>(() => {});
  const statusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hadControllerRef = useRef(
    typeof navigator !== 'undefined' && 'serviceWorker' in navigator
      ? Boolean(navigator.serviceWorker.controller)
      : false
  );
  const showPromptRef = useRef(false);

  useEffect(() => {
    onReloadRef.current = onReload;
  }, [onReload]);

  const clearStatusTimer = useCallback(() => {
    if (statusTimerRef.current) {
      clearTimeout(statusTimerRef.current);
      statusTimerRef.current = null;
    }
  }, []);

  const clearPendingAction = useCallback(() => {
    const cleanup = pendingCleanupRef.current;
    pendingCleanupRef.current = () => {};
    cleanup();
    clearStatusTimer();
  }, [clearStatusTimer]);

  const reloadOnce = useCallback(() => {
    if (reloadingRef.current) return;
    reloadingRef.current = true;
    clearPendingAction();
    if (onReloadRef.current) {
      onReloadRef.current();
    } else {
      window.location.reload();
    }
  }, [clearPendingAction]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearPendingAction();
    };
  }, [clearPendingAction]);

  const {
    needRefresh: [needRefresh, setNeedRefresh],
  } = useRegisterSW({
    onRegisteredSW(_swUrl, reg) {
      if (reg) setRegistration(reg);
    },
    onNeedReload() {
      reloadOnce();
    },
  });

  const showPrompt =
    needRefresh && !(registration?.waiting && dismissedWorker === registration.waiting);
  const bannerAllowed = useBottomBannerSlot('pwa-update', Boolean(status) || showPrompt);

  useEffect(() => {
    showPromptRef.current = showPrompt;
  }, [showPrompt]);

  const showError = useCallback(
    (message: string) => {
      clearPendingAction();
      applyingUpdateRef.current = false;
      if (!mountedRef.current) return;
      setStatus({ type: 'error', message });
      statusTimerRef.current = setTimeout(() => {
        statusTimerRef.current = null;
        if (mountedRef.current) setStatus(null);
      }, ERROR_DISMISS_MS);
    },
    [clearPendingAction]
  );

  const applyWorker = useCallback(
    (initialWorker: ServiceWorker, reg?: ServiceWorkerRegistration | null) => {
      const run = (worker: ServiceWorker) => {
        clearPendingAction();
        applyingUpdateRef.current = true;
        setNeedRefresh(false);
        if (mountedRef.current) {
          setStatus({ type: 'applying', message: 'Applying update...' });
        }

        if (worker.state === 'activated') {
          reloadOnce();
          return;
        }

        if (worker.state === 'redundant') {
          if (reg?.waiting && reg.waiting !== worker) {
            run(reg.waiting);
            return;
          }
          reloadOnce();
          return;
        }

        let active = true;
        const cleanup = () => {
          if (!active) return;
          active = false;
          worker.removeEventListener('statechange', onStateChange);
          if ('serviceWorker' in navigator) {
            navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
          }
          clearTimeout(fallbackTimer);
        };

        const onControllerChange = () => {
          cleanup();
          reloadOnce();
        };

        const onStateChange = () => {
          if (!active) return;
          if (worker.state === 'activated') {
            cleanup();
            reloadOnce();
          } else if (worker.state === 'redundant') {
            cleanup();
            if (reg?.waiting && reg.waiting !== worker) {
              run(reg.waiting);
              return;
            }
            reloadOnce();
          }
        };

        const fallbackTimer = setTimeout(() => {
          cleanup();
          reloadOnce();
        }, APPLY_FALLBACK_TIMEOUT_MS);

        pendingCleanupRef.current = cleanup;
        worker.addEventListener('statechange', onStateChange);
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.addEventListener('controllerchange', onControllerChange, {
            once: true,
          });
        }

        try {
          worker.postMessage({ type: 'SKIP_WAITING' });
        } catch {
          cleanup();
          reloadOnce();
        }
      };

      run(initialWorker);
    },
    [clearPendingAction, reloadOnce, setNeedRefresh]
  );

  const watchInstallingWorker = useCallback(
    (
      worker: ServiceWorker,
      reg: ServiceWorkerRegistration,
      reloadOnFailure: boolean
    ) => {
      clearPendingAction();
      applyingUpdateRef.current = true;
      setNeedRefresh(false);
      if (mountedRef.current) {
        setStatus({ type: 'downloading', message: 'Downloading update...' });
      }

      let active = true;
      let currentCleanup = () => {};

      const stopAll = () => {
        if (!active) return;
        active = false;
        clearTimeout(installTimer);
        currentCleanup();
      };

      const installTimer = setTimeout(() => {
        stopAll();
        if (reg.waiting) {
          applyWorker(reg.waiting, reg);
        } else if (reloadOnFailure) {
          reloadOnce();
        } else {
          showError('Update timed out');
        }
      }, INSTALL_TIMEOUT_MS);

      const attach = (currentWorker: ServiceWorker) => {
        if (!active) return;
        currentCleanup();

        const handleState = () => {
          if (!active) return;
          if (currentWorker.state === 'installed') {
            stopAll();
            applyWorker(currentWorker, reg);
          } else if (currentWorker.state === 'activated') {
            stopAll();
            reloadOnce();
          } else if (currentWorker.state === 'redundant') {
            if (reg.waiting && reg.waiting !== currentWorker) {
              stopAll();
              applyWorker(reg.waiting, reg);
            } else if (reg.installing && reg.installing !== currentWorker) {
              attach(reg.installing);
            } else {
              stopAll();
              if (reloadOnFailure) {
                reloadOnce();
              } else {
                showError('Update failed');
              }
            }
          }
        };

        currentWorker.addEventListener('statechange', handleState);
        currentCleanup = () => {
          currentWorker.removeEventListener('statechange', handleState);
        };

        handleState();
      };

      pendingCleanupRef.current = stopAll;
      attach(worker);
    },
    [applyWorker, clearPendingAction, reloadOnce, setNeedRefresh, showError]
  );

  const handleRefresh = useCallback(async () => {
    if (applyingUpdateRef.current) return;
    clearPendingAction();
    applyingUpdateRef.current = true;
    setNeedRefresh(false);
    if (mountedRef.current) {
      setStatus({ type: 'applying', message: 'Applying update...' });
    }

    if (isDev || !('serviceWorker' in navigator)) {
      reloadOnce();
      return;
    }

    if (registration?.waiting) {
      applyWorker(registration.waiting, registration);
      return;
    }

    if (registration?.installing) {
      watchInstallingWorker(registration.installing, registration, true);
      return;
    }

    try {
      const reg = (await navigator.serviceWorker.getRegistration()) ?? registration;
      if (!mountedRef.current) return;

      if (reg?.waiting) {
        applyWorker(reg.waiting, reg);
        return;
      }

      if (reg?.installing) {
        watchInstallingWorker(reg.installing, reg, true);
        return;
      }

      reloadOnce();
    } catch {
      if (mountedRef.current) {
        reloadOnce();
      }
    }
  }, [
    applyWorker,
    clearPendingAction,
    isDev,
    registration,
    reloadOnce,
    setNeedRefresh,
    watchInstallingWorker,
  ]);

  const handleDismissPrompt = useCallback(() => {
    const waiting = registration?.waiting ?? null;
    dismissedWorkerRef.current = waiting;
    setDismissedWorker(waiting);
    setNeedRefresh(false);
  }, [registration, setNeedRefresh]);

  useEffect(() => {
    if (!registration || isDev) return;

    const cleanups: Array<() => void> = [];

    const hasActiveOrController = () =>
      Boolean(
        registration.active ||
          ('serviceWorker' in navigator && navigator.serviceWorker.controller)
      );

    const maybePromptForWaiting = (worker: ServiceWorker | null) => {
      if (!worker || registration.waiting !== worker) return;
      if (!hasActiveOrController()) return;
      if (applyingUpdateRef.current) return;
      if (dismissedWorkerRef.current === worker) return;
      setNeedRefresh(true);
    };

    const watchWorker = (worker: ServiceWorker | null) => {
      if (!worker) return;
      if (worker.state === 'installed') {
        maybePromptForWaiting(worker);
        return;
      }
      if (worker.state === 'activated' || worker.state === 'redundant') {
        return;
      }
      const onStateChange = () => {
        if (worker.state === 'installed') {
          maybePromptForWaiting(worker);
        }
        if (
          worker.state === 'installed' ||
          worker.state === 'activated' ||
          worker.state === 'redundant'
        ) {
          worker.removeEventListener('statechange', onStateChange);
        }
      };
      worker.addEventListener('statechange', onStateChange);
      cleanups.push(() => worker.removeEventListener('statechange', onStateChange));
    };

    if (registration.waiting) {
      maybePromptForWaiting(registration.waiting);
    }
    if (registration.installing) {
      watchWorker(registration.installing);
    }

    const onUpdateFound = () => {
      if (registration.installing) {
        watchWorker(registration.installing);
      }
      if (registration.waiting) {
        maybePromptForWaiting(registration.waiting);
      }
    };

    registration.addEventListener('updatefound', onUpdateFound);

    let lastCheckAt = 0;
    const checkForUpdate = () => {
      if (!navigator.onLine) return;
      if (registration.waiting) {
        maybePromptForWaiting(registration.waiting);
        return;
      }
      if (registration.installing) return;
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
      registration.removeEventListener('updatefound', onUpdateFound);
      cleanups.forEach((fn) => fn());
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('online', onOnline);
      window.clearInterval(intervalId);
    };
  }, [isDev, registration, setNeedRefresh]);

  useEffect(() => {
    if (isDev || !('serviceWorker' in navigator)) return;

    const onControllerChange = () => {
      if (applyingUpdateRef.current || showPromptRef.current) {
        reloadOnce();
        return;
      }
      if (!hadControllerRef.current) {
        hadControllerRef.current = true;
        return;
      }
      reloadOnce();
    };

    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, [isDev, reloadOnce]);

  useEffect(() => {
    const handleForceUpdate = async () => {
      if (applyingUpdateRef.current) return;
      clearPendingAction();

      if (!navigator.onLine) {
        showError('Cannot update while offline');
        return;
      }

      if (isDev || !('serviceWorker' in navigator)) {
        applyingUpdateRef.current = true;
        setNeedRefresh(false);
        if (mountedRef.current) {
          setStatus({ type: 'applying', message: 'Reloading app...' });
        }
        statusTimerRef.current = setTimeout(() => {
          statusTimerRef.current = null;
          reloadOnce();
        }, DEV_RELOAD_DELAY_MS);
        return;
      }

      setStatus({ type: 'checking', message: 'Checking for updates...' });

      try {
        const reg = (await navigator.serviceWorker.getRegistration()) ?? registration;
        if (!mountedRef.current || applyingUpdateRef.current) return;

        if (!reg) {
          applyingUpdateRef.current = true;
          setNeedRefresh(false);
          setStatus({ type: 'applying', message: 'Reloading app...' });
          statusTimerRef.current = setTimeout(() => {
            statusTimerRef.current = null;
            reloadOnce();
          }, DEV_RELOAD_DELAY_MS);
          return;
        }

        if (reg.waiting) {
          applyWorker(reg.waiting, reg);
          return;
        }

        if (reg.installing) {
          watchInstallingWorker(reg.installing, reg, false);
          return;
        }

        let settled = false;
        let waitTimer: ReturnType<typeof setTimeout> | null = null;

        const cleanupWait = () => {
          if (settled) return;
          settled = true;
          reg.removeEventListener('updatefound', onUpdateFound);
          if (waitTimer) {
            clearTimeout(waitTimer);
            waitTimer = null;
          }
        };

        const onUpdateFound = () => {
          if (settled) return;
          if (reg.waiting) {
            cleanupWait();
            applyWorker(reg.waiting, reg);
          } else if (reg.installing) {
            cleanupWait();
            watchInstallingWorker(reg.installing, reg, false);
          }
        };

        pendingCleanupRef.current = cleanupWait;
        reg.addEventListener('updatefound', onUpdateFound);

        await reg.update();
        if (!mountedRef.current || settled || applyingUpdateRef.current) return;

        if (reg.waiting) {
          cleanupWait();
          applyWorker(reg.waiting, reg);
          return;
        }

        if (reg.installing) {
          cleanupWait();
          watchInstallingWorker(reg.installing, reg, false);
          return;
        }

        waitTimer = setTimeout(() => {
          if (settled || !mountedRef.current) return;
          cleanupWait();
          if (reg.waiting) {
            applyWorker(reg.waiting, reg);
          } else if (reg.installing) {
            watchInstallingWorker(reg.installing, reg, false);
          } else {
            setStatus({ type: 'up-to-date', message: 'App is up to date' });
            statusTimerRef.current = setTimeout(() => {
              statusTimerRef.current = null;
              if (mountedRef.current) setStatus(null);
            }, STATUS_DISMISS_MS);
          }
        }, FORCE_UPDATE_WAIT_MS);
      } catch {
        showError('Update check failed');
      }
    };

    const onForceUpdate = () => {
      void handleForceUpdate();
    };

    window.addEventListener('tempo:force-update', onForceUpdate);
    return () => {
      window.removeEventListener('tempo:force-update', onForceUpdate);
    };
  }, [
    applyWorker,
    clearPendingAction,
    isDev,
    registration,
    reloadOnce,
    setNeedRefresh,
    showError,
    watchInstallingWorker,
  ]);

  if (bannerAllowed && status) {
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
        {status.type !== 'applying' && (
          <button
            type="button"
            onClick={() => {
              clearPendingAction();
              applyingUpdateRef.current = false;
              setStatus(null);
            }}
            aria-label="Dismiss notification"
            className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (!bannerAllowed || !showPrompt) return null;

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
        onClick={() => void handleRefresh()}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--tt-blue)] hover:bg-[var(--tt-blue-hover)] text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
      >
        Refresh
      </button>
      <button
        type="button"
        onClick={handleDismissPrompt}
        aria-label="Dismiss update notification"
        className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
