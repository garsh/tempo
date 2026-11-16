import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface SwipeActionButtonProps {
  icon: React.ReactNode;
  label: string;
  explanation: string;
  colorClasses: string;
  onClick: () => void;
  disabled?: boolean;
}

export const SwipeActionButton: React.FC<SwipeActionButtonProps> = ({
  icon,
  label,
  explanation,
  colorClasses,
  onClick,
  disabled = false,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const [showMobileTooltip, setShowMobileTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);

  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);
  const touchStartPosRef = useRef<{ x: number; y: number } | null>(null);
  const dismissTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const updateTooltipPosition = () => {
    if (!buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    const placeAbove = rect.top >= 85;
    const top = placeAbove ? rect.top - 14 : rect.bottom + 14;
    const halfWidth = Math.min(160, (window.innerWidth - 24) / 2);
    const left = Math.min(
      window.innerWidth - halfWidth - 12,
      Math.max(halfWidth + 12, rect.left + rect.width / 2)
    );
    setTooltipPos({ top, left, placeAbove });
  };

  const clearLongPressTimer = () => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
  };

  const clearDismissTimer = () => {
    if (dismissTimerRef.current) {
      clearTimeout(dismissTimerRef.current);
      dismissTimerRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearLongPressTimer();
      clearDismissTimer();
    };
  }, []);

  // Dismiss mobile tooltip when user taps anywhere else
  useEffect(() => {
    if (!showMobileTooltip) return;
    const handleOutside = () => {
      setShowMobileTooltip(false);
      clearDismissTimer();
    };
    window.addEventListener('pointerdown', handleOutside);
    window.addEventListener('touchstart', handleOutside);
    return () => {
      window.removeEventListener('pointerdown', handleOutside);
      window.removeEventListener('touchstart', handleOutside);
    };
  }, [showMobileTooltip]);

  const startLongPress = (clientX: number, clientY: number) => {
    if (disabled) return;
    // Don't re-start if already started by pointerdown/touchstart
    if (longPressTimerRef.current) return;

    touchStartPosRef.current = { x: clientX, y: clientY };
    isLongPressRef.current = false;
    clearDismissTimer();

    longPressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      updateTooltipPosition();
      setShowMobileTooltip(true);
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
    // Allow slight finger micro-jitter (up to 14px) before canceling long press
    if (dist > 14) {
      clearLongPressTimer();
    }
  };

  const endLongPress = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;

    if (isLongPressRef.current) {
      clearDismissTimer();
      dismissTimerRef.current = setTimeout(() => {
        setShowMobileTooltip(false);
        isLongPressRef.current = false;
      }, 3500);
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse') return; // Desktop mouse handles hover via mouseenter
    startLongPress(e.clientX, e.clientY);
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse') return;
    moveLongPress(e.clientX, e.clientY);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    e.stopPropagation();
    if (e.pointerType === 'mouse') return;
    if (isLongPressRef.current) {
      e.preventDefault();
    }
    endLongPress();
  };

  const handlePointerCancel = () => {
    clearLongPressTimer();
    touchStartPosRef.current = null;
  };

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (disabled) return;
    if (isLongPressRef.current) {
      e.preventDefault();
      isLongPressRef.current = false;
      return;
    }
    setShowMobileTooltip(false);
    setIsHovered(false);
    clearDismissTimer();
    onClick();
  };

  const handleMouseEnter = () => {
    updateTooltipPosition();
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  const showTooltip = (isHovered || showMobileTooltip) && tooltipPos !== null;

  return (
    <div className="relative inline-flex items-center justify-center">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        title={explanation}
        disabled={disabled}
        onClick={handleClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onTouchStart={(e) => {
          e.stopPropagation();
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
          e.stopPropagation();
          if (isLongPressRef.current) {
            e.preventDefault();
          }
          endLongPress();
        }}
        onTouchCancel={endLongPress}
        onContextMenu={(e) => e.preventDefault()}
        style={{ touchAction: 'none', WebkitTouchCallout: 'none' }}
        className={`w-9 h-9 sm:w-10 sm:h-10 rounded-full flex items-center justify-center shadow-md transition-all active:scale-95 select-none ${
          disabled
            ? 'bg-zinc-600/40 text-white/40 cursor-not-allowed opacity-40 shadow-none'
            : colorClasses
        }`}
      >
        {icon}
      </button>

      {/* Portal-rendered Tooltip: never clipped by overflow-hidden on task rows */}
      {showTooltip &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            role="tooltip"
            data-testid="swipe-action-tooltip"
            style={{
              position: 'fixed',
              top: `${tooltipPos.top}px`,
              left: `${tooltipPos.left}px`,
              transform: tooltipPos.placeAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
              zIndex: 99999,
              pointerEvents: 'none',
            }}
            className="animate-in fade-in zoom-in-95 duration-150 select-none"
          >
            <div className="relative bg-zinc-900/98 dark:bg-zinc-850/98 text-white text-[16px] sm:text-[18px] font-semibold px-5 py-3 rounded-2xl shadow-2xl border border-white/25 max-w-[340px] text-center leading-snug backdrop-blur-md">
              {explanation}
              <div
                className={`absolute left-1/2 -translate-x-1/2 border-[6px] border-transparent ${
                  tooltipPos.placeAbove
                    ? 'top-full -mt-px border-t-zinc-900/98 dark:border-t-zinc-850/98'
                    : 'bottom-full -mb-px border-b-zinc-900/98 dark:border-b-zinc-850/98'
                }`}
              />
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

export default SwipeActionButton;
