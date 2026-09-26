import { useState, useEffect } from 'react';
import type { IntervalUnit, PeriodicTask, RecurrenceType } from '../types/task';
import { formatDate } from '../domain/recurrence';
import { X, Sparkles, Calendar, Clock, RefreshCw } from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: Omit<PeriodicTask, 'id' | 'createdAt' | 'updatedAt' | 'completionHistory'> & { id?: string }) => void;
  initialTask?: PeriodicTask | null;
}

export const TaskModal: React.FC<TaskModalProps> = ({ isOpen, onClose, onSave, initialTask }) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('after_completion');
  const [intervalValue, setIntervalValue] = useState<number>(3);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [dueDate, setDueDate] = useState<string>(formatDate(new Date()));
  const [tagsInput, setTagsInput] = useState<string>('');

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      setRecurrenceType(initialTask.recurrenceType);
      setIntervalValue(initialTask.intervalValue);
      setIntervalUnit(initialTask.intervalUnit);
      setDueDate(initialTask.dueDate);
      setTagsInput(initialTask.tags ? initialTask.tags.join(', ') : '');
    } else {
      setTitle('');
      setNotes('');
      setRecurrenceType('after_completion');
      setIntervalValue(3);
      setIntervalUnit('days');
      setDueDate(formatDate(new Date()));
      setTagsInput('');
    }
  }, [initialTask, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    onSave({
      id: initialTask?.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      recurrenceType,
      intervalValue: Math.max(1, intervalValue),
      intervalUnit,
      dueDate,
      tags: tags.length > 0 ? tags : undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">
              {initialTask ? 'Edit Routine' : 'New Periodic Routine'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          {/* Title */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Routine Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Water monstera, Replace car oil, Clean filters"
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            />
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Notes / Instructions (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add details, model numbers, or checklist items..."
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          {/* Recurrence Model Selector */}
          <div className="pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Recurrence Type
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setRecurrenceType('after_completion')}
                className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                  recurrenceType === 'after_completion'
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-200">
                  <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                  After Completion
                </div>
                <span className="text-[11px] text-slate-400 mt-1">
                  Resets clock whenever you finish it (e.g. hair cut, chores)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setRecurrenceType('fixed_interval')}
                className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                  recurrenceType === 'fixed_interval'
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-xs text-slate-200">
                  <Clock className="w-3.5 h-3.5 text-cyan-400" />
                  Fixed Schedule
                </div>
                <span className="text-[11px] text-slate-400 mt-1">
                  Sticks to calendar interval regardless of late completion (e.g. bills)
                </span>
              </button>
            </div>
          </div>

          {/* Cadence / Interval settings */}
          <div className="grid grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Repeat Every
              </label>
              <input
                type="number"
                min="1"
                max="365"
                value={intervalValue}
                onChange={(e) => setIntervalValue(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                Unit
              </label>
              <select
                value={intervalUnit}
                onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
            </div>
          </div>

          {/* Due date */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              {initialTask ? 'Next Due Date' : 'First Due Date'}
            </label>
            <input
              type="date"
              required
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Tags */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Home, Health, Car, Work"
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-sm transition-all shadow-lg shadow-indigo-600/25 active:scale-95"
            >
              {initialTask ? 'Save Changes' : 'Create Routine'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
