import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
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
import { INBOX_LIST_ID } from '../types/task';
import {
  addDays,
  addInterval,
  completionTimestampForDate,
  formatDate,
  getDueDatePart,
  getLatestCompletionMs,
  getWindowBounds,
  isWindowPeriodic,
  parseDate,
} from '../domain/recurrence';
import { dueAtForSelectedDay } from '../domain/calendarUi';
import { DateChoiceMenu, type DatePreset } from './menu/DateChoiceMenu';
import { RepeatChoiceMenu } from './menu/RepeatChoiceMenu';
import { RepeatPanel, type EndMode } from './quickAdd/RepeatPanel';

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => void | Promise<void>;
  initialTask?: Task | null;
  /** Pre-filled due date (YYYY-MM-DD). Calendar passes selected day; Tasks passes null. */
  defaultDueAt?: string | null;
  onLogCompletionDate?: (taskId: string, dateStr: string) => Promise<void> | void;
  onRemoveCompletionTimestamp?: (taskId: string, timestamp: number) => Promise<void> | void;
}

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
 * Supports quick title/notes, a date choice menu, and repeat/recurrence rules.
 */
export function QuickAddSheet({
  isOpen,
  onClose,
  onSave,
  initialTask = null,
  defaultDueAt,
  onLogCompletionDate,
  onRemoveCompletionTimestamp,
}: QuickAddSheetProps) {
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const dateButtonRef = useRef<HTMLButtonElement>(null);
  const repeatButtonRef = useRef<HTMLButtonElement>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [panel, setPanel] = useState<'none' | 'repeat'>('none');
  const [dateMenuOpen, setDateMenuOpen] = useState(false);
  const [repeatMenuOpen, setRepeatMenuOpen] = useState(false);
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
    setDateMenuOpen(false);
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
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>('fixed_interval');
  const [intervalValue, setIntervalValue] = useState(1);
  const [maxIntervalValue, setMaxIntervalValue] = useState(2);
  const [minInput, setMinInput] = useState('1');
  const [maxInput, setMaxInput] = useState('2');
  const [intervalUnit, setIntervalUnit] = useState<IntervalUnit>('days');
  const [weekdays, setWeekdays] = useState<Weekday[]>([]);
  const [useMonthDay, setUseMonthDay] = useState(false);
  const [monthDay, setMonthDay] = useState(1);
  const [endMode, setEndMode] = useState<EndMode>('never');
  const [endOnDate, setEndOnDate] = useState('');
  const [endAfterCount, setEndAfterCount] = useState('');
  const [initialLastDoneDate, setInitialLastDoneDate] = useState<string | null>(null);
  const [localHistory, setLocalHistory] = useState<number[]>([]);

  const todayStr = formatDate(new Date());
  const tomorrowStr = formatDate(addDays(new Date(), 1));

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
        // When configuring the Repeat panel without an active virtual keyboard, allow full window expansion
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

  // When opening the Repeat panel, dismiss any text-field keyboard focus so the window can expand fully
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
    setDueAt(defaultDueAt === null ? null : dueAtForSelectedDay(defaultDueAt, todayStr));
    setIsRecurring(false);
    setRecurrenceType('fixed_interval');
    setIntervalValue(1);
    setMaxIntervalValue(2);
    setMinInput('1');
    setMaxInput('2');
    setIntervalUnit('days');
    setWeekdays([]);
    setUseMonthDay(false);
    setMonthDay(1);
    setEndMode('never');
    setEndOnDate('');
    setEndAfterCount('');
    setInitialLastDoneDate(null);
    setLocalHistory([]);
    setPanel('none');
    setDateMenuOpen(false);
    setRepeatMenuOpen(false);
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
      const hasRecurrence = !!initialTask.recurrence;
      const isApprox = isWindowPeriodic(initialTask);
      setIsRecurring(hasRecurrence);
      setLocalHistory([...(initialTask.completionHistory || [])]);
      setInitialLastDoneDate(null);

      if (initialTask.recurrence) {
        const r = initialTask.recurrence;
        if (isApprox) {
          const { min, max, unit } = getWindowBounds(r);
          setRecurrenceType('after_completion');
          setDueAt(null);
          setIntervalValue(min);
          setMaxIntervalValue(max);
          setMinInput(String(min));
          setMaxInput(String(max));
          setIntervalUnit(unit);
          setWeekdays([]);
          setUseMonthDay(false);
          setMonthDay(1);
          if (r.endOnDate) {
            setEndMode('on_date');
            setEndOnDate(r.endOnDate);
          } else {
            setEndMode('never');
            setEndOnDate('');
          }
          setEndAfterCount('');
        } else {
          setRecurrenceType('fixed_interval');
          setDueAt(initialTask.dueAt ? getDueDatePart(initialTask.dueAt) : null);
          setIntervalValue(r.intervalValue);
          setMaxIntervalValue(Math.max(r.intervalValue, r.intervalValue + 1));
          setMinInput(String(r.intervalValue));
          setMaxInput(String(Math.max(r.intervalValue, r.intervalValue + 1)));
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
        }
      } else {
        setDueAt(initialTask.dueAt ? getDueDatePart(initialTask.dueAt) : null);
        setRecurrenceType('fixed_interval');
        setIntervalValue(1);
        setMaxIntervalValue(2);
        setMinInput('1');
        setMaxInput('2');
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

    const openRepeatByDefault = !!initialTask?.recurrence;
    setPanel(openRepeatByDefault ? 'repeat' : 'none');
    setDateMenuOpen(false);
    setRepeatMenuOpen(false);
    if (openRepeatByDefault) {
      setKeyboardInset(0);
      return;
    }
    const t = window.setTimeout(() => titleRef.current?.focus({ preventScroll: true }), 60);
    return () => clearTimeout(t);
  }, [isOpen, initialTask, resetForm]);

  if (!isOpen) return null;

  const canSubmit = title.trim().length > 0;
  const isApproxMode = isRecurring && recurrenceType === 'after_completion';
  const latestHistoryMs = getLatestCompletionMs({ completionHistory: localHistory });
  const latestHistoryDateStr = latestHistoryMs != null ? formatDate(new Date(latestHistoryMs)) : null;

  const formatShortDate = (dStr: string) => {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const datePart = dueAt ? dueAt.slice(0, 10) : '';
  const datePreset: DatePreset = isApproxMode
    ? initialLastDoneDate === todayStr
      ? 'today'
      : initialLastDoneDate
        ? null
        : 'none'
    : !dueAt
      ? 'none'
      : datePart === todayStr
        ? 'today'
        : datePart === tomorrowStr
          ? 'tomorrow'
          : null;

  const dateChipLabel = isApproxMode
    ? initialTask?.id && latestHistoryDateStr
      ? `Last done: ${latestHistoryDateStr === todayStr ? 'Today' : formatShortDate(latestHistoryDateStr)}`
      : initialLastDoneDate
        ? `Last done: ${initialLastDoneDate === todayStr ? 'Today' : formatShortDate(initialLastDoneDate)}`
        : 'Not done yet'
    : !dueAt
      ? 'No date'
      : datePreset === 'today'
        ? 'Today'
        : datePreset === 'tomorrow'
          ? 'Tomorrow'
          : formatShortDate(datePart);

  const toggleWeekday = (d: Weekday) => {
    if (intervalUnit === 'days') {
      setIntervalUnit('weeks');
    }
    setWeekdays((prev) =>
      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
    );
  };

  const handleSelectFixed = () => {
    const wasApprox = isRecurring && recurrenceType === 'after_completion';
    setIsRecurring(true);
    setRecurrenceType('fixed_interval');
    setPanel('repeat');
    if (wasApprox || !dueAt) {
      const anchorStr = latestHistoryDateStr ?? initialLastDoneDate;
      if (anchorStr) {
        const nextStr = formatDate(addInterval(parseDate(anchorStr), intervalValue, intervalUnit));
        setDueAt(nextStr < todayStr ? todayStr : nextStr);
      } else {
        setDueAt(dueAtForSelectedDay(defaultDueAt, todayStr));
      }
    }
  };

  const handleSelectApproximate = () => {
    const wasOff = !isRecurring;
    setIsRecurring(true);
    setRecurrenceType('after_completion');
    setPanel('repeat');
    setDueAt(null);
    if (endMode === 'after_count') {
      setEndMode('never');
      setEndAfterCount('');
    }
    if (wasOff && dueAt == null && intervalValue === 1 && intervalUnit === 'days') {
      setIntervalValue(1);
      setMaxIntervalValue(2);
      setMinInput('1');
      setMaxInput('2');
      setIntervalUnit('weeks');
    } else {
      const clampedMax = Math.max(intervalValue, maxIntervalValue);
      setMaxIntervalValue(clampedMax);
      setMaxInput(String(clampedMax));
    }
  };

  const handleClearRepeat = () => {
    setIsRecurring(false);
    setPanel('none');
  };

  const handleSubmit = async () => {
    if (!canSubmit || isSubmitting) return;

    setIsSubmitting(true);
    try {
      let recurrence: RecurrenceRule | null = null;
      const safeMin = Math.min(999, Math.max(1, intervalValue));
      const safeMax = Math.min(999, Math.max(safeMin, maxIntervalValue));

      if (isRecurring) {
        let parsedEndOnDate: string | null = null;
        if (endMode === 'on_date' && endOnDate.trim()) {
          parsedEndOnDate = endOnDate.trim();
        }

        if (recurrenceType === 'after_completion') {
          recurrence = {
            type: 'after_completion',
            intervalValue: safeMin,
            maxIntervalValue: safeMax,
            intervalUnit,
            endOnDate: parsedEndOnDate,
          };
        } else {
          let parsedEndAfterCount: number | null = null;
          if (endMode === 'after_count' && endAfterCount.trim()) {
            const countNum = parseInt(endAfterCount, 10);
            if (!Number.isNaN(countNum) && countNum > 0) {
              parsedEndAfterCount = countNum;
            }
          }

          recurrence = {
            type: 'fixed_interval',
            intervalValue: safeMin,
            intervalUnit,
            weekdays: intervalUnit === 'weeks' && weekdays.length > 0 ? weekdays : undefined,
            monthDay: intervalUnit === 'months' && useMonthDay ? monthDay : undefined,
            endOnDate: parsedEndOnDate,
            endAfterCount: parsedEndAfterCount,
          };
        }
      }

      const seededHistory =
        recurrence?.type === 'after_completion' &&
        localHistory.length === 0 &&
        initialLastDoneDate
          ? [completionTimestampForDate(initialLastDoneDate)]
          : undefined;

      await onSave({
        id: initialTask?.id,
        title: title.trim(),
        notes: notes.trim() || undefined,
        listId: initialTask?.listId || INBOX_LIST_ID,
        dueAt: recurrence?.type === 'after_completion' ? null : dueAt || null,
        recurrence,
        ...(seededHistory ? { completionHistory: seededHistory } : {}),
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

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit();
    } else if (e.key === 'Enter') {
      e.preventDefault();
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
    customStyles?: { active?: string; inactive?: string },
    popup?: { expanded: boolean; controlsId: string; buttonRef: React.Ref<HTMLButtonElement> },
  ) => (
    <button
      ref={popup?.buttonRef}
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      aria-expanded={popup ? popup.expanded : undefined}
      aria-haspopup={popup ? 'menu' : undefined}
      aria-controls={popup ? popup.controlsId : undefined}
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
          <div
            className="tt-autogrow-field w-full py-1.5 text-[20px] sm:text-[22px] font-semibold leading-snug text-tt-text"
            data-replicated-value={title || (initialTask ? 'Routine title' : 'What would you like to do?')}
            style={{ '--tt-autogrow-min': '1lh', '--tt-autogrow-max': '8lh' } as React.CSSProperties}
          >
            <textarea
              ref={titleRef}
              name="routine_title"
              id="routine_title"
              rows={1}
              value={title}
              onChange={(e) => setTitle(e.target.value.replace(/[\r\n]+/g, ' '))}
              onKeyDown={onTitleKeyDown}
              enterKeyHint="done"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              placeholder={initialTask ? 'Routine title' : 'What would you like to do?'}
              aria-label="Routine title"
              className="w-full bg-transparent text-tt-text placeholder:text-tt-muted outline-none resize-none wrap-break-word"
            />
          </div>
          <div
            className="tt-autogrow-field w-full py-1 text-[15px] sm:text-[16px] leading-relaxed text-tt-text"
            data-replicated-value={notes || 'Description (optional)'}
            style={{ '--tt-autogrow-min': expanded ? '6lh' : '1lh' } as React.CSSProperties}
          >
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              placeholder="Description (optional)"
              aria-label="Description"
              rows={expanded ? 6 : 1}
              className="w-full bg-transparent text-tt-text placeholder:text-tt-muted/70 outline-none resize-none wrap-break-word"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-2 flex-nowrap min-w-0">
          {toolBtn(
            isApproxMode ? 'Last done' : 'Date',
            isApproxMode
              ? dateMenuOpen || !!initialLastDoneDate || localHistory.length > 0
              : dateMenuOpen || !!dueAt,
            () => {
              setRepeatMenuOpen(false);
              if (isApproxMode && initialTask?.id && localHistory.length > 0) {
                setDateMenuOpen(false);
                setPanel('repeat');
                window.requestAnimationFrame(() => {
                  historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                });
              } else {
                setDateMenuOpen((open) => !open);
              }
            },
            <span className="inline-flex items-center gap-1.5 px-1 text-[14px] sm:text-[15px] font-semibold">
              {isApproxMode ? (
                <Clock className="w-4 h-4 stroke-[2.2]" />
              ) : (
                <Calendar className="w-4 h-4 stroke-[2.2]" />
              )}
              <span>{dateChipLabel}</span>
            </span>,
            'shrink-0',
            undefined,
            isApproxMode && initialTask?.id && localHistory.length > 0
              ? undefined
              : { expanded: dateMenuOpen, controlsId: 'date-choice-menu', buttonRef: dateButtonRef },
          )}

          {toolBtn(
            'Repeat',
            panel === 'repeat' || isRecurring || repeatMenuOpen,
            () => {
              setDateMenuOpen(false);
              if (!isRecurring) {
                setRepeatMenuOpen((open) => !open);
              } else if (panel !== 'repeat') {
                titleRef.current?.blur();
                setKeyboardInset(0);
                setPanel('repeat');
              } else {
                setRepeatMenuOpen((open) => !open);
              }
            },
            <span className="inline-flex items-center gap-1.5 px-1 text-[14px] sm:text-[15px] font-semibold">
              <RefreshCw className="w-4 h-4 stroke-[2.2]" />
              <span>
                {!isRecurring ? 'Repeat' : recurrenceType === 'after_completion' ? 'Approx' : 'Fixed'}
              </span>
            </span>,
            'shrink-0',
            {
              active: 'bg-tt-blue text-white border border-tt-blue shadow-sm shadow-tt-blue/25',
              inactive:
                'bg-white text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500 border border-zinc-200 dark:border-zinc-700 hover:text-zinc-600 dark:hover:text-zinc-300 shadow-xs',
            },
            { expanded: repeatMenuOpen, controlsId: 'repeat-choice-menu', buttonRef: repeatButtonRef },
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

        {/* Repeat Panel */}
        {panel === 'repeat' && (
          <RepeatPanel
            recurrenceType={recurrenceType}
            intervalValue={intervalValue}
            setIntervalValue={setIntervalValue}
            maxIntervalValue={maxIntervalValue}
            setMaxIntervalValue={setMaxIntervalValue}
            minInput={minInput}
            setMinInput={setMinInput}
            maxInput={maxInput}
            setMaxInput={setMaxInput}
            intervalUnit={intervalUnit}
            setIntervalUnit={setIntervalUnit}
            weekdays={weekdays}
            toggleWeekday={toggleWeekday}
            useMonthDay={useMonthDay}
            setUseMonthDay={setUseMonthDay}
            monthDay={monthDay}
            setMonthDay={setMonthDay}
            setWeekdays={setWeekdays}
            endMode={endMode}
            setEndMode={setEndMode}
            endOnDate={endOnDate}
            setEndOnDate={setEndOnDate}
            endAfterCount={endAfterCount}
            setEndAfterCount={setEndAfterCount}
            initialTaskId={initialTask?.id}
            todayStr={todayStr}
            localHistory={localHistory}
            setLocalHistory={setLocalHistory}
            historySectionRef={historySectionRef}
            onLogCompletionDate={onLogCompletionDate}
            onRemoveCompletionTimestamp={onRemoveCompletionTimestamp}
          />
        )}
      </div>
      <DateChoiceMenu
        open={dateMenuOpen}
        anchorRef={dateButtonRef}
        active={datePreset}
        mode={isApproxMode ? 'last_done' : 'due'}
        allowNoDate={!isRecurring}
        maxDate={isApproxMode ? todayStr : undefined}
        dateValue={isApproxMode ? (initialLastDoneDate ?? '') : datePart}
        onClose={() => setDateMenuOpen(false)}
        onToday={() => {
          if (isApproxMode) setInitialLastDoneDate(todayStr);
          else setDueAt(todayStr);
        }}
        onTomorrow={isApproxMode ? undefined : () => setDueAt(tomorrowStr)}
        onNoDate={() => {
          if (isApproxMode) setInitialLastDoneDate(null);
          else setDueAt(null);
        }}
        onDatePicked={(val) => {
          if (isApproxMode) setInitialLastDoneDate(val);
          else setDueAt(val);
        }}
      />
      <RepeatChoiceMenu
        open={repeatMenuOpen}
        anchorRef={repeatButtonRef}
        active={isRecurring ? recurrenceType : null}
        onClose={() => setRepeatMenuOpen(false)}
        onSelectFixed={handleSelectFixed}
        onSelectApproximate={handleSelectApproximate}
        onClearRepeat={handleClearRepeat}
      />
    </div>
  );
}
