/**
 * TickTick empty calendar day: desk calendar + refresh arrow on a soft blob,
 * "You have a free day" / "Take it easy". Colors follow theme variables.
 */
export function EmptyCalendarDay() {
  return (
    <div
      data-tempo-cal-empty="1"
      className="flex-1 w-full flex flex-col items-center justify-center text-center select-none px-8 pb-6 pt-4"
    >
      <svg width="148" height="132" viewBox="0 0 200 180" fill="none" aria-hidden className="mb-4">
        <path
          d="M28 78 C48 36 92 18 128 22 C158 25 176 48 168 78 C192 86 188 128 152 142 C130 152 118 168 88 168 C58 168 42 148 34 128 C18 118 12 96 28 78 Z"
          fill="var(--tt-illus-blob)"
        />
        <path d="M42 48 L50 48 M158 54 L166 54 M36 120 L42 126 M168 110 L174 116" stroke="var(--tt-illus-accent)" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M54 100 L56.5 106 L62.5 108.5 L56.5 111 L54 117 L51.5 111 L45.5 108.5 L51.5 106 Z" fill="var(--tt-illus-accent)" />
        <path d="M152 88 L153.8 92.2 L158 94 L153.8 95.8 L152 100 L150.2 95.8 L146 94 L150.2 92.2 Z" fill="var(--tt-illus-accent)" />
        <rect x="58" y="52" width="84" height="78" rx="10" fill="var(--tt-illus-cloud)" stroke="var(--tt-blue)" strokeWidth="4" />
        <rect x="58" y="52" width="84" height="22" rx="10" fill="var(--tt-blue)" />
        <rect x="58" y="64" width="84" height="10" fill="var(--tt-blue)" />
        <rect x="78" y="44" width="8" height="18" rx="4" fill="var(--tt-blue)" />
        <rect x="114" y="44" width="8" height="18" rx="4" fill="var(--tt-blue)" />
        <circle cx="100" cy="104" r="16" fill="none" stroke="var(--tt-blue)" strokeWidth="4.5" strokeDasharray="70 30" strokeLinecap="round" transform="rotate(-40 100 104)" />
        <path d="M112 92 L118 98 L110 100" fill="var(--tt-blue)" />
      </svg>
      <p className="m-0 text-[17px] font-bold text-tt-text tracking-[-0.01em]">You have a free day</p>
      <p className="mt-1.5 mb-0 text-[15px] text-tt-muted">Take it easy</p>
    </div>
  );
}
