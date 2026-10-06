/** One flat-bottomed cloud: bumps are circles clipped at the baseline. */
function Cloud({ id, base, x0, x1, bumps }: { id: string; base: number; x0: number; x1: number; bumps: [number, number, number][] }) {
  return (
    <g clipPath={`url(#${id})`}>
      <defs>
        <clipPath id={id}>
          <rect x={x0} y={0} width={x1 - x0} height={base} />
        </clipPath>
      </defs>
      {bumps.map(([cx, cy, r]) => (
        <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--tt-illus-cloud)" />
      ))}
    </g>
  );
}

/**
 * TickTick Android empty Today: paper plane among clouds with a dotted loop trail.
 * Ref: ticktick-refs/android/brad-today-empty-light.png. Colors are theme variables,
 * so the art follows prefers-color-scheme.
 */
export function EmptyTodayState() {
  return (
    <div
      data-tempo-empty-today="1"
      className="flex-1 w-full flex flex-col items-center justify-center text-center select-none px-8 pb-[100px]"
    >
      <svg
        width="180"
        height="162"
        viewBox="0 0 474 427"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="mb-[22px]"
      >
        {/* soft blob */}
        <path
          d="M70 132 C140 78 250 40 330 31 C388 25 384 92 354 134 C336 164 456 172 452 230 C448 292 362 300 302 330 C252 356 232 402 160 402 C108 402 120 350 106 322 C86 292 22 272 25 210 C28 166 44 150 70 132 Z"
          fill="var(--tt-illus-blob)"
        />
        {/* clouds */}
        <Cloud id="tt-cloud-a" base={101} x0={190} x1={290} bumps={[[226, 101, 24], [262, 101, 13], [278, 101, 8]]} />
        <Cloud id="tt-cloud-b" base={203} x0={20} x1={182} bumps={[[56, 203, 37], [110, 203, 22], [148, 203, 15], [170, 203, 9]]} />
        <Cloud id="tt-cloud-c" base={295} x0={250} x1={400} bumps={[[300, 295, 37], [348, 295, 21], [383, 295, 11], [395, 295, 5]]} />
        <Cloud id="tt-cloud-d" base={362} x0={162} x1={250} bumps={[[194, 362, 19], [228, 362, 13], [243, 362, 6]]} />
        {/* little rings */}
        <circle cx="157" cy="117" r="5" stroke="var(--tt-illus-accent)" strokeWidth="3" />
        <circle cx="93" cy="249" r="4.5" stroke="var(--tt-illus-accent)" strokeWidth="3" />
        <circle cx="371" cy="242" r="4.5" stroke="var(--tt-illus-accent)" strokeWidth="3" />
        {/* dotted loop trail */}
        <path
          d="M220 238 C206 262 176 275 150 273 C128 271 120 250 140 243 C164 236 190 252 180 274 C168 300 142 318 116 324"
          stroke="var(--tt-illus-accent)"
          strokeWidth="3.2"
          strokeDasharray="5 6"
          strokeLinecap="round"
        />
        {/* paper plane */}
        <path d="M177 168 L326 127 L286 248 L238 214 Z" fill="var(--tt-blue)" />
        <path d="M205 190 L292 151 L238 214 L222 241 Z" fill="var(--tt-illus-plane-fold-sky)" />
        <path d="M222 241 L231 211 L246 220 Z" fill="var(--tt-blue)" />
      </svg>
      <p className="m-0 text-[17px] font-bold text-tt-text tracking-[-0.01em]">No tasks today</p>
      <p className="mt-2 mb-0 text-[15px] leading-snug text-tt-muted max-w-[280px]">
        Enjoy a wonderful day
      </p>
    </div>
  );
}
