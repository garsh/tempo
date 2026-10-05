import { ChevronDown, ChevronRight } from 'lucide-react';

interface TaskGroupHeaderProps {
  label: string;
  count: number;
  collapsed: boolean;
  onToggle: () => void;
  tone?: 'default' | 'overdue';
}

export function TaskGroupHeader({
  label,
  count,
  collapsed,
  onToggle,
  tone = 'default',
}: TaskGroupHeaderProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center gap-1.5 px-3 sm:px-4 py-2 text-left sticky top-0 bg-tt-surface z-10"
    >
      {collapsed ? (
        <ChevronRight className="w-3.5 h-3.5 text-tt-muted" />
      ) : (
        <ChevronDown className="w-3.5 h-3.5 text-tt-muted" />
      )}
      <span
        className={`text-xs font-bold uppercase tracking-wide ${
          tone === 'overdue' ? 'text-tt-overdue' : 'text-tt-secondary'
        }`}
      >
        {label}
      </span>
      <span className="text-xs text-tt-muted tabular-nums">{count}</span>
    </button>
  );
}
