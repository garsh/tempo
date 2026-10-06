import { useState } from 'react';
import { dismissCalTodayTip, isCalTodayTipDismissed } from '../../domain/calendarUi';

/**
 * Dark "Tap to go today" speech bubble under the month title (TickTick first-visit tip).
 * Tapping the bubble jumps to today; X dismisses and persists.
 */
export function CalendarTodayTip({ onGoToday }: { onGoToday: () => void }) {
  const [dismissed, setDismissed] = useState(isCalTodayTipDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    dismissCalTodayTip();
    setDismissed(true);
  };

  return (
    <div data-tempo-cal-today-tip="1" className="absolute left-[12px] top-[40px] z-20" role="note">
      <div
        className="absolute -top-[6px] left-[22px] w-0 h-0"
        style={{
          borderLeft: '7px solid transparent',
          borderRight: '7px solid transparent',
          borderBottom: '7px solid #444546',
        }}
        aria-hidden
      />
      <div className="flex items-center gap-2 rounded-[10px] bg-[#444546] text-white pl-3.5 pr-1.5 py-2 shadow-lg">
        <button
          type="button"
          onClick={() => {
            onGoToday();
            dismiss();
          }}
          className="text-[13px] font-medium whitespace-nowrap"
        >
          Tap to go today
        </button>
        <button
          type="button"
          onClick={dismiss}
          aria-label="Dismiss tip"
          title="Dismiss"
          className="w-7 h-7 flex items-center justify-center text-white/80 hover:text-white"
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden>
            <path d="M1 1 L11 11 M11 1 L1 11" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </div>
  );
}
