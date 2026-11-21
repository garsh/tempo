import { Keyboard, X } from 'lucide-react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

interface ShortcutsHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: readonly [string, string][] = [
  ['n / c', 'New task (capture)'],
  ['/', 'Search tasks'],
  ['Esc', 'Close modals'],
  ['?', 'This help'],
];

/**
 * Keyboard shortcuts reference modal.
 */
export function ShortcutsHelpDialog({ open, onClose }: ShortcutsHelpDialogProps) {
  useEscapeKey(open, onClose, { capture: true, stopPropagation: true });

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-md bg-tt-elevated border border-tt-border rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-tt-text inline-flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-tt-blue" />
            Shortcuts
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1.5 text-tt-secondary hover:text-tt-text"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <ul className="space-y-2 text-xs text-tt-text">
          {SHORTCUTS.map(([key, desc]) => (
            <li key={key} className="flex items-center justify-between gap-3">
              <span className="text-tt-secondary">{desc}</span>
              <kbd className="px-2 py-1 rounded-lg bg-tt-sidebar text-tt-text font-mono text-[11px]">
                {key}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
