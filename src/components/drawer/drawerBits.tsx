import type { GoogleAccount } from '../../sync/googleAccount';

/** Round avatar: Google photo when known, else a gray person silhouette (TickTick default). */
export function Avatar({ account, size }: { account: GoogleAccount | null; size: number }) {
  if (account?.photoUrl) {
    return (
      <img
        src={account.photoUrl}
        alt=""
        width={size}
        height={size}
        referrerPolicy="no-referrer"
        className="rounded-full shrink-0 object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 34 34" aria-hidden className="shrink-0">
      <defs>
        <clipPath id="tempo-avatar-clip">
          <circle cx="17" cy="17" r="17" />
        </clipPath>
      </defs>
      <circle cx="17" cy="17" r="17" fill="#ededed" />
      <g clipPath="url(#tempo-avatar-clip)" fill="#d6d6d6">
        <circle cx="17" cy="13.2" r="6" />
        <ellipse cx="17" cy="31" rx="11.5" ry="8.5" />
      </g>
    </svg>
  );
}

export function WarnDot() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" aria-hidden className="shrink-0">
      <circle cx="6.5" cy="6.5" r="6.5" fill="var(--tt-icon-amber)" />
      <rect x="5.6" y="2.6" width="1.8" height="5" rx="0.9" fill="var(--tt-drawer)" />
      <circle cx="6.5" cy="9.8" r="1" fill="var(--tt-drawer)" />
    </svg>
  );
}

/** Rounded square with a plus (drawer "+ Add"). */
export function AddSquareIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7">
      <rect x="0.85" y="0.85" width="17.3" height="17.3" rx="4.2" />
      <path d="M9.5 5.4v8.2M5.4 9.5h8.2" strokeLinecap="round" />
    </svg>
  );
}

/** Lines + gear ("manage smart lists"). */
export function ManageListsIcon() {
  return (
    <svg width="19" height="17" viewBox="0 0 19 17" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <path d="M1 1.5h15M1 6.5h15M1 11.5h7.5M1 16h6" />
      <circle cx="14.5" cy="13.2" r="2.1" />
      <path d="M14.5 9.6v1.1M14.5 15.7v1.1M11.1 13.2h1.1M16.8 13.2h1.1M12.1 10.8l.8.8M16.1 14.8l.8.8M12.1 15.6l.8-.8M16.1 11.6l.8-.8" strokeWidth="1.3" />
    </svg>
  );
}

/** Outline hexagon with a hole (TickTick settings). */
export function HexGearIcon({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 22 22" aria-hidden fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round">
      <path d="M9.4 1.6q1.6-.9 3.2 0l5.9 3.4q1.6.9 1.6 2.8v6.4q0 1.9-1.6 2.8l-5.9 3.4q-1.6.9-3.2 0L3.5 17q-1.6-.9-1.6-2.8V7.8q0-1.9 1.6-2.8Z" />
      <circle cx="11" cy="11" r="2.9" />
    </svg>
  );
}
