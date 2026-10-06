import { Check } from 'lucide-react';
import type { GroupBy, SortBy } from '../../prefs/prefs';
import { Sheet } from '../ui/Sheet';

const GROUPS: { id: GroupBy; label: string }[] = [
  { id: 'none', label: 'None' },
  { id: 'date', label: 'Date' },
  { id: 'list', label: 'List' },
  { id: 'priority', label: 'Priority' },
  { id: 'tag', label: 'Tag' },
];
const SORTS: { id: SortBy; label: string }[] = [
  { id: 'due', label: 'Due Date' },
  { id: 'priority', label: 'Priority' },
  { id: 'title', label: 'Title' },
  { id: 'created', label: 'Created Time' },
];

export function GroupSortSheet({
  open,
  groupBy,
  sortBy,
  onChange,
  onClose,
}: {
  open: boolean;
  groupBy: GroupBy;
  sortBy: SortBy;
  onChange: (patch: { groupBy?: GroupBy; sortBy?: SortBy }) => void;
  onClose: () => void;
}) {
  const section = <T extends string>(
    title: string,
    items: { id: T; label: string }[],
    value: T,
    pick: (v: T) => void
  ) => (
    <div className="px-2 pb-2" role="radiogroup" aria-label={title}>
      <div className="px-3 pt-2 pb-1 text-[13px] font-semibold text-tt-secondary">{title}</div>
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          role="radio"
          aria-checked={value === it.id}
          onClick={() => pick(it.id)}
          className="w-full flex items-center h-[46px] px-3 rounded-xl text-[16px] text-left hover:bg-tt-hover"
        >
          <span className={`flex-1 ${value === it.id ? 'text-tt-blue font-semibold' : ''}`}>{it.label}</span>
          {value === it.id && <Check className="w-[18px] h-[18px] text-tt-blue" strokeWidth={2.4} />}
        </button>
      ))}
    </div>
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Group & Sort"
      testId="group-sort-sheet"
      action={
        <button type="button" onClick={onClose} className="text-[15px] font-semibold text-tt-blue px-1">
          Done
        </button>
      }
    >
      {section('Group by', GROUPS, groupBy, (g) => onChange({ groupBy: g }))}
      <div className="mx-5 h-px bg-tt-border" />
      {section('Sort by', SORTS, sortBy, (s) => onChange({ sortBy: s }))}
    </Sheet>
  );
}
