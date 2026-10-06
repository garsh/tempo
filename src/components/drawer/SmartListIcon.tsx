import type { SmartListId } from '../../prefs/prefs';

const NAVY = 'var(--tt-drawer)';

/** TickTick-style filled smart-list glyphs (19×19 box). Today shows today's date. */
export function SmartListIcon({ id, size = 19 }: { id: SmartListId; size?: number }) {
  const common = { width: size, height: size, viewBox: '0 0 19 19', 'aria-hidden': true } as const;
  switch (id) {
    case 'today':
      return (
        <svg {...common}>
          <rect x="4" y="0" width="2.4" height="4.6" rx="1.2" fill="var(--tt-smart-orange)" />
          <rect x="12.6" y="0" width="2.4" height="4.6" rx="1.2" fill="var(--tt-smart-orange)" />
          <rect x="0.5" y="2" width="18" height="17" rx="4" fill="var(--tt-smart-orange)" />
          <text
            x="9.5"
            y="15.4"
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="700"
            fill={NAVY}
            style={{ fontFamily: 'Roboto, -apple-system, "Segoe UI", sans-serif' }}
          >
            {new Date().getDate()}
          </text>
        </svg>
      );
    case 'inbox':
      return (
        <svg {...common}>
          <path
            fill="var(--tt-smart-orange)"
            fillRule="evenodd"
            d="M4.5 0.5h10a4 4 0 0 1 4 4v10a4 4 0 0 1-4 4h-10a4 4 0 0 1-4-4v-10a4 4 0 0 1 4-4Z M3.4 9.6v-4.8a1.4 1.4 0 0 1 1.4-1.4h9.4a1.4 1.4 0 0 1 1.4 1.4v4.8h-3.6a0.8 0.8 0 0 0-0.8 0.8v0.4a1.2 1.2 0 0 1-1.2 1.2h-1a1.2 1.2 0 0 1-1.2-1.2v-0.4a0.8 0.8 0 0 0-0.8-0.8Z"
          />
        </svg>
      );
    case 'tomorrow':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#ff9f0a" />
          <circle cx="9.5" cy="11" r="3.4" fill={NAVY} />
          <rect x="3" y="13.4" width="13" height="2" rx="1" fill={NAVY} />
          <rect x="8.6" y="3.2" width="1.8" height="3" rx="0.9" fill={NAVY} />
        </svg>
      );
    case 'next7':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#a66bff" />
          <text
            x="9.5"
            y="13.6"
            textAnchor="middle"
            fontSize="10"
            fontWeight="700"
            fill={NAVY}
            style={{ fontFamily: 'Roboto, -apple-system, "Segoe UI", sans-serif' }}
          >
            7
          </text>
        </svg>
      );
    case 'all':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#4772fa" />
          <rect x="4.5" y="5" width="10" height="2" rx="1" fill={NAVY} />
          <rect x="4.5" y="8.5" width="10" height="2" rx="1" fill={NAVY} />
          <rect x="4.5" y="12" width="10" height="2" rx="1" fill={NAVY} />
        </svg>
      );
    case 'completed':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#34c759" />
          <path d="M5 9.8l3 3 6-6.4" stroke={NAVY} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case 'tags':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#5ac8fa" />
          <text x="9.5" y="13.8" textAnchor="middle" fontSize="11" fontWeight="700" fill={NAVY}>
            #
          </text>
        </svg>
      );
    case 'filters':
      return (
        <svg {...common}>
          <rect x="0.5" y="0.5" width="18" height="18" rx="4" fill="#ffb000" />
          <path d="M4.5 5h10l-3.8 4.6v3.6l-2.4 1.4v-5Z" fill={NAVY} />
        </svg>
      );
  }
}
