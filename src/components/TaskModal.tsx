import { useState, useEffect } from 'react';
import type {
  IntervalUnit,
  RecurrenceType,
  Task,
  TaskInput,
  TaskList,
  TaskPriority,
} from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { combineDueAt, formatDate, splitDueAt } from '../domain/recurrence';
import {
  X,
  Sparkles,
  Calendar,
  Clock,
  RefreshCw,
  List as ListIcon,
  Flag,
  Pin,
} from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void;
  initialTask?: Task | null;
  lists: TaskList[];
  defaultListId?: string;
}

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTask,
  lists,
  defaultListId = INBOX_LIST_ID,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [listId, setListId] = useState(defaultListId);
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('after_completion');
  const [intervalValue, setIntervalValue] = useState<number>(3);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [hasTime, setHasTime] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [pinned, setPinned] = useState(false);
  const [tagsInput, setTagsInput] = useState<string>('');

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      setListId(initialTask.listId || INBOX_LIST_ID);
      const hasRecurrence = !!initialTask.recurrence;
      setIsRecurring(hasRecurrence);
      if (initialTask.recurrence) {
        setRecurrenceType(initialTask.recurrence.type);
        setIntervalValue(initialTask.recurrence.intervalValue);
        setIntervalUnit(initialTask.recurrence.intervalUnit);
      } else {
        setRecurrenceType('after_completion');
        setIntervalValue(3);
        setIntervalUnit('days');
      }
      const parts = splitDueAt(initialTask.dueAt);
      setDueDate(parts.date);
      setDueTime(parts.time || '');
      setHasTime(!!parts.time);
      setPriority(initialTask.priority ?? 'none');
      setPinned(!!initialTask.pinned);
      setTagsInput(initialTask.tags ? initialTask.tags.join(', ') : '');
    } else {
      setTitle('');
      setNotes('');
      setListId(defaultListId);
      setIsRecurring(false);
      setRecurrenceType('after_completion');
      setIntervalValue(3);
      setIntervalUnit('days');
      setDueDate('');
      setDueTime('');
      setHasTime(false);
      setPriority('none');
      setPinned(false);
      setTagsInput('');
    }
  }, [initialTask, isOpen, defaultListId]);

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    const tags = tagsInput
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);

    let datePart = dueDate.trim();
    if (!datePart && isRecurring) {
      datePart = formatDate(new Date());
    }

    const resolvedDue = datePart
      ? combineDueAt(datePart, hasTime ? dueTime || '09:00' : null)
      : null;

    onSave({
      id: initialTask?.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      listId,
      dueAt: resolvedDue,
      priority,
      pinned,
      recurrence: isRecurring
        ? {
            type: recurrenceType,
            intervalValue: Math.max(1, intervalValue),
            intervalUnit,
          }
        : null,
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
              {initialTask ? 'Edit Task' : 'New Task'}
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
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Title *
            </label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Buy milk, Water plants, Pay rent"
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Add details or checklist items..."
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <ListIcon className="w-3.5 h-3.5 text-indigo-400" />
              List
            </label>
            <select
              value={listId}
              onChange={(e) => setListId(e.target.value)}
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
            >
              {activeLists.map((list) => (
                <option key={list.id} value={list.id}>
                  {list.name}
                </option>
              ))}
            </select>
          </div>

          {/* Priority + Pin */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                <Flag className="w-3.5 h-3.5 text-rose-400" />
                Priority
              </label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value as TaskPriority)}
                className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              >
                <option value="none">None</option>
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
                <Pin className="w-3.5 h-3.5 text-amber-400" />
                Pin
              </label>
              <button
                type="button"
                onClick={() => setPinned((p) => !p)}
                className={`w-full px-3 py-2 rounded-xl border text-sm font-medium transition-colors ${
                  pinned
                    ? 'bg-amber-950/40 border-amber-500/50 text-amber-300'
                    : 'bg-slate-950/70 border-slate-700/80 text-slate-400 hover:border-slate-600'
                }`}
              >
                {pinned ? 'Pinned' : 'Not pinned'}
              </button>
            </div>
          </div>

          {/* One-off vs Recurring */}
          <div className="pt-1">
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
              Task Type
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setIsRecurring(false)}
                className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                  !isRecurring
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs text-slate-200">One-off</div>
                <span className="text-[11px] text-slate-400 mt-1">Completes once</span>
              </button>
              <button
                type="button"
                onClick={() => setIsRecurring(true)}
                className={`flex flex-col text-left p-3 rounded-2xl border transition-all ${
                  isRecurring
                    ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                    : 'bg-slate-950/40 border-slate-800 text-slate-400 hover:border-slate-700'
                }`}
              >
                <div className="font-semibold text-xs text-slate-200">Recurring</div>
                <span className="text-[11px] text-slate-400 mt-1">Repeats on an interval</span>
              </button>
            </div>
          </div>

          {isRecurring && (
            <>
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
                  </button>
                </div>
              </div>

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
            </>
          )}

          {/* Due date + optional time */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-indigo-400" />
              Due Date {isRecurring ? '' : '(Optional)'}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 min-w-[10rem] px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => {
                    setDueDate('');
                    setDueTime('');
                    setHasTime(false);
                  }}
                  className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-xl"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="mt-2 flex items-center gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={hasTime}
                  disabled={!dueDate}
                  onChange={(e) => {
                    setHasTime(e.target.checked);
                    if (e.target.checked && !dueTime) setDueTime('09:00');
                  }}
                  className="rounded border-slate-600"
                />
                Include time
              </label>
              {hasTime && dueDate && (
                <input
                  type="time"
                  value={dueTime || '09:00'}
                  onChange={(e) => setDueTime(e.target.value)}
                  className="px-3 py-1.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>
            {isRecurring && !dueDate && (
              <p className="text-[11px] text-slate-500 mt-1">Defaults to today if left blank.</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
              Tags (Comma separated)
            </label>
            <input
              type="text"
              value={tagsInput}
              onChange={(e) => setTagsInput(e.target.value)}
              placeholder="Home, Health, Work"
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-indigo-500"
            />
          </div>

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
              {initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
