import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { Check } from 'lucide-react';

export type DatePreset = 'today' | 'tomorrow' | 'none' | null;

interface DateChoiceMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  active: DatePreset;
  dateValue: string;
  mode?: 'due' | 'last_done';
  allowNoDate?: boolean;
  maxDate?: string;
  onClose: () => void;
  onToday: () => void;
  onTomorrow?: () => void;
  onNoDate?: () => void;
  onDatePicked: (value: string) => void;
}

const MENU_WIDTH = 196;
const DEFAULT_MENU_WIDTH = 188;
const MENU_HEIGHT = 44 * 3 + 19;
const GAP = 6;
const MARGIN = 8;

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
  menuHeight: number = MENU_HEIGHT,
  menuWidth: number = DEFAULT_MENU_WIDTH,
): { top: number; left: number } {
  if (!anchor) return { top: MARGIN, left: MARGIN };

  const anchorTop = anchor.top + viewport.offsetTop;
  const anchorBottom = anchor.bottom + viewport.offsetTop;
  const anchorLeft = anchor.left + viewport.offsetLeft;
  const visibleBottom = viewport.offsetTop + viewport.height;
  const visibleRight = viewport.offsetLeft + viewport.width;

  const spaceBelow = visibleBottom - anchorBottom;
  const spaceAbove = anchorTop - viewport.offsetTop;
  let top = anchorBottom + GAP;
  if (spaceBelow < menuHeight + MARGIN && spaceAbove > spaceBelow) {
    top = anchorTop - menuHeight - GAP;
  }
  top = Math.max(viewport.offsetTop + MARGIN, Math.min(top, visibleBottom - menuHeight - MARGIN));

  const left = Math.max(
    viewport.offsetLeft + MARGIN,
    Math.min(anchorLeft, visibleRight - menuWidth - MARGIN),
  );
  return { top, left };
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

function currentViewport(): ViewportBox {
  const vv = window.visualViewport;
  return {
    width: vv?.width ?? window.innerWidth,
    height: vv?.height ?? window.innerHeight,
    offsetTop: vv?.offsetTop ?? 0,
    offsetLeft: vv?.offsetLeft ?? 0,
  };
}

const row =
  'w-full h-[44px] flex items-center pl-[20px] pr-[16px] gap-3 text-left text-[17px] leading-none text-tt-text outline-none cursor-pointer hover:bg-tt-hover focus-visible:bg-tt-hover active:bg-tt-hover';

export function DateChoiceMenu({
  open,
  anchorRef,
  active,
  dateValue,
  mode = 'due',
  allowNoDate = true,
  maxDate,
  onClose,
  onToday,
  onTomorrow,
  onNoDate,
  onDatePicked,
}: DateChoiceMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: MARGIN, left: MARGIN });
  const itemCount =
    mode === 'last_done' ? 3 : allowNoDate && onNoDate ? 4 : 3;
  const menuHeight = 44 * itemCount + 19;

  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      setPos(
        dateChoiceMenuPosition(
          el ? el.getBoundingClientRect() : null,
          currentViewport(),
          menuHeight,
          MENU_WIDTH,
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
  }, [open, anchorRef, menuHeight]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  useLayoutEffect(() => {
    if (open) cardRef.current?.querySelector<HTMLElement>('[role="menuitemradio"]')?.focus({ preventScroll: true });
  }, [open]);

  if (!open) return null;

  const choose = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose} data-testid="date-choice-menu-layer">
      <div
        ref={cardRef}
        role="menu"
        id="date-choice-menu"
        aria-label={mode === 'last_done' ? 'Choose last done date' : 'Choose a date'}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleMenuArrowKeyDown(e, cardRef.current)}
        className="absolute w-[196px] rounded-[16px] bg-tt-menu pt-[10px] pb-[9px] shadow-[0_6px_28px_var(--tt-shadow),0_1px_4px_var(--tt-shadow)]"
        style={{ top: pos.top, left: pos.left }}
      >
        {mode === 'last_done' ? (
          <>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={active === 'none'}
              className={row}
              onClick={choose(onNoDate)}
            >
              Not done yet
              {active === 'none' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={active === 'today'}
              className={row}
              onClick={choose(onToday)}
            >
              Today
              {active === 'today' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
            </button>
            <label role="menuitem" className={`${row} relative`}>
              <span className="pointer-events-none">Select</span>
              <input
                type="date"
                aria-label="Select"
                value={dateValue}
                max={maxDate}
                onChange={(e) => {
                  if (!e.target.value) return;
                  onDatePicked(e.target.value);
                  onClose();
                }}
                className="absolute inset-0 h-full w-full cursor-pointer text-[16px] opacity-0"
              />
            </label>
          </>
        ) : (
          <>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={active === 'today'}
              className={row}
              onClick={choose(onToday)}
            >
              Today
              {active === 'today' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
            </button>
            {onTomorrow && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active === 'tomorrow'}
                className={row}
                onClick={choose(onTomorrow)}
              >
                Tomorrow
                {active === 'tomorrow' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
              </button>
            )}
            <label role="menuitem" className={`${row} relative`}>
              <span className="pointer-events-none">Select</span>
              <input
                type="date"
                aria-label="Select"
                value={dateValue}
                onChange={(e) => {
                  if (!e.target.value) return;
                  onDatePicked(e.target.value);
                  onClose();
                }}
                className="absolute inset-0 h-full w-full cursor-pointer text-[16px] opacity-0"
              />
            </label>
            {allowNoDate && onNoDate && (
              <button
                type="button"
                role="menuitemradio"
                aria-checked={active === 'none'}
                className={row}
                onClick={choose(onNoDate)}
              >
                No date
                {active === 'none' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
