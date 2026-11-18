import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
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

/**
 * A description this long no longer fits comfortably in the one-line field,
 * so the create/edit dialog switches to the expanded layout.
 */
export const LONG_DESCRIPTION_MIN_LENGTH = 100;

/** True when notes contain a line break or are long enough to need the expanded dialog. */
export function descriptionExpandsDialog(notes: string): boolean {
  if (notes.includes('\n')) return true;
  return notes.trim().length >= LONG_DESCRIPTION_MIN_LENGTH;
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

  type EndMode = 'never' | 'on_date' | 'after_count';

  // Recurrence states
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('fixed_interval');
  const [intervalValue, setIntervalValue] = useState(1);
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [useMonthDay, setUseMonthDay] = useState(false);
  const [monthDay, setMonthDay] = useState(1);
  const [endMode, setEndMode] = useState<EndMode>('never');
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
      } else if (!isMobile || panel !== 'none') {
        // When configuring Date or Repeat panels without an active virtual keyboard, allow full window expansion
        setKeyboardInset(0);
      } else {
        // Mobile virtual keyboard dismissed on main form: remain above the keyboard
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
  }, [isOpen, panel]);

  // When opening a panel like Repeat or Date, dismiss any text-field keyboard focus so the window can expand fully
  useEffect(() => {
    if (panel !== 'none') {
      titleRef.current?.blur();
      const vv = typeof window !== 'undefined' ? window.visualViewport : null;
      const activeInset = vv
        ? Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)))
        : 0;
      if (activeInset <= 100) {
        setKeyboardInset(0);
      }
    }
  }, [panel]);

  const resetForm = useCallback(() => {
    setTitle('');
    setNotes('');
    setDueAt(dueAtForSelectedDay(defaultDueAt, todayStr));
    setIsRecurring(false);
    setRecurrenceType('fixed_interval');
    setIntervalValue(1);
    setIntervalUnit('days');
    setWeekdays([]);
    setUseMonthDay(false);
    setMonthDay(1);
    setEndMode('never');
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
        if (r.endOnDate) {
          setEndMode('on_date');
          setEndOnDate(r.endOnDate);
          setEndAfterCount('');
        } else if (r.endAfterCount != null && r.endAfterCount > 0) {
          setEndMode('after_count');
          setEndAfterCount(String(r.endAfterCount));
          setEndOnDate('');
        } else {
          setEndMode('never');
          setEndOnDate('');
          setEndAfterCount('');
        }
      } else {
        setRecurrenceType('fixed_interval');
        setIntervalValue(1);
        setIntervalUnit('days');
        setWeekdays([]);
        setUseMonthDay(false);
        setMonthDay(1);
        setEndMode('never');
        setEndOnDate('');
        setEndAfterCount('');
      }
    } else {
      resetForm();
    }

    setPanel('none');
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
        let parsedEndOnDate: string | null = null;
        let parsedEndAfterCount: number | null = null;

        if (endMode === 'on_date' && endOnDate.trim()) {
          parsedEndOnDate = endOnDate.trim();
        } else if (endMode === 'after_count' && endAfterCount.trim()) {
          const countNum = parseInt(endAfterCount, 10);
          if (!Number.isNaN(countNum) && countNum > 0) {
            parsedEndAfterCount = countNum;
          }
        }

        recurrence = {
          type: recurrenceType,
          intervalValue: Math.max(1, intervalValue),
          intervalUnit,
          weekdays: intervalUnit === 'weeks' && weekdays.length > 0 ? weekdays : undefined,
          monthDay: intervalUnit === 'months' && useMonthDay ? monthDay : undefined,
          endOnDate: parsedEndOnDate,
          endAfterCount: parsedEndAfterCount,
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
    extraClass = '',
    customStyles?: { active?: string; inactive?: string }
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`h-10 min-w-10 px-2.5 flex items-center justify-center rounded-xl transition-all text-sm font-semibold cursor-pointer ${
        active
          ? (customStyles?.active || 'text-tt-blue bg-tt-blue-soft dark:bg-tt-blue/20 dark:text-blue-300')
          : (customStyles?.inactive || 'text-tt-secondary hover:text-tt-text hover:bg-tt-hover')
      } ${extraClass}`}
    >
      {child}
    </button>
  );

  const expanded = descriptionExpandsDialog(notes);

  const shellClass = expanded
    ? 'fixed inset-0 z-[60] flex flex-col bg-tt-elevated overflow-y-auto'
    : 'relative w-full max-w-xl sm:max-w-2xl flex flex-col bg-tt-elevated rounded-2xl sm:rounded-3xl border border-tt-border/80 shadow-2xl overflow-y-auto';

  const dialogStyle: React.CSSProperties = expanded
    ? {}
    : {
        maxHeight: keyboardInset > 0
          ? `calc(100dvh - ${keyboardInset}px - max(24px, env(safe-area-inset-top)))`
          : 'calc(100dvh - max(16px, env(safe-area-inset-top)) - max(16px, env(safe-area-inset-bottom)))',
      };

  return (
    <div
      className={
        expanded
          ? 'fixed inset-0 z-[60]'
          : `fixed inset-0 z-[60] flex items-start justify-center p-2.5 sm:p-5 ${
              panel !== 'none'
                ? 'pt-[max(8px,env(safe-area-inset-top))] sm:pt-6'
                : 'pt-[max(12px,env(safe-area-inset-top))] sm:pt-14'
            }`
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

        {expanded && (
          <div className="flex items-center h-14 px-3 border-b border-tt-border">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
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

        {!expanded && (
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

        <div className={`px-4 sm:px-5 ${expanded ? 'pt-4 flex-1' : 'pt-2'}`}>
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
            rows={expanded ? 6 : 1}
            className="w-full bg-transparent text-[15px] sm:text-[16px] text-tt-text placeholder:text-tt-muted/70 outline-none resize-none py-1 leading-relaxed"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-2 flex-nowrap min-w-0">
          {toolBtn(
            'Date',
            panel === 'date' || !!dueAt,
            () => setPanel((p) => (p === 'date' ? 'none' : 'date')),
            <span className="inline-flex items-center gap-1.5 px-1 text-[14px] sm:text-[15px] font-semibold">
              <Calendar className="w-4 h-4 stroke-[2.2]" />
              <span>{dateChipLabel}</span>
            </span>,
            'shrink-0'
          )}

          {toolBtn(
            'Repeat',
            panel === 'repeat' || isRecurring,
            () => {
              if (panel === 'repeat') {
                setIsRecurring(false);
                setPanel('none');
              } else {
                titleRef.current?.blur();
                setKeyboardInset(0);
                setIsRecurring(true);
                setPanel('repeat');
              }
            },
            <span className="inline-flex items-center gap-1.5 px-1 text-[14px] sm:text-[15px] font-semibold">
              <RefreshCw className="w-4 h-4 stroke-[2.2]" />
              <span>Repeat</span>
            </span>,
            'shrink-0',
            {
              active: 'bg-tt-blue text-white border border-tt-blue shadow-sm shadow-tt-blue/25',
              inactive:
                'bg-white text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 shadow-xs',
            }
          )}

          <div className="flex-1 min-w-1" />
          <button
            type="button"
            aria-label={initialTask ? 'Save routine' : 'Create routine'}
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
            className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[14px] sm:text-[15px] font-bold tracking-wide transition-all ${
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
          <div className="px-4 pb-4 space-y-3.5 border-t border-tt-border/80 pt-3 animate-in fade-in duration-150">
            <div className="space-y-3.5 p-3.5 sm:p-4 rounded-2xl bg-tt-sidebar/60 border border-tt-border">
              {/* Repeat Every & Unit at the top */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="repeat-interval-input"
                    className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                  >
                    Repeat Every
                  </label>
                  <input
                    id="repeat-interval-input"
                    type="number"
                    min="1"
                    value={intervalValue}
                    onChange={(e) =>
                      setIntervalValue(Math.max(1, parseInt(e.target.value, 10) || 1))
                    }
                    className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors"
                  />
                </div>
                <div>
                  <label
                    htmlFor="repeat-unit-select"
                    className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                  >
                    Unit
                  </label>
                  <select
                    id="repeat-unit-select"
                    value={intervalUnit}
                    onChange={(e) => {
                      const u = e.target.value as IntervalUnit;
                      setIntervalUnit(u);
                      if (u !== 'weeks') setWeekdays([]);
                      if (u !== 'months') setUseMonthDay(false);
                    }}
                    className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                  >
                    <option value="days">Days</option>
                    <option value="weeks">Weeks</option>
                    <option value="months">Months</option>
                  </select>
                </div>
              </div>

              {/* Weekdays selection */}
              {intervalUnit === 'weeks' && (
                <div>
                  <label className="block text-base sm:text-[17px] font-bold text-tt-text mb-1.5">
                    On Weekdays (Optional)
                  </label>
                  <div className="grid grid-cols-7 gap-1.5">
                    {ALL_WEEKDAYS.map((d) => {
                      const sel = weekdays.includes(d);
                      return (
                        <button
                          key={d}
                          type="button"
                          aria-pressed={sel}
                          onClick={() => toggleWeekday(d)}
                          className={`h-10 sm:h-11 rounded-xl text-sm sm:text-base font-bold border transition-all flex items-center justify-center cursor-pointer ${
                            sel
                              ? 'bg-tt-blue text-white border-tt-blue shadow-sm shadow-tt-blue/25 ring-1 ring-tt-blue'
                              : 'bg-tt-elevated text-tt-text border-tt-border hover:bg-tt-hover active:scale-95'
                          }`}
                        >
                          {WEEKDAY_LABELS[d]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Month Day selection */}
              {intervalUnit === 'months' && (
                <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-tt-elevated border border-tt-border">
                  <label className="inline-flex items-center gap-2.5 text-base sm:text-[17px] font-semibold text-tt-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={useMonthDay}
                      onChange={(e) => setUseMonthDay(e.target.checked)}
                      className="w-5 h-5 rounded border-tt-border accent-tt-blue cursor-pointer"
                    />
                    On Day of Month
                  </label>
                  {useMonthDay && (
                    <div className="inline-flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={monthDay}
                        aria-label="Day of month"
                        onChange={(e) =>
                          setMonthDay(
                            Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1))
                          )
                        }
                        className="w-20 h-10 px-3 bg-tt-sidebar border border-tt-border rounded-xl text-tt-text text-base sm:text-lg font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                      />
                      <span className="text-sm sm:text-base text-tt-text/90 font-medium">
                        of each month
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Recurrence Logic Selection Box */}
              <div>
                <label
                  htmlFor="recurrence-logic-select"
                  className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                >
                  Recurrence Logic
                </label>
                <select
                  id="recurrence-logic-select"
                  value={recurrenceType}
                  onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}
                  className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                >
                  <option value="fixed_interval">
                    Fixed Schedule (repeats on set calendar days)
                  </option>
                  <option value="after_completion">
                    After Completion (reschedules after done)
                  </option>
                </select>
              </div>

              {/* Compact End Recurrence Selection */}
              <div className="pt-2 border-t border-tt-border/80">
                <label
                  htmlFor="end-mode-select"
                  className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                >
                  Ends
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                  <select
                    id="end-mode-select"
                    value={endMode}
                    onChange={(e) => {
                      const mode = e.target.value as EndMode;
                      setEndMode(mode);
                      if (mode === 'never') {
                        setEndOnDate('');
                        setEndAfterCount('');
                      }
                    }}
                    className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                  >
                    <option value="never">Never (repeats indefinitely)</option>
                    <option value="on_date">On specific date</option>
                    <option value="after_count">After number of occurrences</option>
                  </select>

                  {endMode === 'on_date' && (
                    <input
                      id="end-on-date-input"
                      type="date"
                      aria-label="End date"
                      value={endOnDate}
                      onChange={(e) => setEndOnDate(e.target.value)}
                      className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                    />
                  )}

                  {endMode === 'after_count' && (
                    <div className="flex items-center gap-2">
                      <input
                        id="end-after-count-input"
                        type="number"
                        min="1"
                        aria-label="Number of occurrences"
                        placeholder="e.g. 10"
                        value={endAfterCount}
                        onChange={(e) => setEndAfterCount(e.target.value)}
                        className="w-28 h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                      />
                      <span className="text-sm sm:text-base font-semibold text-tt-text/80">
                        occurrences
                      </span>
                    </div>
                  )}
                </div>
              </div>

              {/* Remove repeat action */}
              <div className="pt-2 flex justify-end border-t border-tt-border/60">
                <button
                  type="button"
                  onClick={() => {
                    setIsRecurring(false);
                    setPanel('none');
                  }}
                  className="text-xs sm:text-sm font-semibold text-tt-secondary hover:text-red-500 transition-colors cursor-pointer py-1 px-2"
                >
                  Remove repeat
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Re-export alias for back-compatibility. */
export { QuickAddSheet as TaskModal };
