/**
 * TickTick-like empty Inbox illustration (mobile dark chrome).
 * Ref: Brad attachment — inbox tray + blue paper plane on black.
 */
export function EmptyInboxState() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-8 pb-24 text-center select-none">
      <svg
        width="200"
        height="160"
        viewBox="0 0 200 160"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="mb-6"
        aria-hidden
      >
        {/* soft blob */}
        <ellipse cx="100" cy="88" rx="72" ry="42" fill="#2A2A2E" />
        <ellipse cx="100" cy="88" rx="56" ry="32" fill="#1C1C1E" />
        {/* dotted spiral hint */}
        <circle cx="58" cy="70" r="1.2" fill="#FFFFFF" opacity="0.35" />
        <circle cx="52" cy="82" r="1" fill="#FFFFFF" opacity="0.25" />
        <circle cx="64" cy="58" r="0.9" fill="#FFFFFF" opacity="0.3" />
        <circle cx="140" cy="62" r="1.1" fill="#FFFFFF" opacity="0.3" />
        <circle cx="148" cy="78" r="0.8" fill="#FFFFFF" opacity="0.25" />
        {/* stars */}
        <path d="M70 50l1.2 2.4 2.6.4-1.9 1.8.4 2.6L70 56.2l-2.3 1.2.4-2.6-1.9-1.8 2.6-.4z" fill="#FFF" opacity="0.45" />
        <path d="M130 48l1 2 2.2.3-1.6 1.5.3 2.2-1.9-1-1.9 1 .3-2.2-1.6-1.5 2.2-.3z" fill="#FFF" opacity="0.4" />
        {/* inbox tray */}
        <path
          d="M48 78h104l-12 36H60L48 78z"
          fill="#E8E8ED"
          stroke="#D1D1D6"
          strokeWidth="1"
        />
        <path d="M48 78h104v8H48z" fill="#F2F2F7" />
        <path d="M60 114h80" stroke="#C7C7CC" strokeWidth="2" strokeLinecap="round" />
        <rect x="70" y="86" width="60" height="6" rx="2" fill="#D1D1D6" opacity="0.7" />
        {/* paper plane */}
        <g transform="translate(118 42) rotate(28)">
          <path d="M0 12 L36 0 L12 20 L8 14 Z" fill="#4772FA" />
          <path d="M12 20 L8 14 L20 10 Z" fill="#3B63E6" />
          <path d="M0 12 L12 20 L8 14 Z" fill="#6B8CFF" />
        </g>
        {/* flight trail */}
        <path
          d="M108 58 C100 64, 96 70, 92 76"
          stroke="#4772FA"
          strokeWidth="1.5"
          strokeDasharray="2 3"
          opacity="0.6"
          fill="none"
        />
      </svg>
      <p className="text-[20px] font-bold text-white tracking-tight">No tasks</p>
      <p className="text-[14px] text-[#8E8E93] mt-2 max-w-[16rem] leading-snug">
        Captures all your tasks and ideas
      </p>
    </div>
  );
}
