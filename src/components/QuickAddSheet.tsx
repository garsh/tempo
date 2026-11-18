import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import type {
  IntervalUnit,
  RecurrenceRule,
  RecurrenceType,
  Task,
  TaskInput,
  Weekday,
} from '../types/task';
import { INBOX_LIST_ID, WEEKDAY_LABELS } from '../types/task';
import {
  formatDate,
  formatRecurrenceLabel,
  getDueDatePart,
} from '../domain/recurrence';
import { dueAtForSelectedDay } from '../domain/calendarUi';

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void | Promise<void>;
  initialTask?: Task | null;
  /** Pre-filled due date (YYYY-MM-DD). Calendar FAB passes the selected day. */
  defaultDueAt?: string | null;
}

const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export const KEYBOARD_HEIGHT_STORAGE_KEY = 'tempo_last_keyboard_height';

export function isMobileKeyboardDevice(): boolean {
  if (typeof window === 'undefined') return false;
  const isTouch = 'ontouchstart' in window || (navigator.maxTouchPoints && navigator.maxTouchPoints > 0);
  const isCoarse = typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches;
  const isMobileUA = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth < 1024;
  return isSmallScreen && (isTouch || isCoarse || isMobileUA);
}

export function getStoredOrEstimatedKeyboardHeight(): number {
  if (typeof window === 'undefined') return 0;
  if (!isMobileKeyboardDevice()) return 0;

  try {
    const stored = localStorage.getItem(KEYBOARD_HEIGHT_STORAGE_KEY);
    if (stored) {
      const val = parseInt(stored, 10);
      if (!Number.isNaN(val) && val >= 160 && val <= 500) {
        return val;
      }
    }
  } catch {
    // Ignore localStorage access failures
  }

  return Math.min(330, Math.max(260, Math.round(window.innerHeight * 0.36)));
}

export function computeQuickAddSheetMaxHeight({
  keyboardInset,
}: {
  keyboardInset: number;
}): string {
  if (keyboardInset > 0) {
    return `calc(100dvh - ${keyboardInset}px - max(24px, env(safe-area-inset-top)))`;
  }
  return 'calc(100dvh - max(24px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))';
}

export function computeQuickAddSheetBottom({
  isMobile,
  activeKeyboardInset,
  lastKnownKeyboardInset,
  fallbackHeight,
}: {
  isMobile: boolean;
  activeKeyboardInset: number;
  lastKnownKeyboardInset: number;
  fallbackHeight: number;
}): number {
  if (!isMobile) {
    return activeKeyboardInset > 0 ? activeKeyboardInset : 0;
  }
  if (activeKeyboardInset > 100) {
    return activeKeyboardInset;
  }
  return lastKnownKeyboardInset > 0 ? lastKnownKeyboardInset : fallbackHeight;
}

/**
 * Sleek bottom sheet for creating and editing routines.
 * Supports quick title/notes, inline date picker, and repeat/recurrence rules.
 */
