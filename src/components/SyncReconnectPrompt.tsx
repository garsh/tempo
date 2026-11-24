import { useEffect, useRef, useState } from 'react';
import { AlertCircle, Check, RefreshCw, X } from 'lucide-react';
import type { SyncNowResult } from '../hooks/useAutoSync';
import type { SyncAuthPromptState } from '../sync/autoSync';

interface SyncReconnectPromptProps {
  authPrompt: SyncAuthPromptState | null | undefined;
  hidden?: boolean;
  onReconnect: () => Promise<SyncNowResult> | void;
  onDismiss: () => void;
}

type PromptUiState = 'idle' | 'syncing' | 'synced' | 'error';

/**
 * Floating bottom-aligned toast matching PwaUpdatePrompt that surfaces a direct
 * click target when background Drive sync is paused due to blocked popups or
 * expired Google authorization. Calling `onReconnect()` synchronously inside
 * `onClick` preserves browser user-gesture activation for the OAuth popup.
 */
export function SyncReconnectPrompt({
  authPrompt,
  hidden = false,
  onReconnect,
  onDismiss,
}: SyncReconnectPromptProps) {
  const [uiState, setUiState] = useState<PromptUiState>('idle');
  const [errorMessage, setErrorMessage] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimer();
    };
  }, []);

  if (hidden) return null;

  const containerClass =
    'fixed bottom-20 desktop:bottom-5 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-4 py-2.5 rounded-xl bg-[var(--tt-elevated)] text-[var(--tt-text)] border border-[var(--tt-border)] shadow-[0_8px_24px_var(--tt-shadow)] max-w-[calc(100dvw-2rem)]';

  const handleReconnect = () => {
    if (uiState === 'syncing') return;
    clearTimer();
    const pending = onReconnect();
    setUiState('syncing');
    setErrorMessage('');
    void Promise.resolve(pending)
      .then((res) => {
        if (!mountedRef.current) return;
        if (res?.synced) {
          setUiState('synced');
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) setUiState('idle');
          }, 2500);
        } else if (res?.authBlocked) {
          setUiState('idle');
        } else if (res?.error) {
          setUiState('error');
          setErrorMessage(res.error);
          timerRef.current = setTimeout(() => {
            if (mountedRef.current) {
              setUiState('idle');
              setErrorMessage('');
            }
          }, 4000);
        } else {
          setUiState('idle');
        }
      })
      .catch((err: unknown) => {
        if (!mountedRef.current) return;
        setUiState('error');
        setErrorMessage(err instanceof Error ? err.message : String(err));
        timerRef.current = setTimeout(() => {
          if (mountedRef.current) {
            setUiState('idle');
            setErrorMessage('');
          }
        }, 4000);
      });
  };

  const handleDismissStatus = () => {
    clearTimer();
    setUiState('idle');
    setErrorMessage('');
    if (authPrompt && !authPrompt.dismissed) {
      onDismiss();
    }
  };

  if (uiState !== 'idle') {
    return (
      <div
        role="status"
        aria-live="polite"
        data-testid="sync-reconnect-prompt"
        className={containerClass}
        style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {uiState === 'syncing' ? (
          <RefreshCw className="w-4 h-4 shrink-0 text-[var(--tt-blue)] animate-spin" aria-hidden="true" />
        ) : uiState === 'synced' ? (
          <Check className="w-4 h-4 shrink-0 text-emerald-500" aria-hidden="true" />
        ) : (
          <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
        )}
        <span className="text-sm font-medium leading-snug">
          {uiState === 'syncing'
            ? 'Syncing with Google Drive…'
            : uiState === 'synced'
              ? 'Synced with Google Drive'
              : errorMessage}
        </span>
        {uiState !== 'syncing' && (
          <button
            type="button"
            onClick={handleDismissStatus}
            aria-label="Dismiss sync notification"
            className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        )}
      </div>
    );
  }

  if (!authPrompt || authPrompt.dismissed) return null;

  const copy =
    authPrompt.reason === 'popup_blocked_interactive'
      ? {
          message: 'Allow popups for this site, then retry',
          action: 'Try again',
          isWarning: true,
        }
      : authPrompt.reason === 'popup_blocked'
        ? {
            message: 'Sync paused — popup blocked',
            action: 'Allow & Sync',
            isWarning: true,
          }
        : {
            message: 'Google Drive sign-in needed',
            action: 'Sign in',
            isWarning: false,
          };

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="sync-reconnect-prompt"
      className={containerClass}
      style={{ marginBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {copy.isWarning ? (
        <AlertCircle className="w-4 h-4 shrink-0 text-amber-500" aria-hidden="true" />
      ) : (
        <RefreshCw className="w-4 h-4 shrink-0 text-[var(--tt-blue)]" aria-hidden="true" />
      )}
      <span className="text-sm font-medium leading-snug">{copy.message}</span>
      <button
        type="button"
        onClick={handleReconnect}
        className="px-3 py-1 rounded-lg text-xs font-semibold bg-[var(--tt-blue)] hover:bg-[var(--tt-blue-hover)] text-white transition-colors cursor-pointer shrink-0 whitespace-nowrap"
      >
        {copy.action}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss sync notification"
        className="p-1 rounded-lg text-[var(--tt-secondary)] hover:bg-[var(--tt-hover)] transition-colors cursor-pointer"
      >
        <X className="w-4 h-4" aria-hidden="true" />
      </button>
    </div>
  );
}
