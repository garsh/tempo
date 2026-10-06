/** TickTick-style "tips / plan your day" lightbulb with a sparkle. */
export function LightbulbIcon({ className = '' }: { className?: string }) {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden
      className={className}
    >
      <path
        d="M11.2 5.6 A5.4 5.4 0 0 0 8 15.3 C8.6 15.8 8.9 16.4 8.9 17.1 V18.1 H14.3 V17.1 C14.3 16.4 14.6 15.8 15.2 15.3 A5.4 5.4 0 0 0 11.2 5.6 Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path d="M9.6 20.8 H13.6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M11.6 12.6 V18" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
      <circle cx="3.4" cy="11" r="1" fill="currentColor" />
      <circle cx="5.3" cy="5.3" r="1" fill="currentColor" />
      <circle cx="11.2" cy="2.3" r="1" fill="currentColor" />
      <path
        d="M19.3 1.6 Q19.7 4.1 22.2 4.5 Q19.7 4.9 19.3 7.4 Q18.9 4.9 16.4 4.5 Q18.9 4.1 19.3 1.6 Z"
        fill="currentColor"
      />
    </svg>
  );
}
