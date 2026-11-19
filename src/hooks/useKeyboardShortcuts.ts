import { useEffect, useRef } from 'react';

export type ShortcutHandlers = {
  onCapture?: () => void;
  onSearch?: () => void;
  onEscape?: () => void;
  onOpenHelp?: () => void;
};

function isTypingTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (el.isContentEditable) return true;
  return false;
}

/**
 * Global keyboard shortcuts for task capture and dialogs.
 * Ignored while typing in inputs (except Escape).
 */
export function useKeyboardShortcuts(handlers: ShortcutHandlers, enabled: boolean = true): void {
  const handlersRef = useRef(handlers);
  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    if (!enabled) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const h = handlersRef.current;
      const typing = isTypingTarget(e.target);

      if (e.key === 'Escape') {
        h.onEscape?.();
        return;
      }

      if (typing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      switch (e.key) {
        case 'n':
        case 'c':
          e.preventDefault();
          h.onCapture?.();
          break;
        case '/':
          if (h.onSearch) {
            e.preventDefault();
            h.onSearch();
          }
          break;
        case '?':
          h.onOpenHelp?.();
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [enabled]);
}
