import { useId, type ReactNode } from 'react';
import { ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { sanitizePhotoUrl, type GoogleAccount } from '../../sync/googleAccount';

export function Avatar({ account, size }: { account: GoogleAccount | null; size: number }) {
  const clipId = useId();
  const photoUrl = sanitizePhotoUrl(account?.photoUrl);
  if (photoUrl) {
    return (
      <img
        src={photoUrl}
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
        <clipPath id={clipId}>
          <circle cx="17" cy="17" r="17" />
        </clipPath>
      </defs>
      <circle cx="17" cy="17" r="17" fill="#ededed" />
      <g clipPath={`url(#${clipId})`} fill="#d6d6d6">
        <circle cx="17" cy="13.2" r="6" />
        <ellipse cx="17" cy="31" rx="11.5" ry="8.5" />
      </g>
    </svg>
  );
}

/** Page header: ← + bold title (TickTick settings). */
export function SettingsHeader({ title, onBack, backLabel = 'Back' }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <header className="shrink-0 flex items-center h-[72px] pt-[9px] pl-[14px] pr-4">
      <button type="button" onClick={onBack} aria-label={backLabel} className="w-[44px] h-[44px] -ml-[4px] flex items-center justify-center text-tt-text cursor-pointer">
        <ArrowLeft className="w-6 h-6" strokeWidth={1.9} />
      </button>
      <h1 className="ml-[16px] text-[21px] font-bold text-tt-text truncate">{title}</h1>
    </header>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="px-8 pt-1 pb-2 text-[13px] font-medium text-tt-secondary">{children}</div>;
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-4 mb-4 rounded-[12px] bg-tt-elevated overflow-hidden ${className}`}>{children}</div>;
}

export function Note({ children }: { children: ReactNode }) {
  return <p className="px-8 -mt-2 mb-4 text-[12px] leading-relaxed text-tt-secondary">{children}</p>;
}

const rowBase = 'w-full min-h-[50px] flex items-center pl-[16px] pr-[18px] gap-[12px] text-left';

/** Row with icon + label + optional value + chevron. Renders as a button (or <a> with href). */
export function NavRow({
  icon,
  label,
  value,
  onClick,
  href,
  chevron = true,
  danger = false,
}: {
  icon?: ReactNode;
  label: ReactNode;
  value?: ReactNode;
  onClick?: () => void;
  href?: string;
  chevron?: boolean;
  danger?: boolean;
}) {
  const inner = (
    <>
      {icon && <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>}
      <span className={`flex-1 min-w-0 truncate text-[18px] desktop:text-[15px] ${danger ? 'text-tt-overdue' : 'text-tt-text'}`}>{label}</span>
      {value != null && <span className="shrink-0 text-[14px] desktop:text-[13px] text-tt-secondary truncate max-w-[45%]">{value}</span>}
      {chevron && <ChevronRight className="w-4 h-4 shrink-0 text-tt-chevron -mr-[2px]" strokeWidth={2} />}
    </>
  );
  if (href) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={`${rowBase} active:bg-tt-hover hover:bg-tt-hover`}>
        {inner}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={`${rowBase} active:bg-tt-hover hover:bg-tt-hover cursor-pointer`}>
      {inner}
    </button>
  );
}

/** Static row with a right-side control (switch, select, input). */
export function ControlRow({ icon, label, sub, children }: { icon?: ReactNode; label: ReactNode; sub?: ReactNode; children: ReactNode }) {
  return (
    <div className={rowBase}>
      {icon && <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>}
      <span className="flex-1 min-w-0 py-2">
        <span className="block text-[17px] desktop:text-[15px] text-tt-text">{label}</span>
        {sub && <span className="block text-[12px] text-tt-secondary leading-snug mt-0.5">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

export function SelectRow<T extends string>({
  icon,
  label,
  sub,
  value,
  options,
  onChange,
}: {
  icon?: ReactNode;
  label: string;
  sub?: string;
  value: T;
  options: ReadonlyArray<{ value: T; label: string }>;
  onChange: (value: T) => void;
}) {
  const id = useId();
  const subId = useId();
  return (
    <div className={`${rowBase} gap-3 py-1.5`}>
      {icon && <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>}
      <div className="flex-1 min-w-0 py-1">
        <label htmlFor={id} className="block text-[17px] desktop:text-[15px] text-tt-text cursor-pointer">
          {label}
        </label>
        {sub && (
          <span id={subId} className="block text-[12px] text-tt-secondary leading-snug mt-0.5">
            {sub}
          </span>
        )}
      </div>
      <div className="relative shrink-0 max-w-[58%]">
        <select
          id={id}
          name={id}
          value={value}
          aria-describedby={sub ? subId : undefined}
          onChange={(e) => onChange(e.target.value as T)}
          className="appearance-none w-full min-h-[44px] pl-3 pr-8 py-2 rounded-xl bg-tt-input dark:bg-tt-menu border border-tt-border text-[16px] desktop:text-[14px] text-tt-text font-medium cursor-pointer hover:bg-tt-hover focus-visible:outline-2 focus-visible:outline-tt-blue focus-visible:outline-offset-2 transition-colors"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown
          className="w-4 h-4 text-tt-secondary pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2"
          strokeWidth={2}
          aria-hidden="true"
        />
      </div>
    </div>
  );
}
