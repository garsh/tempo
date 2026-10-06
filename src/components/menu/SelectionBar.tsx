import { useState } from 'react';
import { CalendarDays, CheckSquare, FolderInput, Trash2, X } from 'lucide-react';
import type { TaskList } from '../../types/task';
import { formatDate } from '../../domain/recurrence';
import { listDotColor } from '../../theme/listColors';
import { ConfirmDialog, Sheet } from '../ui/Sheet';

/** Select-mode header (replaces the title row): ✕ · "N selected" · Select all. */
export function SelectionHeader({
  count,
  total,
  onExit,
  onSelectAll,
}: {
  count: number;
  total: number;
  onExit: () => void;
  onSelectAll: () => void;
}) {
  const all = count > 0 && count === total;
  return (
    <div className="flex items-center gap-1 h-16 pl-[6px] pr-3 xl:h-auto xl:px-5 xl:pt-4 xl:pb-2">
      <button type="button" onClick={onExit} aria-label="Exit select mode" className="w-11 h-11 flex items-center justify-center text-tt-text">
        <X className="w-6 h-6" strokeWidth={1.9} />
      </button>
      <h1 className="flex-1 ml-[2px] text-[21px] font-bold text-tt-text" aria-live="polite">
        {count} selected
      </h1>
      <button type="button" onClick={onSelectAll} className="px-2 py-2 text-[15px] font-semibold text-tt-blue">
        {all ? 'Deselect All' : 'Select All'}
      </button>
    </div>
  );
}

interface SelectionBarProps {
  count: number;
  lists: TaskList[];
  onComplete: () => void;
  onMove: (listId: string) => void;
  onSetDate: (date: string | null) => void;
  onDelete: () => void;
}

/** Batch action bar shown instead of the tab bar while selecting. */
export function SelectionBar({ count, lists, onComplete, onMove, onSetDate, onDelete }: SelectionBarProps) {
  const [sheet, setSheet] = useState<'move' | 'date' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [customDate, setCustomDate] = useState('');
  const disabled = count === 0;
  const today = new Date();
  const plus = (n: number) => {
    const d = new Date(today);
    d.setDate(d.getDate() + n);
    return formatDate(d);
  };
  const btn = (label: string, Icon: typeof X, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={`flex-1 flex flex-col items-center justify-center gap-[3px] text-[11px] font-medium disabled:opacity-35 ${
        danger ? 'text-tt-overdue' : 'text-tt-text'
      }`}
    >
      <Icon className="w-[21px] h-[21px]" strokeWidth={1.8} />
      {label}
    </button>
  );
  const choice = (label: string, onClick: () => void, sub?: string) => (
    <button type="button" onClick={onClick} className="w-full flex items-center gap-3 h-[50px] px-5 text-[16px] text-left hover:bg-tt-hover">
      <span className="flex-1">{label}</span>
      {sub && <span className="text-[13px] text-tt-secondary">{sub}</span>}
    </button>
  );

  return (
    <>
      <nav
        aria-label="Batch actions"
        data-testid="selection-bar"
        className="shrink-0 flex items-stretch h-14 bg-tt-bg xl:bg-tt-surface border-t border-tt-border box-content"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {btn('Complete', CheckSquare, onComplete)}
        {btn('Move', FolderInput, () => setSheet('move'))}
        {btn('Date', CalendarDays, () => setSheet('date'))}
        {btn('Delete', Trash2, () => setConfirm(true), true)}
      </nav>

      <Sheet open={sheet === 'move'} onClose={() => setSheet(null)} title="Move to list">
        {lists.map((l, i) => (
          <button
            key={l.id}
            type="button"
            onClick={() => {
              onMove(l.id);
              setSheet(null);
            }}
            className="w-full flex items-center gap-3 h-[50px] px-5 text-[16px] text-left hover:bg-tt-hover"
          >
            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: i === 0 ? 'var(--tt-smart-orange)' : listDotColor(i - 1) }} />
            {l.name}
          </button>
        ))}
      </Sheet>

      <Sheet open={sheet === 'date'} onClose={() => setSheet(null)} title="Set date">
        {[
          ['Today', plus(0)],
          ['Tomorrow', plus(1)],
          ['Next week', plus(7)],
        ].map(([label, date]) =>
          choice(label, () => {
            onSetDate(date);
            setSheet(null);
          }, date)
        )}
        <form
          className="flex items-center gap-2 px-5 py-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (!customDate) return;
            onSetDate(customDate);
            setSheet(null);
          }}
        >
          <input
            type="date"
            value={customDate}
            onChange={(e) => setCustomDate(e.target.value)}
            aria-label="Pick a date"
            className="flex-1 px-3 py-2 rounded-xl bg-tt-input text-[15px] outline-none"
          />
          <button type="submit" disabled={!customDate} className="px-4 py-2 rounded-lg bg-tt-blue text-white text-[14px] font-semibold disabled:opacity-40">
            Set
          </button>
        </form>
        {choice('No date', () => {
          onSetDate(null);
          setSheet(null);
        })}
      </Sheet>

      <ConfirmDialog
        open={confirm}
        title={`Delete ${count} task${count === 1 ? '' : 's'}?`}
        message="Deleted tasks are removed from all lists."
        confirmLabel="Delete"
        onCancel={() => setConfirm(false)}
        onConfirm={() => {
          setConfirm(false);
          onDelete();
        }}
      />
    </>
  );
}
