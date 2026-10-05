import { useState, useEffect } from 'react';
import type {
  IntervalUnit,
  RecurrenceType,
  Subtask,
  Task,
  TaskInput,
  TaskList,
  TaskPriority,
  Weekday,
} from '../types/task';
import { INBOX_LIST_ID, WEEKDAY_LABELS } from '../types/task';
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
  Plus,
  Trash2,
  CheckSquare,
} from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void;
  initialTask?: Task | null;
  lists: TaskList[];
  defaultListId?: string;
}

const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

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
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [useMonthDay, setUseMonthDay] = useState(false);
  const [monthDay, setMonthDay] = useState(1);
  const [endOnDate, setEndOnDate] = useState('');
  const [endAfterCount, setEndAfterCount] = useState('');
  const [dueDate, setDueDate] = useState<string>('');
  const [dueTime, setDueTime] = useState<string>('');
  const [hasTime, setHasTime] = useState(false);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [pinned, setPinned] = useState(false);
  const [tagsInput, setTagsInput] = useState<string>('');
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = useState('');

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      setListId(initialTask.listId || INBOX_LIST_ID);
      const hasRecurrence = !!initialTask.recurrence;
      setIsRecurring(hasRecurrence);
      if (initialTask.recurrence) {
        const r = initialTask.recurrence;
        setRecurrenceType(r.type);
        setIntervalValue(r.intervalValue);
        setIntervalUnit(r.intervalUnit);
        setWeekdays(r.weekdays ? [...r.weekdays] : []);
        setUseMonthDay(r.monthDay != null);
        setMonthDay(r.monthDay ?? 1);
        setEndOnDate(r.endOnDate || '');
        setEndAfterCount(r.endAfterCount != null ? String(r.endAfterCount) : '');
      } else {
        setRecurrenceType('after_completion');
        setIntervalValue(3);
        setIntervalUnit('days');
        setWeekdays([]);
        setUseMonthDay(false);
        setMonthDay(1);
        setEndOnDate('');
        setEndAfterCount('');
      }
      const parts = splitDueAt(initialTask.dueAt);
      setDueDate(parts.date);
      setDueTime(parts.time || '');
      setHasTime(!!parts.time);
      setPriority(initialTask.priority ?? 'none');
      setPinned(!!initialTask.pinned);
      setTagsInput(initialTask.tags ? initialTask.tags.join(', ') : '');
      setSubtasks(initialTask.subtasks ? [...initialTask.subtasks] : []);
      setNewSubtaskTitle('');
    } else {
      setTitle('');
      setNotes('');
      setListId(defaultListId);
      setIsRecurring(false);
      setRecurrenceType('after_completion');
      setIntervalValue(3);
      setIntervalUnit('days');
      setWeekdays([]);
      setUseMonthDay(false);
      setMonthDay(1);
      setEndOnDate('');
      setEndAfterCount('');
      setDueDate('');
      setDueTime('');
      setHasTime(false);
      setPriority('none');
      setPinned(false);
      setTagsInput('');
      setSubtasks([]);
      setNewSubtaskTitle('');
    }
  }, [initialTask, isOpen, defaultListId]);

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);

  const toggleWeekday = (d: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const addSubtask = () => {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [
      ...prev,
      { id: crypto.randomUUID(), title: t, completed: false },
    ]);
    setNewSubtaskTitle('');
  };

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

    let recurrence = null;
    if (isRecurring) {
      const countNum = endAfterCount.trim() ? parseInt(endAfterCount, 10) : null;
      recurrence = {
        type: recurrenceType,
        intervalValue: Math.max(1, intervalValue),
        intervalUnit,
        weekdays:
          intervalUnit === 'weeks' && weekdays.length > 0
            ? ([...weekdays] as Weekday[])
            : undefined,
        monthDay:
          intervalUnit === 'months' && useMonthDay
            ? Math.max(1, Math.min(31, monthDay))
            : undefined,
        endOnDate: endOnDate.trim() || null,
        endAfterCount:
          countNum != null && !Number.isNaN(countNum) && countNum > 0 ? countNum : null,
      };
    }

    onSave({
      id: initialTask?.id,
      title: title.trim(),
      notes: notes.trim() || undefined,
      listId,
      dueAt: resolvedDue,
      priority,
      pinned,
      recurrence,
      tags: tags.length > 0 ? tags : undefined,
      subtasks: subtasks.length > 0 ? subtasks : undefined,
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
              placeholder="Add details..."
              className="w-full px-3.5 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm resize-none"
            />
          </div>

          {/* Subtasks / check items */}
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1">
              <CheckSquare className="w-3.5 h-3.5 text-emerald-400" />
              Check items
            </label>
            <div className="space-y-1.5 mb-2">
              {subtasks.map((st) => (
                <div
                  key={st.id}
                  className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-950/50 border border-slate-800"
                >
                  <input
                    type="checkbox"
                    checked={st.completed}
                    onChange={() =>
                      setSubtasks((prev) =>
                        prev.map((s) =>
                          s.id === st.id ? { ...s, completed: !s.completed } : s
                        )
                      )
                    }
                    className="rounded border-slate-600"
                  />
                  <input
                    type="text"
                    value={st.title}
                    onChange={(e) =>
                      setSubtasks((prev) =>
                        prev.map((s) =>
                          s.id === st.id ? { ...s, title: e.target.value } : s
                        )
                      )
                    }
                    className={`flex-1 bg-transparent text-xs focus:outline-none ${
                      st.completed ? 'line-through text-slate-500' : 'text-slate-200'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => setSubtasks((prev) => prev.filter((s) => s.id !== st.id))}
                    className="p-1 text-slate-500 hover:text-rose-400"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                value={newSubtaskTitle}
                onChange={(e) => setNewSubtaskTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addSubtask();
                  }
                }}
                placeholder="Add a check item..."
                className="flex-1 px-3 py-1.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:outline-none focus:border-indigo-500"
              />
              <button
                type="button"
                onClick={addSubtask}
                className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
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
              </button>
            </div>
          </div>

          {isRecurring && (
            <>
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

              <div className="grid grid-cols-2 gap-3">
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
                    onChange={(e) => {
                      const u = e.target.value as IntervalUnit;
                      setIntervalUnit(u);
                      if (u !== 'weeks') setWeekdays([]);
                      if (u !== 'months') setUseMonthDay(false);
                    }}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              {intervalUnit === 'weeks' && (
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    Weekdays (optional)
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_WEEKDAYS.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => toggleWeekday(d)}
                        className={`px-2 py-1 rounded-lg text-[11px] font-semibold border ${
                          weekdays.includes(d)
                            ? 'bg-indigo-600 border-indigo-500 text-white'
                            : 'bg-slate-950 border-slate-700 text-slate-400'
                        }`}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    ))}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    e.g. Mon–Fri for every weekday. Leave empty to keep the same weekday.
                  </p>
                </div>
              )}

              {intervalUnit === 'months' && (
                <div>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-400 cursor-pointer mb-1.5">
                    <input
                      type="checkbox"
                      checked={useMonthDay}
                      onChange={(e) => setUseMonthDay(e.target.checked)}
                      className="rounded border-slate-600"
                    />
                    On a specific day of month
                  </label>
                  {useMonthDay && (
                    <input
                      type="number"
                      min={1}
                      max={31}
                      value={monthDay}
                      onChange={(e) => setMonthDay(parseInt(e.target.value) || 1)}
                      className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    End on date
                  </label>
                  <input
                    type="date"
                    value={endOnDate}
                    onChange={(e) => setEndOnDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-1.5">
                    End after count
                  </label>
                  <input
                    type="number"
                    min={1}
                    placeholder="e.g. 10"
                    value={endAfterCount}
                    onChange={(e) => setEndAfterCount(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700/80 rounded-xl text-slate-100 text-sm placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </>
          )}

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
