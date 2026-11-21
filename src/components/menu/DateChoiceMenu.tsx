import { useRef, type RefObject } from 'react';
import { Check } from 'lucide-react';
import {
  dateChoiceMenuPosition,
  handleMenuArrowKeyDown,
  useAnchoredMenu,
  type ViewportBox,
} from './useAnchoredMenu';

export { dateChoiceMenuPosition, handleMenuArrowKeyDown, type ViewportBox };

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
  const itemCount =
    mode === 'last_done' ? 3 : allowNoDate && onNoDate ? 4 : 3;
  const menuHeight = 44 * itemCount + 19;
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
