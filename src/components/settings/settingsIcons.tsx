/** Filled, colored settings glyphs (20×20) modeled on TickTick Android settings. */
const B = 'var(--tt-blue)';
const box = { width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': true } as const;

export function GeneralIcon() {
  return (
    <svg {...box} fill={B}>
      <circle cx="3" cy="4" r="2" />
      <rect x="7" y="3" width="12" height="2.1" rx="1.05" />
      <circle cx="3" cy="10" r="2" />
      <rect x="7" y="9" width="12" height="2.1" rx="1.05" />
      <circle cx="3" cy="16" r="2" />
      <rect x="7" y="15" width="12" height="2.1" rx="1.05" />
    </svg>
  );
}
export function IntegrationsIcon() {
  return (
    <svg {...box} fill="var(--tt-icon-green)">
      <path d="M11.4 1.6 19 8l-7.6 6.4v-3.7C6.6 10.5 3.6 12.6 1 17c.6-6.7 4.2-10.6 10.4-11.6Z" />
    </svg>
  );
}
export function AccountIcon() {
  return (
    <svg {...box} fill={B}>
      <circle cx="10" cy="6.5" r="3.6" />
      <path d="M3 17.5c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5v.5H3Z" />
    </svg>
  );
}
export function DriveIcon() {
  return (
    <svg {...box} fill="var(--tt-icon-green)">
      <path d="M6.6 1.5h6.8l6.1 10.6-3.4 5.9H3.9L.5 12.1Zm1.1 2-4.9 8.6 1.7 2.9 4.9-8.5Zm4.6 0H8.9l4.9 8.5h3.4Zm3.8 10.5H6.4l-1.7 2.9h9.8Z" />
    </svg>
  );
}
export function ExportIcon() {
  return (
    <svg {...box} fill="none" stroke="var(--tt-icon-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13V2M5.8 6.2 10 2l4.2 4.2M3 12v4.5A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  );
}
export function ImportIcon() {
  return (
    <svg {...box} fill="none" stroke="var(--tt-icon-green)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 2v11M5.8 8.8 10 13l4.2-4.2M3 12v4.5A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V12" />
    </svg>
  );
}

export function GoogleGIcon({ className = 'w-4 h-4' }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
      />
    </svg>
  );
}
