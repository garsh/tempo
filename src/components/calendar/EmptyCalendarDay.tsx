/**
 * TickTick empty calendar day: desk calendar + refresh arrow on a soft blob,
 * "You have a free day" / "Take it easy". Colors follow theme variables.
 */
export function EmptyCalendarDay() {
  return (
    <div
      data-tempo-cal-empty="1"
      className="flex-1 w-full flex flex-col items-center justify-center text-center select-none px-8 pb-8 pt-2"
    >
      <svg width="160" height="140" viewBox="0 0 220 190" fill="none" aria-hidden className="mb-5">
        {/* soft blob */}
        <path
          d="M36 86 C58 38 108 22 148 28 C178 32 196 58 186 90 C210 98 204 142 164 156 C140 166 128 182 96 182 C64 182 48 160 40 138 C22 128 18 104 36 86 Z"
          fill="var(--tt-illus-blob)"
        />
        {/* dashes + sparkles */}
        <path d="M48 52 L58 52 M170 58 L180 58 M40 130 L48 138 M178 118 L186 126" stroke="var(--tt-illus-accent)" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M62 108 L65 116 L73 119 L65 122 L62 130 L59 122 L51 119 L59 116 Z" fill="var(--tt-illus-accent)" />
        <path d="M166 96 L168.5 102 L174.5 104.5 L168.5 107 L166 113 L163.5 107 L157.5 104.5 L163.5 102 Z" fill="var(--tt-illus-accent)" />
        {/* calendar body */}
        <rect x="62" y="48" width="96" height="92" rx="12" fill="#ffffff" stroke="var(--tt-blue)" strokeWidth="5" />
        <path d="M62 48 h96 a12 12 0 0 1 12 12 v14 H50 v-14 a12 12 0 0 1 12-12 Z" fill="var(--tt-blue)" transform="translate(12,0)" />
        <rect x="62" y="48" width="96" height="28" rx="12" fill="var(--tt-blue)" />
        <rect x="62" y="62" width="96" height="14" fill="var(--tt-blue)" />
        {/* binding rings */}
        <rect x="86" y="38" width="9" height="22" rx="4.5" fill="var(--tt-blue)" />
        <rect x="125" y="38" width="9" height="22" rx="4.5" fill="var(--tt-blue)" />
        {/* refresh arrow (open circle + arrow head) */}
        <path
          d="M128 108 A22 22 0 1 1 100 90"
          fill="none"
          stroke="var(--tt-blue)"
          strokeWidth="5.5"
          strokeLinecap="round"
        />
        <path d="M128 96 L136 108 L122 110 Z" fill="var(--tt-blue)" />
      </svg>
      <p className="m-0 text-[17px] font-bold text-tt-text tracking-[-0.01em]">You have a free day</p>
      <p className="mt-1.5 mb-0 text-[15px] text-tt-muted">Take it easy</p>
    </div>
  );
}
