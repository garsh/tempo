import { Plus } from 'lucide-react';

interface QuickAddBarProps {
  onClick: () => void;
}

/** Desktop TickTick-style quick add under the list header. */
export function QuickAddBar({ onClick }: QuickAddBarProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-2 mx-auto px-3 py-2.5 rounded-xl bg-[#F0F0F2] hover:bg-[#E8E8ED] text-tt-secondary text-[14px] transition-colors"
    >
      <Plus className="w-4 h-4 text-tt-blue" />
      <span>Add task…</span>
    </button>
  );
}
