import { useEffect, useMemo, useState } from 'react';
import type { TaskInput, TaskList, TaskPriority } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { parseQuickCapture } from '../domain/quickCapture';
import { formatDueLabel } from '../domain/recurrence';
import { X, Send, Calendar, Flag, Tag, List as ListIcon } from 'lucide-react';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void;
  lists: TaskList[];
  defaultListId?: string;
  initialText?: string;
}

const PRI_CHIP: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'high', label: 'High', color: '#E03131' },
  { id: 'medium', label: 'Med', color: '#FAA80C' },
  { id: 'low', label: 'Low', color: '#4772FA' },
  { id: 'none', label: 'None', color: '#C7C7CC' },
];

export function QuickCaptureModal({
  isOpen,
  onClose,
  onSave,
  lists,
  defaultListId = INBOX_LIST_ID,
  initialText = '',
}: QuickCaptureModalProps) {
  const [text, setText] = useState(initialText);
  const [listId, setListId] = useState(defaultListId);
  const [priorityOverride, setPriorityOverride] = useState<TaskPriority | null>(null);

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setListId(defaultListId);
      setPriorityOverride(null);
    }
  }, [isOpen, initialText, defaultListId]);

  const parsed = useMemo(() => parseQuickCapture(text), [text]);
  const priority = priorityOverride ?? parsed.priority;

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!parsed.title.trim()) return;
    onSave({
      title: parsed.title.trim(),
      listId,
      dueAt: parsed.dueAt,
      priority,
      tags: parsed.tags.length ? parsed.tags : undefined,
      recurrence: null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-start justify-center sm:pt-[12vh] bg-black/40">
      <button type="button" className="absolute inset-0" aria-label="Dismiss" onClick={onClose} />
      <div className="relative w-full sm:max-w-lg bg-white border border-tt-border rounded-t-3xl sm:rounded-3xl shadow-2xl p-4 sm:p-5 pb-6">
        <div className="sm:hidden w-10 h-1 rounded-full bg-tt-border mx-auto mb-3" />
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-bold text-tt-text">Add task</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-tt-secondary hover:text-tt-text rounded-lg hover:bg-tt-sidebar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <textarea
            autoFocus
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="What needs doing? Try: Buy milk tomorrow 5pm #Errands !high"
            className="w-full px-3 py-2.5 rounded-xl bg-tt-sidebar border border-transparent focus:border-tt-blue focus:bg-white text-[15px] outline-none resize-none"
          />

          <div className="flex flex-wrap gap-1.5">
            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tt-sidebar text-xs text-tt-secondary">
              <Calendar className="w-3 h-3 text-tt-blue" />
              {parsed.dueAt ? formatDueLabel(parsed.dueAt) : 'No date'}
            </span>
            {PRI_CHIP.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPriorityOverride(p.id)}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border ${
                  priority === p.id
                    ? 'border-current bg-white font-semibold'
                    : 'border-transparent bg-tt-sidebar text-tt-secondary'
                }`}
                style={priority === p.id ? { color: p.color } : undefined}
              >
                <Flag className="w-3 h-3" />
                {p.label}
              </button>
            ))}
            {parsed.tags.map((tag) => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tt-blue-soft text-tt-blue text-xs font-medium"
              >
                <Tag className="w-3 h-3" />
                {tag}
              </span>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-tt-sidebar text-xs text-tt-secondary">
              <ListIcon className="w-3.5 h-3.5" />
              <select
                value={listId}
                onChange={(e) => setListId(e.target.value)}
                className="flex-1 bg-transparent outline-none text-tt-text font-medium"
              >
                {activeLists.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              disabled={!parsed.title.trim()}
              className="w-11 h-11 rounded-full bg-tt-blue hover:bg-tt-blue-hover disabled:opacity-40 text-white flex items-center justify-center shadow-md shadow-tt-blue/25"
              title="Save"
            >
              <Send className="w-5 h-5" />
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
