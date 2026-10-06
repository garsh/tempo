/** Filled, colored settings glyphs (20×20) modeled on TickTick Android settings. */
const B = 'var(--tt-blue)';
const box = { width: 20, height: 20, viewBox: '0 0 20 20', 'aria-hidden': true } as const;

export function TabBarIcon() {
  return (
    <svg {...box} fill={B}>
      <rect x="1" y="1" width="8" height="8" rx="2.4" />
      <circle cx="15" cy="5" r="4.1" />
      <rect x="1" y="11" width="8" height="8" rx="2.4" />
      <rect x="11" y="11" width="8" height="8" rx="2.4" />
    </svg>
  );
}
export function AppearanceIcon() {
  return (
    <svg {...box} fill={B}>
      <path d="M2 2.5A1.5 1.5 0 0 1 3.5 1h11A1.5 1.5 0 0 1 16 2.5V5h1.2A1.8 1.8 0 0 1 19 6.8v2.4a1.8 1.8 0 0 1-1.8 1.8H11v1.6H9.3v-3.4h7.9V6.8H16v.7A1.5 1.5 0 0 1 14.5 9h-11A1.5 1.5 0 0 1 2 7.5Z" />
      <rect x="8.4" y="12.2" width="3.4" height="7" rx="1.4" />
    </svg>
  );
}
export function DateTimeIcon() {
  return (
    <svg {...box}>
      <circle cx="10" cy="10" r="9" fill={B} />
      <path d="M10 5v5.4l3.4 2" stroke="var(--tt-elevated)" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}
export function SoundsIcon() {
  return (
    <svg {...box} fill={B}>
      <path d="M7 3.6 17.5 1v12.4h-.02A2.9 2.9 0 1 1 15.6 10.9V5.2L8.9 6.8v8.6h-.02A2.9 2.9 0 1 1 7 12.9Z" />
    </svg>
  );
}
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
export function HelpIcon() {
  return (
    <svg {...box}>
      <circle cx="10" cy="10" r="9" fill="var(--tt-icon-amber)" />
      <path d="M7.3 7.6a2.8 2.8 0 0 1 5.5.5c0 1.9-2.8 2.1-2.8 4" stroke="#fff" strokeWidth="2" strokeLinecap="round" fill="none" />
      <circle cx="10" cy="15" r="1.2" fill="#fff" />
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
export function CsvIcon() {
  return (
    <svg {...box}>
      <rect x="2" y="1" width="16" height="18" rx="3" fill="var(--tt-icon-green)" />
      <path d="M5.5 7h9M5.5 10.5h9M5.5 14h5.5" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
