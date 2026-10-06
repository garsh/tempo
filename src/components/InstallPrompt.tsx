import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tempo_install_prompt_dismissed';

/** TickTick chrome via theme CSS variables — follows prefers-color-scheme (light default). */
const S = {
  wrap: {
    position: 'fixed' as const,
    bottom: 16,
    left: 16,
    right: 16,
    zIndex: 60,
    maxWidth: 384,
    marginLeft: 'auto',
  },
  card: {
    display: 'flex',
    gap: 12,
    alignItems: 'flex-start',
    padding: 16,
    borderRadius: 16,
    border: '1px solid var(--tt-border)',
    background: 'var(--tt-elevated)',
    boxShadow: '0 12px 40px var(--tt-shadow)',
    color: 'var(--tt-text)',
    fontFamily:
      '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  iconBox: {
    padding: 8,
    borderRadius: 12,
    background: 'var(--tt-blue-soft)',
    color: 'var(--tt-blue)',
    flexShrink: 0,
  },
  title: { margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--tt-text)' },
  body: { margin: '4px 0 0', fontSize: 12, lineHeight: 1.45, color: 'var(--tt-secondary)' },
  row: { display: 'flex', gap: 8, marginTop: 12 },
  installBtn: {
    padding: '6px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--tt-blue)',
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 600,
    cursor: 'pointer',
  },
  dismissBtn: {
    padding: '6px 14px',
    borderRadius: 12,
    border: 'none',
    background: 'var(--tt-hover)',
    color: 'var(--tt-secondary)',
    fontSize: 12,
    fontWeight: 500,
    cursor: 'pointer',
  },
  close: {
    padding: 4,
    border: 'none',
    background: 'transparent',
    color: 'var(--tt-muted)',
    cursor: 'pointer',
  },
};

export function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === '1') return;
    if (window.matchMedia('(display-mode: standalone)').matches) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener('beforeinstallprompt', onBip);

    // Dev / static-preview helper: show light prompt once if never dismissed
    // (beforeinstallprompt often never fires on http.server).
    const params = new URLSearchParams(window.location.search);
    if (params.get('installPrompt') === '1' || localStorage.getItem('tempo_force_install_prompt') === '1') {
      setVisible(true);
    }

    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (!visible) return null;
  // Allow force-preview without a real beforeinstallprompt event
  const canInstall = Boolean(deferred);

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    localStorage.removeItem('tempo_force_install_prompt');
    setVisible(false);
  };

  const install = async () => {
    if (!deferred) {
      dismiss();
      return;
    }
    await deferred.prompt();
    try {
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
    setVisible(false);
  };

  return (
    <div style={S.wrap} data-tempo-install-prompt="themed">
      <div style={S.card}>
        <div style={S.iconBox}>
          <Download className="w-5 h-5" color="var(--tt-blue)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={S.title}>Install Tempo</p>
          <p style={S.body}>
            Add to your home screen for a full-screen app, quicker capture, and more reliable
            reminders.
          </p>
          <div style={S.row}>
            <button type="button" onClick={install} style={S.installBtn}>
              {canInstall ? 'Install' : 'Got it'}
            </button>
            <button type="button" onClick={dismiss} style={S.dismissBtn}>
              Not now
            </button>
          </div>
        </div>
        <button type="button" onClick={dismiss} style={S.close} aria-label="Dismiss">
          <X className="w-4 h-4" color="var(--tt-muted)" />
        </button>
      </div>
    </div>
  );
}