export function QuickAddSheet({
  isOpen,
  onClose,
  onSave,
  initialTask = null,
  defaultDueAt = null,
}: QuickAddSheetProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'date' | 'repeat'>('none');
  const [fullScreen, setFullScreen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Preserve the last measured virtual keyboard height across focus shifts
  const lastActiveKeyboardInsetRef = useRef<number>(0);
  const [keyboardInset, setKeyboardInset] = useState(() =>
    isOpen ? getStoredOrEstimatedKeyboardHeight() : 0
  );

  // When opening on mobile, immediately position above the keyboard before the first paint
  const [prevIsOpen, setPrevIsOpen] = useState(isOpen);
  if (isOpen && !prevIsOpen) {
    setPrevIsOpen(true);
    if (isMobileKeyboardDevice()) {
      const initialHeight = lastActiveKeyboardInsetRef.current || getStoredOrEstimatedKeyboardHeight();
      if (initialHeight > 0 && keyboardInset !== initialHeight) {
        setKeyboardInset(initialHeight);
      }
    }
  } else if (!isOpen && prevIsOpen) {
    setPrevIsOpen(false);
  }

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('after_completion');
  const [intervalValue, setIntervalValue] = useState(3);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [useMonthDay, setUseMonthDay] = useState(false);
  const [monthDay, setMonthDay] = useState(1);
  const [endOnDate, setEndOnDate] = useState('');
  const [endAfterCount, setEndAfterCount] = useState('');

  const todayStr = formatDate(new Date());

  // Visual viewport tracking for mobile virtual keyboard
  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const isMobile = isMobileKeyboardDevice();

    const update = () => {
      const activeInset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      if (activeInset > 100) {
        lastActiveKeyboardInsetRef.current = activeInset;
        setKeyboardInset(activeInset);
        try {
          localStorage.setItem(KEYBOARD_HEIGHT_STORAGE_KEY, String(activeInset));
        } catch {
          // Ignore localStorage errors
        }
      } else if (!isMobile) {
        setKeyboardInset(0);
      } else {
        // Mobile virtual keyboard dismissed (e.g. non-text field clicked): remain above the keyboard
        const preservedHeight =
          lastActiveKeyboardInsetRef.current || getStoredOrEstimatedKeyboardHeight();
        setKeyboardInset(preservedHeight);
      }
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isOpen]);

  const resetForm = useCallback(() => {
    setTitle('');
    setNotes('');
    setDueAt(dueAtForSelectedDay(defaultDueAt, todayStr));
    setIsRecurring(false);
    setRecurrenceType('after_completion');
    setIntervalValue(3);
    setIntervalUnit('days');
    setWeekdays([]);
    setUseMonthDay(false);
    setMonthDay(1);
    setEndOnDate('');
    setEndAfterCount('');
    setPanel('none');
    titleRef.current?.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });
  }, [defaultDueAt, todayStr]);

  // Reset or populate state when opened or initialTask changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      setDueAt(initialTask.dueAt ? getDueDatePart(initialTask.dueAt) : null);
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
    } else {
      resetForm();
    }

    setPanel('none');
    setFullScreen(false);
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [isOpen, initialTask, resetForm]);

  if (!isOpen) return null;

  const canSubmit = title.trim().length > 0;
  const datePart = dueAt ? dueAt.slice(0, 10) : '';
  const dateChipLabel = !dueAt
    ? 'No date'
    : datePart === todayStr
      ? 'Today'
      : (() => {
          const tmrw = new Date();
          tmrw.setDate(tmrw.getDate() + 1);
          if (datePart === formatDate(tmrw)) return 'Tomorrow';
          const [y, m, d] = datePart.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        })();

  const currentRecurrenceRule: RecurrenceRule = {
    type: recurrenceType,
    intervalValue,
    intervalUnit,
    weekdays: intervalUnit === 'weeks' && weekdays.length > 0 ? weekdays : undefined,
    monthDay: intervalUnit === 'months' && useMonthDay ? monthDay : undefined,
  };

  const repeatChipLabel = !isRecurring
    ? 'Repeat'
    : formatRecurrenceLabel(currentRecurrenceRule);

  const toggleWeekday = (d: Weekday) => {
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let recurrence: RecurrenceRule | null = null;
      if (isRecurring) {
        const countNum = endAfterCount.trim() ? parseInt(endAfterCount, 10) : null;
        recurrence = {
          type: recurrenceType,
          intervalValue: Math.max(1, intervalValue),
          intervalUnit,
          weekdays: intervalUnit === 'weeks' && weekdays.length > 0 ? weekdays : undefined,
          monthDay: intervalUnit === 'months' && useMonthDay ? monthDay : undefined,
          endOnDate: endOnDate.trim() ? endOnDate.trim() : null,
          endAfterCount:
            countNum != null && !Number.isNaN(countNum) && countNum > 0 ? countNum : null,
        };
      }

      await onSave({
        id: initialTask?.id,
        title: title.trim(),
        notes: notes.trim() || undefined,
        listId: initialTask?.listId || INBOX_LIST_ID,
        dueAt: dueAt || null,
        recurrence,
      });

      if (initialTask) {
        onClose();
      } else {
        resetForm();
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const toolBtn = (
    label: string,
    active: boolean,
    onClick: () => void,
    child: React.ReactNode,
    extraClass = ''
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 min-w-10 px-2.5 flex items-center justify-center rounded-xl transition-colors text-sm font-semibold ${
        active
          ? 'text-tt-blue bg-tt-blue-soft dark:bg-tt-blue/20 dark:text-blue-300'
          : 'text-tt-secondary hover:text-tt-text hover:bg-tt-hover'
      } ${extraClass}`}
    >
      {child}
    </button>
  );

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[60] flex flex-col bg-tt-elevated overflow-y-auto'
    : 'relative w-full max-w-xl flex flex-col bg-tt-elevated rounded-2xl sm:rounded-3xl border border-tt-border/80 shadow-2xl overflow-y-auto';

  const dialogStyle: React.CSSProperties = fullScreen
    ? {}
    : {
        maxHeight: keyboardInset > 0
          ? `calc(100dvh - ${keyboardInset}px - max(24px, env(safe-area-inset-top)))`
          : 'calc(100dvh - max(24px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))',
      };

  return (
    <div
      className={
        fullScreen
          ? 'fixed inset-0 z-[60]'
          : 'fixed inset-0 z-[60] flex items-start justify-center p-3 sm:p-5 pt-[max(12px,env(safe-area-inset-top))] sm:pt-16'
      }
      data-testid="quick-add-sheet"
    >
      <button
        type="button"
        className="fixed inset-0 bg-black/40 backdrop-blur-[2px]"
        aria-label="Dismiss"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={initialTask ? 'Edit routine' : 'Add routine'}
        className={shellClass}
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >

        {fullScreen && (
          <div className="flex items-center h-14 px-3 border-b border-tt-border">
            <button
              type="button"
              onClick={() => setFullScreen(false)}
              aria-label="Exit full screen"
              className="w-10 h-10 flex items-center justify-center text-tt-secondary hover:text-tt-text"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="flex-1 text-[17px] font-bold text-tt-text">
              {initialTask ? 'Edit Routine' : 'New Routine'}
            </span>
            <button
              type="button"
              disabled={!canSubmit || isSubmitting}
              onClick={() => void handleSubmit()}
              className="px-3 py-1.5 text-[15px] font-semibold text-tt-blue disabled:opacity-40"
            >
              {initialTask ? 'Done' : 'Create'}
            </button>
          </div>
        )}

        {!fullScreen && (
          <div className="flex items-center justify-between px-4 sm:px-5 pt-1.5 pb-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-tt-secondary">
              {initialTask ? 'Edit Routine' : 'New Routine'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1 text-tt-secondary hover:text-tt-text rounded-md cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        <div className={`px-4 sm:px-5 ${fullScreen ? 'pt-4 flex-1' : 'pt-2'}`}>
          <input
            ref={titleRef}
            type="search"
            role="textbox"
            name="routine_title"
            id="routine_title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder={initialTask ? 'Routine title' : 'What would you like to do?'}
            aria-label="Routine title"
            className="w-full bg-transparent text-[20px] sm:text-[22px] font-semibold text-tt-text placeholder:text-tt-muted outline-none py-1.5 [&::-webkit-search-cancel-button]:hidden [&::-webkit-search-decoration]:hidden"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            placeholder="Description (optional)"
            aria-label="Description"
            rows={fullScreen ? 6 : 1}
            className="w-full bg-transparent text-[15px] sm:text-[16px] text-tt-text placeholder:text-tt-muted/70 outline-none resize-none py-1 leading-relaxed"
          />
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-1.5 px-3 pt-1 pb-2">
          {toolBtn(
            'Date',
            panel === 'date' || !!dueAt,
            () => setPanel((p) => (p === 'date' ? 'none' : 'date')),
            <span className="inline-flex items-center gap-1.5 px-1.5 text-[14px] sm:text-[15px] font-semibold">
              <Calendar className="w-4 h-4 stroke-[2.2]" />
              <span>{dateChipLabel}</span>
            </span>,
            'min-w-0'
          )}

          {toolBtn(
            'Repeat',
            panel === 'repeat' || isRecurring,
            () => setPanel((p) => (p === 'repeat' ? 'none' : 'repeat')),
            <span className="inline-flex items-center gap-1.5 px-1.5 text-[14px] sm:text-[15px] font-semibold truncate max-w-[200px]">
              <RefreshCw className="w-4 h-4 stroke-[2.2]" />
              <span className="truncate">{repeatChipLabel}</span>
            </span>,
            'min-w-0'
          )}

          {toolBtn(
            fullScreen ? 'Exit full screen' : 'Full screen',
            fullScreen,
            () => setFullScreen((prev) => !prev),
            fullScreen ? (
              <Minimize2 className="w-4 h-4" />
            ) : (
              <Maximize2 className="w-4 h-4" />
            )
          )}

          <div className="flex-1" />
          <button
            type="button"
            aria-label={initialTask ? 'Save routine' : 'Create routine'}
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[14px] sm:text-[15px] font-bold tracking-wide transition-all ${
              canSubmit && !isSubmitting
                ? 'bg-tt-blue hover:bg-tt-blue-hover active:scale-95 text-white shadow-md shadow-tt-blue/25 cursor-pointer'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            {initialTask ? (
              <Check className="w-4 h-4 stroke-[3]" />
            ) : (
              <Plus className="w-4 h-4 stroke-[3]" />
            )}
            <span>{initialTask ? 'Save' : 'Create'}</span>
          </button>
        </div>

        {/* Date Panel */}
        {panel === 'date' && (
          <div className="px-4 pb-3.5 flex flex-wrap items-center gap-2 border-t border-tt-border/80 pt-3 animate-in fade-in duration-150">
            {[
              ['Today', todayStr],
              [
                'Tomorrow',
                (() => {
                  const d = new Date();
                  d.setDate(d.getDate() + 1);
                  return formatDate(d);
                })(),
              ],
              ['No date', ''],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setDueAt(value || null);
                  setPanel('none');
                }}
                className={`px-3.5 py-1.5 rounded-xl text-xs sm:text-sm font-semibold transition-colors ${
                  (value ? dueAt === value : !dueAt)
                    ? 'bg-tt-blue text-white shadow-sm'
                    : 'bg-tt-sidebar text-tt-text hover:bg-tt-hover border border-tt-border'
                }`}
              >
                {label}
              </button>
            ))}
            <input
              type="date"
              aria-label="Pick a date"
              value={dueAt && /^\d{4}-\d{2}-\d{2}$/.test(dueAt) ? dueAt : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setDueAt(e.target.value);
                  setPanel('none');
                }
              }}
              className="px-3 py-1.5 rounded-xl bg-tt-sidebar text-xs sm:text-sm font-medium text-tt-text outline-none border border-tt-border"
            />
          </div>
        )}

        {/* Repeat Panel */}
        {panel === 'repeat' && (
          <div className="px-4 pb-4 space-y-3.5 border-t border-tt-border/80 pt-3.5 animate-in fade-in duration-150">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-tt-text flex items-center gap-1.5">
                <RefreshCw className="w-4 h-4 text-tt-blue" />
                Repeat routine
              </span>
              <button
                type="button"
                onClick={() => setIsRecurring((r) => !r)}
                className={`px-3 py-1 rounded-xl text-xs font-semibold border transition-colors ${
                  isRecurring
                    ? 'bg-tt-blue text-white border-tt-blue'
                    : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:text-tt-text'
                }`}
              >
                {isRecurring ? 'Enabled' : 'Disabled'}
              </button>
            </div>

            {isRecurring && (
              <div className="space-y-3 p-3.5 rounded-2xl bg-tt-sidebar/50 border border-tt-border">
                <div>
                  <label className="block text-xs font-semibold text-tt-secondary mb-1.5">
                    Recurrence Logic
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('after_completion')}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        recurrenceType === 'after_completion'
                          ? 'border-tt-blue bg-tt-blue-soft text-tt-blue font-semibold'
                          : 'border-tt-border bg-tt-sidebar text-tt-secondary hover:bg-tt-hover'
                      }`}
                    >
                      <div className="text-xs font-bold">After Completion</div>
                      <div className="text-[10px] opacity-75 mt-0.5">
                        Reschedules after done
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => setRecurrenceType('fixed_interval')}
                      className={`p-2 rounded-xl border text-left transition-all ${
                        recurrenceType === 'fixed_interval'
                          ? 'border-tt-blue bg-tt-blue-soft text-tt-blue font-semibold'
                          : 'border-tt-border bg-tt-sidebar text-tt-secondary hover:bg-tt-hover'
                      }`}
                    >
                      <div className="text-xs font-bold">Fixed Schedule</div>
                      <div className="text-[10px] opacity-75 mt-0.5">
                        Repeats on set days
                      </div>
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-semibold text-tt-secondary mb-1">
                      Repeat Every
                    </label>
                    <input
                      type="number"
                      min="1"
                      value={intervalValue}
                      onChange={(e) =>
                        setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))
                      }
                      className="w-full px-3 py-1.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-sm outline-none focus:border-tt-blue"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-tt-secondary mb-1">
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
                      className="w-full px-3 py-1.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-sm outline-none focus:border-tt-blue"
                    >
                      <option value="days">Days</option>
                      <option value="weeks">Weeks</option>
                      <option value="months">Months</option>
                    </select>
                  </div>
                </div>

                {intervalUnit === 'weeks' && (
                  <div>
                    <label className="block text-xs font-semibold text-tt-secondary mb-1.5">
                      On Weekdays (Optional)
                    </label>
                    <div className="flex gap-1">
                      {ALL_WEEKDAYS.map((d) => {
                        const sel = weekdays.includes(d);
                        return (
                          <button
                            key={d}
                            type="button"
                            onClick={() => toggleWeekday(d)}
                            className={`flex-1 py-1 rounded-lg text-xs font-bold border transition-colors ${
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
                        onChange={(e) =>
                          setMonthDay(
                            Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="w-16 px-2 py-1 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-xs outline-none focus:border-tt-blue"
                      />
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-tt-border/60">
                  <div>
                    <label className="block text-[11px] text-tt-muted mb-1">
                      End on Date (Optional)
                    </label>
                    <input
                      type="date"
                      value={endOnDate}
                      onChange={(e) => setEndOnDate(e.target.value)}
                      className="w-full px-2.5 py-1 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-xs outline-none focus:border-tt-blue"
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
                      className="w-full px-2.5 py-1 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-xs outline-none focus:border-tt-blue"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** Re-export alias for back-compatibility. */
export { QuickAddSheet as TaskModal };
