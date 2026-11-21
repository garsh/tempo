import { useLayoutEffect, useState, type RefObject } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';

export const MENU_MARGIN = 8;
const DEFAULT_MENU_WIDTH = 188;
const DEFAULT_MENU_HEIGHT = 44 * 3 + 19;
const GAP = 6;

export interface ViewportBox {
  width: number;
  height: number;
  offsetTop: number;
  offsetLeft: number;
}

/** Fixed-position coordinates for a choice menu, flipped above the anchor when the visible viewport is short. */
export function dateChoiceMenuPosition(
  anchor: Pick<DOMRect, 'top' | 'bottom' | 'left'> | null,
  viewport: ViewportBox,
  menuHeight: number = DEFAULT_MENU_HEIGHT,
  menuWidth: number = DEFAULT_MENU_WIDTH,
): { top: number; left: number } {
  if (!anchor) return { top: MENU_MARGIN, left: MENU_MARGIN };

  const anchorTop = anchor.top + viewport.offsetTop;
  const anchorBottom = anchor.bottom + viewport.offsetTop;
  const anchorLeft = anchor.left + viewport.offsetLeft;
  const visibleBottom = viewport.offsetTop + viewport.height;
  const visibleRight = viewport.offsetLeft + viewport.width;

  const spaceBelow = visibleBottom - anchorBottom;
  const spaceAbove = anchorTop - viewport.offsetTop;
  let top = anchorBottom + GAP;
  if (spaceBelow < menuHeight + MENU_MARGIN && spaceAbove > spaceBelow) {
    top = anchorTop - menuHeight - GAP;
  }
  top = Math.max(
    viewport.offsetTop + MENU_MARGIN,
    Math.min(top, visibleBottom - menuHeight - MENU_MARGIN),
  );

  const left = Math.max(
    viewport.offsetLeft + MENU_MARGIN,
    Math.min(anchorLeft, visibleRight - menuWidth - MENU_MARGIN),
  );
  return { top, left };
}

export function currentViewport(): ViewportBox {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

export function handleMenuArrowKeyDown(
  e: React.KeyboardEvent<HTMLDivElement>,
  container: HTMLDivElement | null,
) {
  if (!container) return;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) return;
  const items = Array.from(
    container.querySelectorAll<HTMLElement>('[role="menuitemradio"], [role="menuitem"]')
  );
  if (items.length === 0) return;
  e.preventDefault();
  const curIdx = items.indexOf(document.activeElement as HTMLElement);
  let nextIdx = 0;
  if (e.key === 'ArrowDown') {
    nextIdx = curIdx >= 0 ? (curIdx + 1) % items.length : 0;
  } else if (e.key === 'ArrowUp') {
    nextIdx = curIdx >= 0 ? (curIdx - 1 + items.length) % items.length : items.length - 1;
  } else if (e.key === 'Home') {
    nextIdx = 0;
  } else if (e.key === 'End') {
    nextIdx = items.length - 1;
  }
  items[nextIdx]?.focus({ preventScroll: true });
}

interface UseAnchoredMenuOptions {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  cardRef: RefObject<HTMLDivElement | null>;
  menuHeight: number;
  menuWidth: number;
  onClose: () => void;
}

/**
 * Shared positioning, Escape dismissal, and initial focus management for anchored choice menus.
 */
export function useAnchoredMenu({
  open,
  anchorRef,
  cardRef,
  menuHeight,
  menuWidth,
  onClose,
}: UseAnchoredMenuOptions): { top: number; left: number } {
  const [pos, setPos] = useState({ top: MENU_MARGIN, left: MENU_MARGIN });

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      setPos(
        dateChoiceMenuPosition(
          el ? el.getBoundingClientRect() : null,
          currentViewport(),
          menuHeight,
          menuWidth,
        )
      );
    };
    update();
    window.addEventListener('resize', update);
    const vv = window.visualViewport;
    vv?.addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      window.removeEventListener('resize', update);
      vv?.removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, [open, anchorRef, menuHeight, menuWidth]);

  useEscapeKey(open, onClose, {
    capture: true,
    preventDefault: true,
    stopPropagation: true,
  });

  useLayoutEffect(() => {
    if (open) {
      cardRef.current
        ?.querySelector<HTMLElement>('[role="menuitemradio"]')
        ?.focus({ preventScroll: true });
    }
  }, [open, cardRef]);

  return pos;
}
