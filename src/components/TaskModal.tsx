import { useState, useEffect } from 'react';
import type {
  IntervalUnit,
  RecurrenceType,
  Task,
  TaskInput,
  Weekday,
} from '../types/task';
import { INBOX_LIST_ID, WEEKDAY_LABELS } from '../types/task';
import { formatDate, getDueDatePart } from '../domain/recurrence';
import {
  X,
  Sparkles,
  Calendar,
  RefreshCw,
  Pin,
} from 'lucide-react';

interface TaskModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void;
  initialTask?: Task | null;
  defaultDueAt?: string | null;
}

const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const TaskModal: React.FC<TaskModalProps> = ({
  isOpen,
  onClose,
  onSave,
  initialTask,
  defaultDueAt,
}) => {
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
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
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
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
      setDueDate(initialTask.dueAt ? getDueDatePart(initialTask.dueAt) : defaultDueAt ? getDueDatePart(defaultDueAt) : '');
      setPinned(!!initialTask.pinned);
    } else {
      setTitle('');
      setNotes('');
      setIsRecurring(false);
      setRecurrenceType('after_completion');
      setIntervalValue(3);
      setIntervalUnit('days');
      setWeekdays([]);
      setUseMonthDay(false);
      setMonthDay(1);
      setEndOnDate('');
      setEndAfterCount('');
      setDueDate(defaultDueAt ? getDueDatePart(defaultDueAt) : '');
      setPinned(false);
    }
  }, [initialTask, isOpen, defaultDueAt]);

  if (!isOpen) return null;

  const toggleWeekday = (d: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b)
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;

    let datePart = dueDate.trim();
    if (!datePart && isRecurring) {
      datePart = formatDate(new Date());
    }

    const resolvedDue = datePart || null;

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
      listId: initialTask?.listId || INBOX_LIST_ID,
      dueAt: resolvedDue,
      priority: 'none',
      pinned,
      recurrence,
      tags: undefined,
    });

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-tt-border/80">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-tt-blue-soft text-tt-blue">
              <Sparkles className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-tt-text">
              {initialTask ? 'Edit Task' : 'New Task'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-tt-secondary hover:text-tt-text rounded-xl hover:bg-tt-sidebar transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-1.5">
              Task Title
            </label>
            <input
              type="text"
              required
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="What needs to be done?"
              className="w-full px-3.5 py-2.5 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-tt-text placeholder-tt-muted text-sm focus:outline-none focus:border-tt-blue transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-1.5">
              Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional details..."
              className="w-full px-3.5 py-2 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-tt-text placeholder-tt-muted text-sm focus:outline-none focus:border-tt-blue transition-colors resize-none"
            />
          </div>

          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-semibold uppercase tracking-wider text-tt-secondary flex items-center gap-1.5">
              <Pin className="w-3.5 h-3.5" />
              Pin to Top
            </span>
            <button
              type="button"
              onClick={() => setPinned((p) => !p)}
              className={`px-3 py-1.5 rounded-xl text-xs font-medium border transition-colors ${
                pinned
                  ? 'bg-tt-blue text-white border-tt-blue'
                  : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:text-tt-text'
              }`}
            >
              {pinned ? 'Pinned' : 'Normal'}
            </button>
          </div>

          <div className="pt-2 border-t border-tt-border/80">
            <label className="block text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-2 flex items-center gap-1.5">
              <RefreshCw className="w-3.5 h-3.5 text-tt-blue" />
              Task Type
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setIsRecurring(false)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  !isRecurring
                    ? 'bg-tt-blue text-white border-tt-blue shadow-sm'
                    : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:bg-tt-hover'
                }`}
              >
                One-off Task
              </button>
              <button
                type="button"
                onClick={() => setIsRecurring(true)}
                className={`py-2 px-3 rounded-xl text-xs font-medium border transition-all ${
                  isRecurring
                    ? 'bg-tt-blue text-white border-tt-blue shadow-sm'
                    : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:bg-tt-hover'
                }`}
              >
                Recurring Routine
              </button>
            </div>
          </div>

          {isRecurring && (
            <div className="p-4 rounded-2xl bg-tt-sidebar/40 border border-tt-border space-y-4 animate-in fade-in slide-in-from-top-1 duration-150">
              <div>
                <label className="block text-xs font-medium text-tt-secondary mb-1.5">
                  Recurrence Logic
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRecurrenceType('after_completion')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      recurrenceType === 'after_completion'
                        ? 'border-tt-blue bg-tt-blue-soft/40 text-tt-blue font-medium'
                        : 'border-tt-border bg-tt-sidebar text-tt-secondary hover:bg-tt-hover'
                    }`}
                  >
                    <div className="text-xs font-bold">After Completion</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      Reschedules after each completion
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setRecurrenceType('fixed_interval')}
                    className={`p-2.5 rounded-xl border text-left transition-all ${
                      recurrenceType === 'fixed_interval'
                        ? 'border-tt-blue bg-tt-blue-soft/40 text-tt-blue font-medium'
                        : 'border-tt-border bg-tt-sidebar text-tt-secondary hover:bg-tt-hover'
                    }`}
                  >
                    <div className="text-xs font-bold">Fixed Schedule</div>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      Repeats strictly on set days
                    </div>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-tt-secondary mb-1">
                    Repeat Every
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={intervalValue}
                    onChange={(e) => setIntervalValue(parseInt(e.target.value, 10) || 1)}
                    className="w-full px-3 py-1.5 bg-tt-sidebar/70 border border-tt-border rounded-xl text-tt-text text-sm focus:outline-none focus:border-tt-blue"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-tt-secondary mb-1">
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
                    className="w-full px-3 py-1.5 bg-tt-sidebar/70 border border-tt-border rounded-xl text-tt-text text-sm focus:outline-none focus:border-tt-blue"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              {intervalUnit === 'weeks' && (
                <div>
                  <label className="block text-xs font-medium text-tt-secondary mb-1.5">
                    On Weekdays (Optional)
                  </label>
                  <div className="flex gap-1.5">
                    {ALL_WEEKDAYS.map((d) => {
                      const sel = weekdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleWeekday(d)}
                          className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                            sel
                              ? 'bg-tt-blue text-white border-tt-blue'
                              : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:bg-tt-hover'
                          }`}
                        >
                          {WEEKDAY_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {intervalUnit === 'months' && (
                <div className="flex items-center gap-3">
                  <label className="inline-flex items-center gap-2 text-xs text-tt-secondary cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMonthDay}
                      onChange={(e) => setUseMonthDay(e.target.checked)}
                      className="rounded border-tt-border accent-tt-blue"
                    />
                    On Day of Month
                  </label>
                  {useMonthDay && (
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={monthDay}
                      onChange={(e) => setMonthDay(parseInt(e.target.value, 10) || 1)}
                      className="w-16 px-2 py-1 bg-tt-sidebar/70 border border-tt-border rounded-xl text-tt-text text-xs focus:outline-none focus:border-tt-blue"
                    />
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-tt-border/60">
                <div>
                  <label className="block text-[11px] text-tt-muted mb-1">
                    End on Date (Optional)
                  </label>
                  <input
                    type="date"
                    value={endOnDate}
                    onChange={(e) => setEndOnDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-tt-sidebar/70 border border-tt-border rounded-xl text-tt-text text-xs focus:outline-none focus:border-tt-blue"
                  />
                </div>
                <div>
                  <label className="block text-[11px] text-tt-muted mb-1">
                    End after occurrences
                  </label>
                  <input
                    type="number"
                    min="1"
                    placeholder="Unlimited"
                    value={endAfterCount}
                    onChange={(e) => setEndAfterCount(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-tt-sidebar/70 border border-tt-border rounded-xl text-tt-text text-xs focus:outline-none focus:border-tt-blue placeholder:text-tt-muted/60"
                  />
                </div>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-tt-secondary mb-1.5 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-tt-blue" />
              Due Date {isRecurring ? '' : '(Optional)'}
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="flex-1 min-w-[10rem] px-3.5 py-2 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-tt-text text-sm focus:outline-none focus:border-tt-blue"
              />
              {dueDate && (
                <button
                  type="button"
                  onClick={() => setDueDate('')}
                  className="px-3 py-2 text-xs text-tt-secondary hover:text-tt-text bg-tt-sidebar rounded-xl"
                >
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-tt-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-tt-secondary hover:text-tt-text transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-tt-blue hover:bg-tt-blue-hover text-white font-medium text-sm transition-all shadow-lg shadow-tt-blue/25 active:scale-95"
            >
              {initialTask ? 'Save Changes' : 'Create Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
