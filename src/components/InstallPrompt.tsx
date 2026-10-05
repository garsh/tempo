import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const DISMISS_KEY = 'tempo_install_prompt_dismissed';

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
    return () => window.removeEventListener('beforeinstallprompt', onBip);
  }, []);

  if (!visible || !deferred) return null;

  const dismiss = () => {
    localStorage.setItem(DISMISS_KEY, '1');
    setVisible(false);
  };

  const install = async () => {
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
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-96 z-[60]">
      <div className="rounded-2xl border border-tt-border bg-white shadow-xl shadow-black/10 p-4 flex gap-3 items-start">
        <div className="p-2 rounded-xl bg-tt-blue-soft text-tt-blue shrink-0">
          <Download className="w-5 h-5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-tt-text">Install Tempo</p>
          <p className="text-xs text-tt-secondary mt-0.5 leading-relaxed">
            Add to your home screen for a full-screen app, quicker capture, and more reliable
            reminders.
          </p>
          <div className="flex gap-2 mt-3">
            <button
              type="button"
              onClick={install}
              className="px-3.5 py-1.5 rounded-xl bg-tt-blue hover:bg-tt-blue-hover text-white text-xs font-semibold"
            >
              Install
            </button>
            <button
              type="button"
              onClick={dismiss}
              className="px-3.5 py-1.5 rounded-xl bg-tt-sidebar hover:bg-black/[0.06] text-tt-secondary text-xs font-medium"
            >
              Not now
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="p-1 text-tt-muted hover:text-tt-text"
          aria-label="Dismiss"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
