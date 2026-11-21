import type React from 'react';
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { WindowProgress } from '../domain/recurrence';

interface RadialProgressRingProps {
  progress: WindowProgress;
  size?: number;
  decorative?: boolean;
}

export function ringColorForProgress(progress: WindowProgress): string {
  switch (progress.stage) {
    case 'before_min':
      return 'var(--tt-ring-muted)';
    case 'not_done_yet':
      return 'var(--tt-ring-amber)';
    case 'in_window':
      return 'var(--tt-ring-green)';
    case 'at_or_past_max':
      if (progress.overdueIntensity >= 0.35) return 'var(--tt-ring-overdue)';
      if (progress.overdueIntensity > 0) return 'var(--tt-ring-orange)';
      return 'var(--tt-ring-amber)';
    case 'stopped':
    default:
      return 'var(--tt-ring-muted)';
  }
}

/**
 * Steady, non-pulsing clockwise radial progress ring
 * for approximate min–max periodic tasks.
 */
export function RadialProgressRing({ progress, size = 20, decorative = false }: RadialProgressRingProps) {
  const strokeWidth = 2.4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clampedFill = Math.max(0, Math.min(1, progress.ringFill));
  const dashOffset = circumference * (1 - clampedFill);
  const strokeColor = ringColorForProgress(progress);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      role={decorative ? undefined : 'img'}
      aria-label={decorative ? undefined : progress.detailLabel}
      aria-hidden={decorative ? true : undefined}
      data-testid="radial-progress-ring"
      data-stage={progress.stage}
      data-fill={clampedFill.toFixed(2)}
      className="shrink-0"
    >
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="var(--tt-ring-track)"
        strokeWidth={strokeWidth}
      />
      {clampedFill > 0 && (
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={strokeColor}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={dashOffset}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      )}
    </svg>
  );
}

interface TooltipCoords {
  top: number;
  right: number;
  placeAbove: boolean;
}

type PopoverEl = HTMLDivElement & {
  showPopover?: () => void;
  hidePopover?: () => void;
};

/**
 * Interactive radial ring trigger for task rows: renders only the compact ring,
 * showing the expanded schedule/elapsed status tooltip on hover/focus (desktop)
 * or long-press (mobile).
 */
