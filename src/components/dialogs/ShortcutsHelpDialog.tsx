import { useId, useRef } from 'react';
import { Keyboard, X } from 'lucide-react';
import { ModalDialog } from '../ui/ModalDialog';

interface ShortcutsHelpDialogProps {
  open: boolean;
  onClose: () => void;
}

const SHORTCUTS: readonly [string, string][] = [
  ['n / c', 'New task (capture)'],
  ['/', 'Search tasks'],
  ['1 / 2 / 3', 'Calendar / Tasks / Recurring'],
  ['t', 'Jump to Today'],
  ['[ / ]', 'Previous / Next period'],
  ['Esc', 'Close modals'],
  ['?', 'This help'],
];

/**
 * Keyboard shortcuts reference modal.
 */
export function ShortcutsHelpDialog({ open, onClose }: ShortcutsHelpDialogProps) {
  const headingId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      ariaLabelledBy={headingId}
      initialFocusRef={closeBtnRef}
      className="m-auto p-0 w-[min(calc(100dvw-2rem),28rem)] max-w-none max-h-[calc(100dvh-1.5rem)] overflow-y-auto bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl text-tt-text"
    >
      <div className="p-6 compact-landscape:p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 id={headingId} className="text-lg font-bold text-tt-text inline-flex items-center gap-2">
            <Keyboard className="w-5 h-5 text-tt-blue" />
            Shortcuts
          </h3>
          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close shortcuts"
            className="p-1.5 rounded-lg text-tt-secondary hover:text-tt-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tt-blue cursor-pointer"
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
    </ModalDialog>
  );
}
