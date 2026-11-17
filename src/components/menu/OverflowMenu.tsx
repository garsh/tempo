import { useEffect, useRef } from 'react';
import { Settings } from 'lucide-react';

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

function OverdueIcon() {
  return (
    <svg {...ICON}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 5.5v5l3 2" />
    </svg>
  );
}

function UpdateAppIcon() {
  return (
    <svg {...ICON}>
      <path d="M2.5 10a7.5 7.5 0 0 1 12.8-5.3L17.5 7" />
      <path d="M17.5 2.5V7H13" />
      <path d="M17.5 10a7.5 7.5 0 0 1-12.8 5.3L2.5 13" />
      <path d="M2.5 17.5V13H7" />
    </svg>
  );
}

interface OverflowMenuProps {
  open: boolean;
  /** Bounding rect of the ⋮ button the card anchors to. */
  anchor: DOMRect | null;
  showDetails: boolean;
  hideCompleted: boolean;
  showOverdue: boolean;
  onClose: () => void;
  onToggleDetails: () => void;
  onToggleHideCompleted: () => void;
  onToggleShowOverdue: () => void;
  onSettings: () => void;
  onUpdateApp?: () => void;
}

/**
 * Three-dot "⋮" menu: rounded card anchored to the button.
 * Show/Hide Details · Hide/Show Completed · Show/Hide Overdue ·
 * Group & Sort · Select · Update App · Settings.
 */
export function OverflowMenu(props: OverflowMenuProps) {
  const { open, anchor, onClose } = props;
  const cardRef = useRef<HTMLDivElement>(null);
  // Card overlaps the ⋮ button (top ≈ button top + 4, right edge ≥ 12px in).
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
  }, [open]);

  if (!open) return null;

  const act = (fn?: () => void) => () => {
    fn?.();
    onClose();
  };
  const row =
    'w-full h-[43px] flex items-center pl-[20px] pr-[18px] gap-[12px] text-left text-[18px] leading-none text-tt-text outline-none focus-visible:bg-tt-hover active:bg-tt-hover';

  return (
    <div className="fixed inset-0 z-[65]" onClick={onClose} data-testid="overflow-menu-layer">
      <div
        ref={cardRef}
        role="menu"
        aria-label="More options"
        onClick={(e) => e.stopPropagation()}
        className="absolute w-[247px] rounded-[16px] bg-tt-menu pt-[10px] pb-[9px] shadow-[0_6px_28px_var(--tt-shadow),0_1px_4px_var(--tt-shadow)]"
        style={{ top: pos.top, right: pos.right }}
      >
        <button type="button" role="menuitem" className={row} onClick={act(props.onToggleDetails)}>
          <DetailsIcon />
          {props.showDetails ? 'Hide Details' : 'Show Details'}
        </button>
        <button type="button" role="menuitem" className={row} onClick={act(props.onToggleHideCompleted)}>
          <HideCompletedIcon />
          {props.hideCompleted ? 'Show Completed' : 'Hide Completed'}
        </button>
        <button type="button" role="menuitem" className={row} onClick={act(props.onToggleShowOverdue)}>
          <OverdueIcon />
          {props.showOverdue ? 'Hide Overdue' : 'Show Overdue'}
        </button>
        <div className="mx-[24px] my-[10px] h-px bg-tt-menu-divider" role="separator" />
        <button type="button" role="menuitem" className={row} onClick={act(props.onUpdateApp)}>
          <UpdateAppIcon />
          Update App
        </button>
        <button type="button" role="menuitem" className={row} onClick={act(props.onSettings)}>
          <Settings className="w-5 h-5 shrink-0" strokeWidth={1.8} />
          Settings
        </button>
      </div>
    </div>
  );
}