export function RadialProgressRingWithTooltip({ progress, size = 20 }: RadialProgressRingProps) {
  const tooltipId = useId();
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<PopoverEl | null>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  const [desktopOpen, setDesktopOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<TooltipCoords | null>(null);

  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressTriggeredRef = useRef(false);
  const suppressClickUntilRef = useRef(0);
  const lastTouchTimeRef = useRef(0);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);

  const supportsInterestFor =
    typeof HTMLButtonElement !== 'undefined' &&
    Object.prototype.hasOwnProperty.call(HTMLButtonElement.prototype, 'interestForElement');
  const hasHoverPointer =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches;
  const supportsAnchorPos =
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('position-area', 'top span-left');

  // Native interestfor closes popover="hint" when touch lifts, so use the pinned portal tooltip for
  // touch-only devices and whenever a tooltip is pinned open by long-press.
  const useNativeInterest = supportsInterestFor && hasHoverPointer && !mobileOpen;
  const isOpen = desktopOpen || mobileOpen;

  const computeTooltipPos = useCallback((): TooltipCoords | null => {
    if (!buttonRef.current || typeof window === 'undefined') return null;
    const rect = buttonRef.current.getBoundingClientRect();
    const placeAbove = rect.top >= 72;
    const top = placeAbove ? rect.top - 8 : rect.bottom + 8;
    const viewportW = window.innerWidth || 375;
    const anchorRight = rect.right || rect.left + rect.width;
    const right = Math.max(12, viewportW - anchorRight);
    return { top, right, placeAbove };
  }, []);

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearCloseTimer = () => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearCloseTimer();
    };
  }, []);

  // Keep long-press tooltip open after finger release until outside tap or scroll
  useEffect(() => {
    if (!mobileOpen) return;
    const handleOutside = (e: Event) => {
      const target = e.target as Node | null;
      if (target && (buttonRef.current?.contains(target) || tooltipRef.current?.contains(target))) {
        return;
      }
      clearCloseTimer();
      setMobileOpen(false);
      setDesktopOpen(false);
    };
    const handleScroll = () => {
      clearCloseTimer();
      setMobileOpen(false);
      setDesktopOpen(false);
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('touchstart', handleOutside);
    window.addEventListener('scroll', handleScroll, { capture: true, passive: true });
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('touchstart', handleOutside);
      window.removeEventListener('scroll', handleScroll, { capture: true });
    };
  }, [mobileOpen]);

  // Dismiss fallback/pinned tooltip on Escape (WCAG 1.4.13 Dismissible)
  useEffect(() => {
    if (useNativeInterest || !isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        clearCloseTimer();
        setDesktopOpen(false);
        setMobileOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [useNativeInterest, isOpen]);

  const scheduleFallbackClose = () => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => {
      setDesktopOpen(false);
    }, 150);
  };

  const isRecentTouch = () => Date.now() - lastTouchTimeRef.current < 600;

  const startLongPress = (clientX: number, clientY: number) => {
    lastTouchTimeRef.current = Date.now();
    if (longPressTimerRef.current) return;
    touchStartPosRef.current = { x: clientX, y: clientY };
    longPressTriggeredRef.current = false;
    suppressClickUntilRef.current = 0;

    longPressTimerRef.current = setTimeout(() => {
      longPressTimerRef.current = null;
      longPressTriggeredRef.current = true;
      clearCloseTimer();
      setTooltipPos(computeTooltipPos());
      try {
        popoverRef.current?.hidePopover?.();
      } catch {
        /* ignore */
      }
      setMobileOpen(true);
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        try {
          navigator.vibrate(15);
        } catch {
          /* ignore */
        }
      }
    }, 280);
  };

  const moveLongPress = (clientX: number, clientY: number) => {
    if (!touchStartPosRef.current) return;
    const dist = Math.hypot(
      clientX - touchStartPosRef.current.x,
      clientY - touchStartPosRef.current.y
    );
    if (dist > 12) {
      clearLongPressTimer();
      touchStartPosRef.current = null;
    }
  };

  const endLongPress = (e?: { preventDefault: () => void; stopPropagation: () => void }) => {
    lastTouchTimeRef.current = Date.now();
    clearLongPressTimer();
    touchStartPosRef.current = null;
    if (longPressTriggeredRef.current) {
      suppressClickUntilRef.current = Date.now() + 400;
      e?.preventDefault();
      e?.stopPropagation();
    }
  };

  const tooltipPill = (
    <span className="inline-flex items-center gap-2 bg-zinc-900/95 dark:bg-zinc-800/95 text-white text-[13px] sm:text-[14px] font-medium px-3 py-1.5 rounded-xl shadow-xl border border-white/15 w-max max-w-[calc(100vw-24px)] leading-snug backdrop-blur-md">
      <span
        aria-hidden="true"
        className="w-2 h-2 rounded-full shrink-0"
        style={{ backgroundColor: ringColorForProgress(progress) }}
      />
      <span>{progress.detailLabel}</span>
    </span>
  );

  const interestProps = useNativeInterest
    ? ({ interestfor: tooltipId } as Record<string, unknown>)
    : ({ 'aria-describedby': isOpen ? tooltipId : undefined } as Record<string, unknown>);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={progress.detailLabel}
        style={{ WebkitTouchCallout: 'none' }}
        className="relative inline-flex items-center justify-center p-1 -m-1 rounded-full hover:bg-tt-sidebar/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tt-blue transition-colors cursor-help select-none after:absolute after:-inset-1.5 after:content-['']"
        {...interestProps}
        onMouseEnter={() => {
          if (useNativeInterest || isRecentTouch()) return;
          clearCloseTimer();
          setTooltipPos(computeTooltipPos());
          setDesktopOpen(true);
        }}
        onMouseLeave={() => {
          if (useNativeInterest) return;
          scheduleFallbackClose();
        }}
        onFocus={() => {
          if (useNativeInterest || isRecentTouch()) return;
          clearCloseTimer();
          setTooltipPos(computeTooltipPos());
          setDesktopOpen(true);
        }}
        onBlur={() => {
          if (useNativeInterest) return;
          scheduleFallbackClose();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape' && isOpen && !useNativeInterest) {
            e.stopPropagation();
            clearCloseTimer();
            setDesktopOpen(false);
            setMobileOpen(false);
          } else if (e.key === 'Enter' || e.key === ' ') {
            e.stopPropagation();
          }
        }}
        onPointerDown={(e) => {
          if (e.pointerType === 'mouse') return;
          startLongPress(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.pointerType === 'mouse') return;
          moveLongPress(e.clientX, e.clientY);
        }}
        onPointerUp={(e) => {
          if (e.pointerType === 'mouse') return;
          endLongPress(e);
        }}
        onPointerCancel={() => {
          clearLongPressTimer();
          touchStartPosRef.current = null;
        }}
        onTouchStart={(e) => {
          if (e.touches.length === 1) {
            startLongPress(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchMove={(e) => {
          if (e.touches.length === 1) {
            moveLongPress(e.touches[0].clientX, e.touches[0].clientY);
          }
        }}
        onTouchEnd={(e) => {
          endLongPress(e);
        }}
        onTouchCancel={() => {
          clearLongPressTimer();
          touchStartPosRef.current = null;
        }}
        onContextMenu={(e) => e.preventDefault()}
        onClick={(e) => {
          if (longPressTriggeredRef.current || Date.now() < suppressClickUntilRef.current) {
            e.preventDefault();
            e.stopPropagation();
            longPressTriggeredRef.current = false;
            return;
          }
          if (mobileOpen) {
            e.preventDefault();
            e.stopPropagation();
            clearCloseTimer();
            setMobileOpen(false);
            setDesktopOpen(false);
            return;
          }
          clearCloseTimer();
          setDesktopOpen(false);
        }}
      >
        <RadialProgressRing progress={progress} size={size} decorative />
      </button>

      {useNativeInterest ? (
        <div
          id={tooltipId}
          ref={popoverRef}
          {...({ popover: 'hint' } as Record<string, unknown>)}
          data-testid="ring-progress-tooltip"
          className="tt-ring-tooltip"
          style={
            !supportsAnchorPos && tooltipPos
              ? {
                  position: 'fixed',
                  inset: 'auto',
                  top: `${tooltipPos.top}px`,
                  right: `${tooltipPos.right}px`,
                  transform: tooltipPos.placeAbove ? 'translateY(-100%)' : 'translateY(0)',
                }
              : undefined
          }
          onToggle={(e: React.SyntheticEvent<HTMLDivElement>) => {
            const native = e.nativeEvent as Event & { newState?: string };
            if (native.newState === 'open' && !supportsAnchorPos) {
              setTooltipPos(computeTooltipPos());
            }
          }}
        >
          {tooltipPill}
        </div>
      ) : (
        isOpen &&
        tooltipPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={tooltipRef}
            id={tooltipId}
            role="tooltip"
            data-testid="ring-progress-tooltip"
            onMouseEnter={() => clearCloseTimer()}
            onMouseLeave={() => scheduleFallbackClose()}
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              clearCloseTimer();
              setDesktopOpen(false);
              setMobileOpen(false);
            }}
            style={{
              position: 'fixed',
              top: `${tooltipPos.top}px`,
              right: `${tooltipPos.right}px`,
              transform: tooltipPos.placeAbove ? 'translateY(-100%)' : 'translateY(0)',
              zIndex: 99999,
            }}
            className="select-none"
          >
            {tooltipPill}
          </div>,
          document.body
        )
      )}
    </>
  );
}
