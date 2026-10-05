import { useEffect, useRef } from 'react';

export type ShortcutHandlers = {
  onCapture?: () => void;
  onSearchFocus?: () => void;
  onEscape?: () => void;
  onGoToday?: () => void;
  onGoTomorrow?: () => void;
  onGoNext7?: () => void;
  onGoInbox?: () => void;
  onGoCalendarMonth?: () => void;
  onGoCalendarAgenda?: () => void;
  onToggleSidebar?: () => void;
  onNextTask?: () => void;
  onPrevTask?: () => void;
  onCompleteSelected?: () => void;
  onEditSelected?: () => void;
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
 * Global keyboard shortcuts for capture and navigation (Phase 3).
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
          e.preventDefault();
          h.onSearchFocus?.();
          break;
        case '1':
          h.onGoToday?.();
          break;
        case '2':
          h.onGoTomorrow?.();
          break;
        case '3':
          h.onGoNext7?.();
          break;
        case '4':
          h.onGoInbox?.();
          break;
        case 'm':
          h.onGoCalendarMonth?.();
          break;
        case 'a':
          h.onGoCalendarAgenda?.();
          break;
        case '\\':
          h.onToggleSidebar?.();
          break;
        case 'j':
          e.preventDefault();
          h.onNextTask?.();
          break;
        case 'k':
          e.preventDefault();
          h.onPrevTask?.();
          break;
        case 'x':
          h.onCompleteSelected?.();
          break;
        case 'e':
          h.onEditSelected?.();
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
