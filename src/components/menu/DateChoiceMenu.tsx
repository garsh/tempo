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
  mode?: 'due' | 'last_done' | 'first_open';
  allowNoDate?: boolean;
  maxDate?: string;
  onClose: () => void;
  onToday: () => void;
  onTomorrow?: () => void;
  onNoDate?: () => void;
  /** Approximate tasks: switch this menu to the past-only last-done picker. */
  onAlreadyDone?: () => void;
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
  onAlreadyDone,
  onDatePicked,
}: DateChoiceMenuProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const itemCount =
    mode === 'last_done' ? 3 : mode === 'first_open' ? 5 : allowNoDate && onNoDate ? 4 : 3;
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

  const openDatePicker = () => {
    const input = dateInputRef.current;
    if (!input) return;
    if (typeof input.showPicker === 'function') {
      try {
        input.showPicker();
        return;
      } catch {
        /* Fall back to focus + click when showPicker throws */
      }
    }
    input.focus({ preventScroll: true });
    input.click();
  };

  return (
    <div className="fixed inset-0 z-[70]" onClick={onClose} data-testid="date-choice-menu-layer">
      <div
        ref={cardRef}
        role="menu"
        id="date-choice-menu"
        aria-label={
          mode === 'last_done'
            ? 'Choose last done date'
            : mode === 'first_open'
              ? 'Choose when it starts'
              : 'Choose a date'
        }
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => handleMenuArrowKeyDown(e, cardRef.current)}
        className="absolute w-[196px] rounded-[16px] bg-tt-menu pt-[10px] pb-[9px] shadow-[0_6px_28px_var(--tt-shadow),0_1px_4px_var(--tt-shadow)]"
        style={{ top: pos.top, left: pos.left }}
      >
        {mode === 'first_open' ? (
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
            <button type="button" role="menuitem" className={row} onClick={openDatePicker}>
              Select
            </button>
            <button
              type="button"
              role="menuitemradio"
              aria-checked={active === 'none'}
              className={row}
              onClick={choose(onNoDate)}
            >
              No start date
              {active === 'none' && <Check className="ml-auto h-4 w-4 shrink-0 text-tt-blue" strokeWidth={2.5} />}
            </button>
            <button type="button" role="menuitem" className={row} onClick={() => onAlreadyDone?.()}>
              Already done
            </button>
          </>
        ) : mode === 'last_done' ? (
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
            <button
              type="button"
              role="menuitem"
              className={row}
              onClick={openDatePicker}
            >
              Select
            </button>
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
            <button
              type="button"
              role="menuitem"
              className={row}
              onClick={openDatePicker}
            >
              Select
            </button>
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
        <input
          ref={dateInputRef}
          type="date"
          aria-label="Select"
          tabIndex={-1}
          value={dateValue}
          max={mode === 'last_done' ? maxDate : undefined}
          onChange={(e) => {
            if (!e.target.value) return;
            onDatePicked(e.target.value);
            onClose();
          }}
          className="sr-only"
        />
      </div>
    </div>
  );
}
