import { useEffect, useMemo, useState } from 'react';
import type { TaskInput, TaskList } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { parseQuickCapture } from '../domain/quickCapture';
import { formatDueLabel } from '../domain/recurrence';
import { X, Zap, Calendar, Flag, Tag } from 'lucide-react';

interface QuickCaptureModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void;
  lists: TaskList[];
  defaultListId?: string;
  initialText?: string;
}

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

  useEffect(() => {
    if (isOpen) {
      setText(initialText);
      setListId(defaultListId);
    }
  }, [isOpen, initialText, defaultListId]);

  const parsed = useMemo(() => parseQuickCapture(text), [text]);

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!parsed.title.trim()) return;
    onSave({
      title: parsed.title.trim(),
      listId,
      dueAt: parsed.dueAt,
      priority: parsed.priority,
      tags: parsed.tags.length ? parsed.tags : undefined,
      recurrence: null,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Zap className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Quick capture</h2>
              <p className="text-[11px] text-slate-500">
                Try: <code className="text-slate-400">Buy milk tomorrow 5pm #Errands !high</code>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <input
            autoFocus
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs doing?"
            className="w-full px-3.5 py-3 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 text-sm"
          />

          <div className="flex flex-wrap gap-2 text-[11px]">
            {parsed.dueAt && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-indigo-950/50 text-indigo-300 border border-indigo-800/40">
                <Calendar className="w-3 h-3" />
                {formatDueLabel(parsed.dueAt)}
              </span>
            )}
            {parsed.priority !== 'none' && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-rose-950/40 text-rose-300 border border-rose-800/40">
                <Flag className="w-3 h-3" />
                {parsed.priority}
              </span>
            )}
            {parsed.tags.map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-slate-800 text-slate-300 border border-slate-700"
              >
                <Tag className="w-3 h-3" />
                #{t}
              </span>
            ))}
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-500 mb-1">
              List
            </label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            >
              {activeLists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!parsed.title.trim()}
              className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-sm font-semibold"
            >
              Add task
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
