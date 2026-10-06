import type { ReactNode } from 'react';
import { ArrowLeft, Check, ChevronRight } from 'lucide-react';

/** Page header: ← + bold title (TickTick settings). */
export function SettingsHeader({ title, onBack, backLabel = 'Back' }: { title: string; onBack: () => void; backLabel?: string }) {
  return (
    <header className="shrink-0 flex items-center h-[72px] pt-[9px] pl-[14px] pr-4">
      <button type="button" onClick={onBack} aria-label={backLabel} className="w-[44px] h-[44px] -ml-[4px] flex items-center justify-center text-tt-text">
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
      <span className={`flex-1 min-w-0 truncate text-[18px] ${danger ? 'text-tt-overdue' : 'text-tt-text'}`}>{label}</span>
      {value != null && <span className="shrink-0 text-[14px] text-tt-secondary truncate max-w-[45%]">{value}</span>}
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
    <button type="button" onClick={onClick} className={`${rowBase} active:bg-tt-hover hover:bg-tt-hover`}>
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
        <span className="block text-[17px] text-tt-text">{label}</span>
        {sub && <span className="block text-[12px] text-tt-secondary leading-snug mt-0.5">{sub}</span>}
      </span>
      {children}
    </div>
  );
}

export function RadioRow({ label, checked, onSelect, sub }: { label: ReactNode; checked: boolean; onSelect: () => void; sub?: ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={checked} onClick={onSelect} className={`${rowBase} hover:bg-tt-hover`}>
      <span className="flex-1 min-w-0">
        <span className={`block text-[17px] ${checked ? 'text-tt-blue font-medium' : 'text-tt-text'}`}>{label}</span>
        {sub && <span className="block text-[12px] text-tt-secondary">{sub}</span>}
      </span>
      {checked && <Check className="w-5 h-5 text-tt-blue" strokeWidth={2.4} />}
    </button>
  );
}

export function Divider() {
  return <div className="ml-[48px] h-px bg-tt-border/60" />;
}
