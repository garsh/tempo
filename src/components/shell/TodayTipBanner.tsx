import { useState } from 'react';

export const TODAY_TIP_DISMISSED_KEY = 'tempo_today_tip_dismissed';

function readDismissed(): boolean {
  try {
    return localStorage.getItem(TODAY_TIP_DISMISSED_KEY) === '1';
  } catch {
    return false;
  }
}

/** White calendar with knocked-out dots + check (TickTick Today tip icon). */
function CalendarCheckGlyph() {
  return (
    <svg width="30" height="31" viewBox="0 0 28 29" aria-hidden className="shrink-0">
      <rect x="6.5" y="0" width="3.2" height="7" rx="1.6" fill="#FFFFFF" />
      <rect x="18.3" y="0" width="3.2" height="7" rx="1.6" fill="#FFFFFF" />
      <rect x="0" y="3.5" width="28" height="25.5" rx="6.5" fill="#FFFFFF" />
      <circle cx="7.6" cy="13" r="1.9" fill="var(--tt-blue)" />
      <circle cx="13" cy="13" r="1.9" fill="var(--tt-blue)" />
      <circle cx="7.6" cy="18.6" r="1.9" fill="var(--tt-blue)" />
      <path
        d="M12.6 19.4 L16.4 23.2 L22.6 14"
        stroke="var(--tt-blue)"
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/**
 * TickTick's blue Today tip. Dismissal persists in localStorage, so once closed it
 * stays gone on this device. Same #4772FA banner in light and dark schemes.
 */
export function TodayTipBanner() {
  const [dismissed, setDismissed] = useState(readDismissed);
  if (dismissed) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(TODAY_TIP_DISMISSED_KEY, '1');
    } catch {
      /* private mode: dismiss for this session only */
    }
    setDismissed(true);
  };

  return (
    <div
      role="note"
      data-tempo-today-tip="1"
      className="relative mx-4 mt-[5px] mb-2 min-h-[76px] rounded-[14px] bg-tt-blue text-white flex items-center gap-[19px] pl-[21px] pr-[31px] py-[18px]"
    >
      <CalendarCheckGlyph />
      <p className="m-0 text-[15px] leading-[20px]">
        Tasks with the date set as &quot;Today&quot; will be shown here.
      </p>
      <button
        type="button"
        onClick={dismiss}
        aria-label="Dismiss tip"
        title="Dismiss"
        className="absolute right-[8px] top-[8px] w-8 h-8 flex items-center justify-center text-white"
      >
        <svg width="12" height="12" viewBox="0 0 14 14" aria-hidden>
          <path d="M1.5 1.5 L12.5 12.5 M12.5 1.5 L1.5 12.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}
