import { useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ViewMode } from '../../prefs/prefs';

const ICON = {
  width: 20,
  height: 20,
  viewBox: '0 0 20 20',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

function ViewIcon() {
  return (
    <svg {...ICON}>
      <path d="M3 2.5v15" />
      <rect x="6.5" y="2.5" width="10.5" height="4" rx="1.2" />
      <rect x="6.5" y="8" width="10.5" height="4" rx="1.2" />
      <rect x="6.5" y="13.5" width="10.5" height="4" rx="1.2" />
    </svg>
  );
}
function DetailsIcon() {
  return (
    <svg {...ICON}>
      <path d="M3 4h.01M3 10h.01M3 16h.01" strokeWidth={2.2} />
      <path d="M7 4h10M9.5 7.2h7.5M7 10h10M9.5 13.2h7.5M7 16h10" />
    </svg>
  );
}
function HideCompletedIcon() {
  return (
    <svg {...ICON}>
      <path d="M17 9.5V5a2.5 2.5 0 0 0-2.5-2.5h-9A2.5 2.5 0 0 0 3 5v9a2.5 2.5 0 0 0 2.5 2.5H10" />
      <path d="M6.5 9.4l2.4 2.4 4.8-5.1" />
      <path d="M12.6 14.6l1.6 1.6 1.2-1.6 1.3 1.6 1.4-1.6" strokeWidth={1.4} />
    </svg>
  );
}
function GroupSortIcon() {
  return (
    <svg {...ICON}>
      <path d="M6 3v14M6 3 3.5 5.6M14 17V3M14 17l2.5-2.6" />
    </svg>
  );
}
function SelectIcon() {
  return (
    <svg {...ICON}>
      <path d="M2.8 4.6l1.4 1.4 2.3-2.6M2.8 10.4l1.4 1.4 2.3-2.6M3.2 16h.01" />
      <path d="M9.5 4.8h7.5M9.5 10.6h7.5M5.5 16h11.5" />
    </svg>
  );
}

interface OverflowMenuProps {
  open: boolean;
  /** Bounding rect of the ⋮ button the card anchors to. */
  anchor: DOMRect | null;
  viewMode: ViewMode;
  showDetails: boolean;
  hideCompleted: boolean;
  onClose: () => void;
  onViewMode: (mode: ViewMode) => void;
  onToggleDetails: () => void;
  onToggleHideCompleted: () => void;
  onGroupSort: () => void;
  onSelect: () => void;
}

/**
 * TickTick "⋮" menu: white rounded card (dark card in dark mode) anchored to the
 * button. View › (List / Board) · Show/Hide Details · Hide/Show Completed ·
 * Group & Sort · Select. Background / View Options / Share are intentionally absent.
 */
export function OverflowMenu(props: OverflowMenuProps) {
  const { open, anchor, onClose } = props;
  const [sub, setSub] = useState<'root' | 'view'>('root');
  const cardRef = useRef<HTMLDivElement>(null);
  // Card overlaps the ⋮ button like TickTick (top ≈ button top + 4, right edge ≥ 12px in).
  const pos = anchor
    ? { top: Math.max(8, anchor.top + 4), right: Math.max(12, window.innerWidth - anchor.right) }
    : { top: 14, right: 12 };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  useEffect(() => {
    if (open) cardRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true });
  }, [open, sub]);

  if (!open) return null;

  const close = () => {
    setSub('root');
    onClose();
  };
  const act = (fn: () => void) => () => {
    fn();
    close();
  };
  const row =
    'w-full h-[43px] flex items-center pl-[20px] pr-[18px] gap-[12px] text-left text-[18px] leading-none text-tt-text outline-none focus-visible:bg-tt-hover active:bg-tt-hover';

  return (
    <div className="fixed inset-0 z-[65]" onClick={close} data-testid="overflow-menu-layer">
      <div
        ref={cardRef}
        role="menu"
        aria-label="More options"
        onClick={(e) => e.stopPropagation()}
        className="absolute w-[247px] rounded-[16px] bg-tt-menu pt-[10px] pb-[9px] shadow-[0_6px_28px_var(--tt-shadow),0_1px_4px_var(--tt-shadow)]"
        style={{ top: pos.top, right: pos.right }}
      >
        {sub === 'root' ? (
          <>
            <button type="button" role="menuitem" className={row} onClick={() => setSub('view')} aria-haspopup="menu">
              <ViewIcon />
              <span className="flex-1">View</span>
              <ChevronRight className="w-[18px] h-[18px] text-tt-secondary -mr-[2px]" strokeWidth={1.8} />
            </button>
            <button type="button" role="menuitem" className={row} onClick={act(props.onToggleDetails)}>
              <DetailsIcon />
              {props.showDetails ? 'Hide Details' : 'Show Details'}
            </button>
            <button type="button" role="menuitem" className={row} onClick={act(props.onToggleHideCompleted)}>
              <HideCompletedIcon />
              {props.hideCompleted ? 'Show Completed' : 'Hide Completed'}
            </button>
            <div className="mx-[24px] my-[10px] h-px bg-tt-menu-divider" role="separator" />
            <button type="button" role="menuitem" className={row} onClick={act(props.onGroupSort)}>
              <GroupSortIcon />
              Group &amp; Sort
            </button>
            <button type="button" role="menuitem" className={row} onClick={act(props.onSelect)}>
              <SelectIcon />
              Select
            </button>
          </>
        ) : (
          <>
            <button type="button" role="menuitem" className={`${row} text-tt-secondary`} onClick={() => setSub('root')}>
              <ChevronLeft className="w-5 h-5" strokeWidth={1.8} />
              View
            </button>
            {(['list', 'board'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                aria-checked={props.viewMode === mode}
                className={row}
                onClick={act(() => props.onViewMode(mode))}
              >
                <span className="w-5" />
                <span className="flex-1">{mode === 'list' ? 'List' : 'Board'}</span>
                {props.viewMode === mode && <Check className="w-[18px] h-[18px] text-tt-blue" strokeWidth={2.2} />}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
