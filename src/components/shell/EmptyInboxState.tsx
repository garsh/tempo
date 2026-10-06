/**
 * TickTick Android empty Inbox.
 * Refs: ticktick-refs/android/brad-inbox-empty-light.png (primary) and
 *       ticktick-refs/android/brad-inbox-empty-dark.png (dark-scheme colors).
 *
 * All colors come from theme CSS variables (src/index.css), so the illustration
 * follows `prefers-color-scheme` — no hard-coded light or dark chrome here.
 */
export function EmptyInboxState() {
  return (
    <div
      data-tempo-empty-inbox="1"
      className="flex-1 w-full flex flex-col items-center text-center select-none px-8 pt-[13vh] pb-24"
    >
      <svg
        width="190"
        height="171"
        viewBox="0 0 500 450"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
        className="mb-5"
      >
        {/* soft blob */}
        <path
          d="M120 110 C170 60 290 30 350 40 C400 48 372 108 366 135 C360 165 470 178 465 250 C460 320 382 332 330 345 C270 362 205 360 178 395 C152 430 112 422 116 380 C120 340 60 330 40 270 C20 208 70 150 120 110 Z"
          fill="var(--tt-illus-blob)"
        />
        {/* sparkles */}
        <path
          d="M298 72 Q300 86 314 88 Q300 90 298 104 Q296 90 282 88 Q296 86 298 72 Z"
          fill="var(--tt-illus-accent)"
        />
        <path
          d="M392 247 Q393.5 256.5 403 258 Q393.5 259.5 392 269 Q390.5 259.5 381 258 Q390.5 256.5 392 247 Z"
          fill="var(--tt-illus-accent)"
        />
        <circle cx="83" cy="210" r="4.5" stroke="var(--tt-illus-accent)" strokeWidth="3" />
        {/* dashed flight path */}
        <path
          d="M224 233 C172 240 128 222 127 186 C126 150 150 121 176 107 C202 95 216 122 200 139 C184 153 154 140 162 115 C168 96 180 80 193 62"
          stroke="var(--tt-illus-accent)"
          strokeWidth="3.5"
          strokeDasharray="7 7"
          strokeLinecap="round"
        />
        {/* tray back / rim */}
        <path
          d="M180 158 L312 158 Q322 158 326 167 L358 245 L358 272 L130 272 L130 245 L162 167 Q166 158 180 158 Z"
          fill="var(--tt-illus-tray)"
          stroke="var(--tt-illus-stroke)"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <path d="M184 176 L308 176 L336 245 L152 245 Z" fill="var(--tt-illus-tray-inner)" />
        <path d="M152 245 L336 245 L336 270 L152 270 Z" fill="var(--tt-illus-tray-inner)" />
        {/* paper plane */}
        <path d="M218 200 L291 171 L226 231 Z" fill="var(--tt-illus-plane-fold)" />
        <path d="M203 188 L291 171 L259 237 L239 211 Z" fill="var(--tt-blue)" />
        <path d="M239 211 L291 171 L226 231 Z" fill="var(--tt-illus-plane-fold)" />
        {/* tray front with notch */}
        <path
          d="M130 245 L200 245 Q206 245 209 251 L213 259 Q216 265 223 265 L267 265 Q274 265 277 259 L281 251 Q284 245 290 245 L358 245 L358 310 Q358 322 346 322 L142 322 Q130 322 130 310 Z"
          fill="var(--tt-illus-tray)"
          stroke="var(--tt-illus-stroke)"
          strokeWidth="4.5"
          strokeLinejoin="round"
        />
        <rect x="215" y="280" width="63" height="17" rx="8.5" fill="var(--tt-illus-stroke)" />
      </svg>
      <p className="m-0 text-[17px] font-bold text-tt-text tracking-[-0.01em]">No tasks</p>
      <p className="mt-2 mb-0 text-[15px] leading-snug text-tt-muted max-w-[280px]">
        Captures all your tasks and ideas
      </p>
    </div>
  );
}
