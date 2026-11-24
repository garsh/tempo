import { useRef, type RefObject } from 'react';
import { Check } from 'lucide-react';
import type { RecurrenceType } from '../../types/task';
import { handleMenuArrowKeyDown, useAnchoredMenu } from './useAnchoredMenu';

interface RepeatChoiceMenuProps {
  open: boolean;
  anchorRef: RefObject<HTMLElement | null>;
  active: RecurrenceType | null;
  onClose: () => void;
  onSelectFixed: () => void;
  onSelectApproximate: () => void;
  onSelectAnnualWindow: () => void;
  onClearRepeat?: () => void;
}

const MENU_WIDTH = 240;

export function RepeatChoiceMenu({
  open,
  anchorRef,
  active,
  onClose,
  onSelectFixed,
  onSelectApproximate,
  onSelectAnnualWindow,
  onClearRepeat,
}: RepeatChoiceMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const menuHeight = active ? 54 * 3 + 44 + 28 : 54 * 3 + 19;
  const pos = useAnchoredMenu({
    open,
    anchorRef,
    cardRef,
    menuHeight,
    menuWidth: MENU_WIDTH,
    onClose,
  });

  if (!open) return null;

  const choose = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };

  const row =
    'w-full flex items-center pl-[18px] pr-[16px] py-2.5 gap-3 text-left text-tt-text outline-none cursor-pointer hover:bg-tt-hover focus-visible:bg-tt-hover active:bg-tt-hover';

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose} data-testid="repeat-choice-menu-layer">
      <div
        ref={cardRef}
        role="menu"
        id="repeat-choice-menu"
        aria-label="Choose repeat type"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleMenuArrowKeyDown(e, cardRef.current)}
        className="absolute w-[240px] rounded-[16px] bg-tt-menu pt-[10px] pb-[9px] shadow-[0_6px_28px_var(--tt-shadow),0_1px_4px_var(--tt-shadow)]"
        style={{ top: pos.top, left: pos.left }}
      >
        <button
          type="button"
          role="menuitemradio"
          aria-checked={active === 'fixed_interval'}
          className={row}
          onClick={choose(onSelectFixed)}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[16px] font-semibold leading-tight">On fixed interval</span>
            <span className="text-[12px] text-tt-secondary leading-tight mt-0.5">
              Calendar · set days
            </span>
          </div>
          {active === 'fixed_interval' && (
            <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />
          )}
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={active === 'after_completion'}
          className={row}
          onClick={choose(onSelectApproximate)}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[16px] font-semibold leading-tight">Approximately</span>
            <span className="text-[12px] text-tt-secondary leading-tight mt-0.5">
              Tasks · min–max window
            </span>
          </div>
          {active === 'after_completion' && (
            <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />
          )}
        </button>
        <button
          type="button"
          role="menuitemradio"
          aria-checked={active === 'annual_window'}
          className={row}
          onClick={choose(onSelectAnnualWindow)}
        >
          <div className="flex flex-col min-w-0">
            <span className="text-[16px] font-semibold leading-tight">Time of year</span>
            <span className="text-[12px] text-tt-secondary leading-tight mt-0.5">
              Tasks · dates or season
            </span>
          </div>
          {active === 'annual_window' && (
            <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />
          )}
        </button>
        {active !== null && onClearRepeat && (
          <>
            <div className="mx-4 my-1.5 h-px bg-tt-menu-divider" role="separator" />
            <button
              type="button"
              role="menuitem"
              className="w-full h-[40px] flex items-center pl-[18px] pr-[16px] text-left text-[15px] font-medium text-tt-secondary hover:text-red-500 hover:bg-tt-hover focus-visible:bg-tt-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-tt-blue outline-none cursor-pointer"
              onClick={choose(onClearRepeat)}
            >
              No repeat
            </button>
          </>
        )}
      </div>
    </div>
  );
}
