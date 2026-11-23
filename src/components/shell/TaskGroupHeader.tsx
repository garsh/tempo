import { ChevronDown, ChevronRight } from 'lucide-react';

interface TaskGroupHeaderProps {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  tone?: 'default' | 'overdue';
  sticky?: boolean;
  bgClassName?: string;
}

export function TaskGroupHeader({
  label,
  count,
  collapsed,
  onToggle,
  tone = 'default',
  sticky = true,
  bgClassName = 'bg-tt-bg desktop:bg-tt-surface',
}: TaskGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full flex items-center gap-1.5 px-3 sm:px-4 py-2 text-left ${bgClassName} ${
        sticky ? 'sticky top-0 z-10' : ''
      } cursor-pointer`}
    >
      {collapsed ? (
        <ChevronRight className="w-4 h-4 text-tt-muted" />
      ) : (
        <ChevronDown className="w-4 h-4 text-tt-muted" />
      )}
      <span
        className={`text-[20px] desktop:text-[16px] font-bold ${
          tone === 'overdue' ? 'text-tt-overdue' : 'text-tt-text'
        }`}
      >
        {label}
      </span>
      <span className="text-[13px] text-tt-muted tabular-nums">{count}</span>
    </button>
  );
}
