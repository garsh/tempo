import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Clock,
  Plus,
  RefreshCw,
  Trash2,
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
import {
  addDays,
  addInterval,
  combineDueAt,
  completionTimestampForDate,
  daysInAnnualMonth,
  formatDate,
  getDueDatePart,
  getLatestCompletionMs,
  getWindowBounds,
  hasDueTime,
  isAnnualWindow,
  isWindowPeriodic,
  parseDate,
  sanitizeAnnualWindow,
  splitDueAt,
} from '../domain/recurrence';
import { dueAtForSelectedDay } from '../domain/calendarUi';
import { useTodayKey } from '../hooks/useTodayKey';
import { DateChoiceMenu, type DatePreset } from './menu/DateChoiceMenu';
import { RepeatChoiceMenu } from './menu/RepeatChoiceMenu';
import { RepeatPanel, type EndMode } from './quickAdd/RepeatPanel';

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (task: TaskInput) => boolean | void | Promise<boolean | void>;
  initialTask?: Task | null;
  /** Pre-filled due date (YYYY-MM-DD). Calendar passes selected day; Tasks passes null. */
  defaultDueAt?: string | null;
  /** Modal sheet on mobile/split vs docked right-hand inspector drawer on desktop. */
  presentation?: 'sheet' | 'drawer';
  /** Float over the rightmost column at 1280–1679px, switching to inline on ultrawide. */
  overlayDrawer?: boolean;
  onRequestDelete?: (task: Task) => void;
  onLogCompletionDate?: (taskId: string, dateStr: string) => Promise<void> | void;
  onRemoveCompletionTimestamp?: (taskId: string, timestamp: number) => Promise<void> | void;
  onUnskipOccurrence?: (taskId: string, dateStr: string) => Promise<void> | void;
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
  presentation = 'sheet',
  overlayDrawer = false,
  onRequestDelete,
  onLogCompletionDate,
  onRemoveCompletionTimestamp,
  onUnskipOccurrence,
}: QuickAddSheetProps) {
  const isEditMode = Boolean(initialTask?.id);
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
  const [keyboardInset, setKeyboardInset] = useState(0);

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
  const defaultAnnualMonth = new Date().getMonth() + 1;
  const [annualStartMonth, setAnnualStartMonth] = useState(defaultAnnualMonth);
  const [annualStartDay, setAnnualStartDay] = useState(1);
  const [annualEndMonth, setAnnualEndMonth] = useState(defaultAnnualMonth);
  const [annualEndDay, setAnnualEndDay] = useState(() => daysInAnnualMonth(defaultAnnualMonth));
  const [endMode, setEndMode] = useState<EndMode>('never');
  const [endOnDate, setEndOnDate] = useState('');
  const [endAfterCount, setEndAfterCount] = useState('');
  const [initialLastDoneDate, setInitialLastDoneDate] = useState<string | null>(null);
  const [firstOpenDate, setFirstOpenDate] = useState<string | null>(null);
  const [alreadyDoneMenu, setAlreadyDoneMenu] = useState(false);
  const [localHistory, setLocalHistory] = useState<number[]>([]);
  const [localSkippedDates, setLocalSkippedDates] = useState<string[]>([]);

  const todayStr = useTodayKey();
  const tomorrowStr = useMemo(() => formatDate(addDays(parseDate(todayStr), 1)), [todayStr]);

  // Visual viewport tracking for virtual keyboard
  useEffect(() => {
    if (!isOpen) {
      setKeyboardInset(0);
      return;
    }
    if (typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const activeInset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      setKeyboardInset(activeInset > 100 ? activeInset : 0);
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isOpen]);

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

  const defaultDueAtRef = useRef(defaultDueAt);
  defaultDueAtRef.current = defaultDueAt;

  const resetForm = useCallback(() => {
    const currentTodayStr = formatDate(new Date());
    const currentDefaultDueAt = defaultDueAtRef.current;
    setTitle('');
    setNotes('');
    setDueAt(
      currentDefaultDueAt === null
        ? null
        : dueAtForSelectedDay(currentDefaultDueAt, currentTodayStr)
    );
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
    const curMonth = new Date().getMonth() + 1;
    setAnnualStartMonth(curMonth);
    setAnnualStartDay(1);
    setAnnualEndMonth(curMonth);
    setAnnualEndDay(daysInAnnualMonth(curMonth));
    setEndMode('never');
    setEndOnDate('');
    setEndAfterCount('');
    setInitialLastDoneDate(null);
    setFirstOpenDate(null);
    setAlreadyDoneMenu(false);
    setLocalHistory([]);
    setLocalSkippedDates([]);
    setPanel('none');
    setDateMenuOpen(false);
    setRepeatMenuOpen(false);
    titleRef.current?.focus({ preventScroll: true });
    window.requestAnimationFrame(() => {
      titleRef.current?.focus({ preventScroll: true });
    });
  }, []);

  // Reset or populate state when opened or initialTask changes
  useEffect(() => {
    if (!isOpen) return;

    if (initialTask) {
      setTitle(initialTask.title);
      setNotes(initialTask.notes || '');
      const hasRecurrence = !!initialTask.recurrence;
      const isAnnual = isAnnualWindow(initialTask);
      const isApprox = !isAnnual && isWindowPeriodic(initialTask);
      setIsRecurring(hasRecurrence);
      setLocalHistory([...(initialTask.completionHistory || [])]);
      setLocalSkippedDates([...(initialTask.skippedDates || [])]);
      setInitialLastDoneDate(null);
      setFirstOpenDate(initialTask.firstOpenDate ?? null);
      setAlreadyDoneMenu(false);

      if (initialTask.recurrence) {
        const r = initialTask.recurrence;
        if (isAnnual) {
          const firstWin = sanitizeAnnualWindow(r.annualWindows![0]);
          setRecurrenceType('annual_window');
          setDueAt(null);
          setAnnualStartMonth(firstWin.startMonth);
          setAnnualStartDay(firstWin.startDay);
          setAnnualEndMonth(firstWin.endMonth);
          setAnnualEndDay(firstWin.endDay);
          setIntervalValue(1);
          setMaxIntervalValue(2);
          setMinInput('1');
          setMaxInput('2');
          setIntervalUnit('years');
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
        } else if (isApprox) {
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
        setDueAt(
          initialTask.dueAt
            ? getDueDatePart(initialTask.dueAt)
            : !initialTask.id && initialTask.dueAt === undefined
              ? defaultDueAtRef.current === null
                ? null
                : dueAtForSelectedDay(defaultDueAtRef.current, formatDate(new Date()))
              : null
        );
        setRecurrenceType('fixed_interval');
        setIntervalValue(1);
        setMaxIntervalValue(2);
        setMinInput('1');
        setMaxInput('2');
        setIntervalUnit('days');
        setWeekdays([]);
        setUseMonthDay(false);
        setMonthDay(1);
        const curMonth = new Date().getMonth() + 1;
        setAnnualStartMonth(curMonth);
        setAnnualStartDay(1);
        setAnnualEndMonth(curMonth);
        setAnnualEndDay(daysInAnnualMonth(curMonth));
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
  const isApprox = isRecurring && recurrenceType === 'after_completion';
  const isWindowMode = isApprox || (isRecurring && recurrenceType === 'annual_window');
  const latestHistoryMs = getLatestCompletionMs({ completionHistory: localHistory });
  const latestHistoryDateStr = latestHistoryMs != null ? formatDate(new Date(latestHistoryMs)) : null;
  const approxHasCompletion = isApprox && (localHistory.length > 0 || !!initialLastDoneDate);

  const formatShortDate = (dStr: string) => {
    const [y, m, d] = dStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatStartChip = (dStr: string) => {
    if (dStr === todayStr) return 'Today';
    if (dStr === tomorrowStr) return 'Tomorrow';
    const [y, m, d] = dStr.split('-').map(Number);
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
    if (y !== Number(todayStr.slice(0, 4))) opts.year = 'numeric';
    return new Date(y, m - 1, d).toLocaleDateString(undefined, opts);
  };

  const datePart = dueAt ? dueAt.slice(0, 10) : '';
  const choosingFirstOpen = isApprox && localHistory.length === 0 && !initialLastDoneDate && !alreadyDoneMenu;
  const datePreset: DatePreset = choosingFirstOpen
    ? !firstOpenDate
      ? 'none'
      : firstOpenDate === todayStr
        ? 'today'
        : firstOpenDate === tomorrowStr
          ? 'tomorrow'
          : null
    : isWindowMode
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

  const dateChipLabel = isWindowMode
    ? initialTask?.id && latestHistoryDateStr
      ? `Last done: ${latestHistoryDateStr === todayStr ? 'Today' : formatShortDate(latestHistoryDateStr)}`
      : initialLastDoneDate
        ? `Last done: ${initialLastDoneDate === todayStr ? 'Today' : formatShortDate(initialLastDoneDate)}`
        : isApprox && firstOpenDate
          ? `Starts ${formatStartChip(firstOpenDate)}`
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
    const wasWindow = wasApprox || (isRecurring && recurrenceType === 'annual_window');
    setIsRecurring(true);
    setRecurrenceType('fixed_interval');
    setPanel('repeat');
    if (wasWindow || !dueAt) {
      const anchorStr = latestHistoryDateStr ?? initialLastDoneDate;
      if (anchorStr) {
        const nextStr = formatDate(addInterval(parseDate(anchorStr), intervalValue, intervalUnit));
        setDueAt(nextStr < todayStr ? todayStr : nextStr);
      } else if (wasApprox && firstOpenDate) {
        setDueAt(firstOpenDate);
      } else {
        setDueAt(dueAtForSelectedDay(defaultDueAt, todayStr));
      }
    }
  };

  const handleSelectApproximate = () => {
    const wasOff = !isRecurring;
    const entering = wasOff || recurrenceType !== 'after_completion';
    setIsRecurring(true);
    setRecurrenceType('after_completion');
    setPanel('repeat');
    setDueAt(null);
    if (endMode === 'after_count') {
      setEndMode('never');
      setEndAfterCount('');
    }
    if (entering && localHistory.length === 0 && !initialLastDoneDate) {
      setFirstOpenDate((current) => current ?? todayStr);
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

  const handleSelectAnnualWindow = () => {
    setIsRecurring(true);
    setRecurrenceType('annual_window');
    setPanel('repeat');
    setDueAt(null);
    if (endMode === 'after_count') {
      setEndMode('never');
      setEndAfterCount('');
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

        if (recurrenceType === 'annual_window') {
          recurrence = {
            type: 'annual_window',
            intervalValue: 1,
            intervalUnit: 'years',
            annualWindows: [
              sanitizeAnnualWindow({
                startMonth: annualStartMonth,
                startDay: annualStartDay,
                endMonth: annualEndMonth,
                endDay: annualEndDay,
              }),
            ],
            endOnDate: parsedEndOnDate,
          };
        } else if (recurrenceType === 'after_completion') {
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
        (recurrence?.type === 'after_completion' || recurrence?.type === 'annual_window') &&
        localHistory.length === 0 &&
        initialLastDoneDate
          ? [completionTimestampForDate(initialLastDoneDate)]
          : undefined;

      const existingTime =
        initialTask?.dueAt && hasDueTime(initialTask.dueAt)
          ? splitDueAt(initialTask.dueAt).time
          : null;
      const submittedDueAt =
        recurrence?.type === 'after_completion' || recurrence?.type === 'annual_window'
          ? null
          : dueAt
            ? combineDueAt(dueAt, existingTime)
            : null;

      const saved = await onSave({
        id: initialTask?.id,
        title: title.trim(),
        notes: notes.trim() || undefined,
        dueAt: submittedDueAt,
        recurrence,
        ...(recurrence?.type === 'after_completion'
          ? { firstOpenDate }
          : initialTask?.firstOpenDate != null
            ? { firstOpenDate: null }
            : {}),
        ...(seededHistory ? { completionHistory: seededHistory } : {}),
      });

      if (saved === false) {
        return;
      }

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
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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

  const onNotesKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void handleSubmit();
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

  const dateMenuMode = choosingFirstOpen ? 'first_open' : isWindowMode ? 'last_done' : 'due';
  const choosingStart = isApprox && !approxHasCompletion;
  const dateChipControl = toolBtn(
    choosingStart ? 'Starts' : isWindowMode ? 'Last done' : 'Date',
    choosingStart
      ? dateMenuOpen || !!firstOpenDate
      : isWindowMode
        ? dateMenuOpen || !!initialLastDoneDate || localHistory.length > 0
        : dateMenuOpen || !!dueAt,
    () => {
      setRepeatMenuOpen(false);
      if (isWindowMode && initialTask?.id && localHistory.length > 0) {
        setDateMenuOpen(false);
        setPanel('repeat');
        window.requestAnimationFrame(() => {
          historySectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      } else {
        setAlreadyDoneMenu(!!initialLastDoneDate);
        setDateMenuOpen((open) => !open);
      }
    },
    <span className="inline-flex items-center gap-1.5 px-1 text-[14px] sm:text-[15px] font-semibold">
      {choosingStart || !isWindowMode ? (
        <Calendar className="w-4 h-4 stroke-[2.2]" />
      ) : (
        <Clock className="w-4 h-4 stroke-[2.2]" />
      )}
      <span>{dateChipLabel}</span>
    </span>,
    'shrink-0',
    undefined,
    isWindowMode && initialTask?.id && localHistory.length > 0
      ? undefined
      : { expanded: dateMenuOpen, controlsId: 'date-choice-menu', buttonRef: dateButtonRef },
  );

  const repeatChipControl = toolBtn(
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
        {!isRecurring
          ? 'Repeat'
          : recurrenceType === 'after_completion'
            ? 'Approx'
            : recurrenceType === 'annual_window'
              ? 'Yearly'
              : 'Fixed'}
      </span>
    </span>,
    'shrink-0',
    {
      active: 'bg-tt-blue text-white border border-tt-blue shadow-sm shadow-tt-blue/25',
      inactive:
        'bg-tt-surface text-tt-secondary border border-tt-border hover:text-tt-text shadow-xs',
    },
    { expanded: repeatMenuOpen, controlsId: 'repeat-choice-menu', buttonRef: repeatButtonRef },
  );

  const repeatPanelEl = panel === 'repeat' && (
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
      annualStartMonth={annualStartMonth}
      setAnnualStartMonth={setAnnualStartMonth}
      annualStartDay={annualStartDay}
      setAnnualStartDay={setAnnualStartDay}
      annualEndMonth={annualEndMonth}
      setAnnualEndMonth={setAnnualEndMonth}
      annualEndDay={annualEndDay}
      setAnnualEndDay={setAnnualEndDay}
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
      localSkippedDates={localSkippedDates}
      setLocalSkippedDates={setLocalSkippedDates}
      onUnskipOccurrence={onUnskipOccurrence}
    />
  );

  const choiceMenusEl = (
    <>
      <DateChoiceMenu
        open={dateMenuOpen}
        anchorRef={dateButtonRef}
        active={datePreset}
        mode={dateMenuMode}
        allowNoDate={!isRecurring}
        maxDate={dateMenuMode === 'last_done' ? todayStr : undefined}
        dateValue={
          dateMenuMode === 'first_open' ? (firstOpenDate ?? '') : isWindowMode ? (initialLastDoneDate ?? '') : datePart
        }
        onClose={() => {
          setDateMenuOpen(false);
          setAlreadyDoneMenu(false);
        }}
        onToday={() => {
          if (dateMenuMode === 'first_open') {
            setFirstOpenDate(todayStr);
            setInitialLastDoneDate(null);
          } else if (isWindowMode) setInitialLastDoneDate(todayStr);
          else setDueAt(todayStr);
        }}
        onTomorrow={
          dateMenuMode === 'first_open'
            ? () => {
                setFirstOpenDate(tomorrowStr);
                setInitialLastDoneDate(null);
              }
            : isWindowMode
              ? undefined
              : () => setDueAt(tomorrowStr)
        }
        onNoDate={() => {
          if (dateMenuMode === 'first_open') {
            setFirstOpenDate(null);
            setInitialLastDoneDate(null);
          } else if (isWindowMode) setInitialLastDoneDate(null);
          else setDueAt(null);
        }}
        onAlreadyDone={() => setAlreadyDoneMenu(true)}
        onDatePicked={(val) => {
          if (dateMenuMode === 'first_open') {
            setFirstOpenDate(val);
            setInitialLastDoneDate(null);
          } else if (isWindowMode) setInitialLastDoneDate(val);
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
        onSelectAnnualWindow={handleSelectAnnualWindow}
        onClearRepeat={handleClearRepeat}
      />
    </>
  );

  if (presentation === 'drawer') {
    return (
      <>
        <aside
          data-testid="quick-add-sheet"
          data-presentation="drawer"
          role="dialog"
          aria-label={isEditMode ? 'Edit routine' : 'Add routine'}
          className={`${
            overlayDrawer
              ? 'absolute inset-y-0 right-0 z-40 shadow-[-8px_0_28px_var(--tt-shadow)] min-[1680px]:static min-[1680px]:shadow-none'
              : 'relative z-20 shrink-0'
          } w-[380px] xl:w-[420px] max-w-[calc(100%-24px)] h-full bg-tt-elevated border-l border-tt-border flex flex-col overflow-hidden`}
        >
          <div className="shrink-0 h-14 px-5 border-b border-tt-border flex items-center justify-between gap-2">
            <span className="text-[14px] font-bold uppercase tracking-wider text-tt-secondary">
              {isEditMode ? 'Edit Routine' : 'New Routine'}
            </span>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              title="Close (Esc)"
              className="w-8 h-8 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto tt-scroll-stable">
            <div className="px-5 pt-4">
              <div
                className="tt-autogrow-field w-full py-1.5 text-[20px] font-semibold leading-snug text-tt-text"
                data-replicated-value={title || (isEditMode ? 'Routine title' : 'What would you like to do?')}
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
                  placeholder={isEditMode ? 'Routine title' : 'What would you like to do?'}
                  aria-label="Routine title"
                  className="w-full bg-transparent text-tt-text placeholder:text-tt-muted outline-none resize-none wrap-break-word"
                />
              </div>
              <div
                className="tt-autogrow-field w-full py-1.5 text-[15px] leading-relaxed text-tt-text"
                data-replicated-value={notes || 'Description (optional)'}
                style={{ '--tt-autogrow-min': '4lh' } as React.CSSProperties}
              >
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onKeyDown={onNotesKeyDown}
                  autoComplete="off"
                  placeholder="Description (optional)"
                  aria-label="Description"
                  rows={4}
                  className="w-full bg-transparent text-tt-text placeholder:text-tt-muted/70 outline-none resize-none wrap-break-word"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 px-4 pt-2 pb-3 flex-wrap">
              {dateChipControl}
              {repeatChipControl}
            </div>

            {repeatPanelEl}
          </div>

          <div className="shrink-0 px-5 py-3 border-t border-tt-border bg-tt-elevated flex items-center justify-between gap-2">
            {isEditMode && initialTask && onRequestDelete ? (
              <button
                type="button"
                onClick={() => onRequestDelete(initialTask)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-tt-overdue hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete</span>
              </button>
            ) : (
              <span className="text-[12px] text-tt-muted">Ctrl+Enter to save</span>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 rounded-xl text-[14px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                aria-label={isEditMode ? 'Save routine' : 'Create routine'}
                disabled={!canSubmit || isSubmitting}
                onClick={() => void handleSubmit()}
                className={`inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[14px] font-bold tracking-wide transition-all ${
                  canSubmit && !isSubmitting
                    ? 'bg-tt-blue hover:bg-tt-blue-hover active:scale-95 text-white shadow-sm shadow-tt-blue/25 cursor-pointer'
                    : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
                }`}
              >
                {isEditMode ? (
                  <Check className="w-4 h-4 stroke-[3]" />
                ) : (
                  <Plus className="w-4 h-4 stroke-[3]" />
                )}
                <span>{isEditMode ? 'Save' : 'Create'}</span>
              </button>
            </div>
          </div>
        </aside>
        {choiceMenusEl}
      </>
    );
  }

  const expanded = descriptionExpandsDialog(notes);

  const shellClass = expanded
    ? 'fixed inset-0 z-[60] flex flex-col bg-tt-elevated overflow-y-auto pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
    : 'relative w-full max-w-xl sm:max-w-2xl flex flex-col bg-tt-elevated rounded-2xl sm:rounded-3xl border border-tt-border/80 shadow-2xl overflow-y-auto';

  const dialogStyle: React.CSSProperties | undefined = expanded
    ? undefined
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
          : `fixed inset-0 z-[60] flex items-start justify-center p-2.5 sm:p-5 compact-landscape:p-2 ${
              panel !== 'none'
                ? 'pt-[max(8px,env(safe-area-inset-top))] sm:pt-6 compact-landscape:pt-2'
                : 'pt-[max(12px,env(safe-area-inset-top))] sm:pt-14 compact-landscape:pt-2'
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
        aria-label={isEditMode ? 'Edit routine' : 'Add routine'}
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
              className="w-10 h-10 flex items-center justify-center text-tt-secondary hover:text-tt-text cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="flex-1 text-[17px] font-bold text-tt-text">
              {isEditMode ? 'Edit Routine' : 'New Routine'}
            </span>
            {isEditMode && initialTask && onRequestDelete && (
              <button
                type="button"
                onClick={() => onRequestDelete(initialTask)}
                aria-label="Delete routine"
                className="w-10 h-10 flex items-center justify-center rounded-lg text-tt-overdue hover:bg-red-500/10 transition-colors cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        )}

        {!expanded && (
          <div className="flex items-center justify-between px-4 sm:px-5 pt-1.5 pb-0.5">
            <span className="text-xs font-bold uppercase tracking-wider text-tt-secondary">
              {isEditMode ? 'Edit Routine' : 'New Routine'}
            </span>
            <div className="flex items-center gap-0.5">
              {isEditMode && initialTask && onRequestDelete && (
                <button
                  type="button"
                  onClick={() => onRequestDelete(initialTask)}
                  aria-label="Delete routine"
                  className="w-9 h-9 flex items-center justify-center text-tt-overdue hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="w-9 h-9 -mr-1.5 flex items-center justify-center text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        <div className={`px-4 sm:px-5 ${expanded ? 'pt-4 flex-1' : 'pt-2'}`}>
          <div
            className="tt-autogrow-field w-full py-1.5 text-[20px] sm:text-[22px] font-semibold leading-snug text-tt-text"
            data-replicated-value={title || (isEditMode ? 'Routine title' : 'What would you like to do?')}
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
              placeholder={isEditMode ? 'Routine title' : 'What would you like to do?'}
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
              onKeyDown={onNotesKeyDown}
              autoComplete="off"
              placeholder="Description (optional)"
              aria-label="Description"
              rows={expanded ? 6 : 1}
              className="w-full bg-transparent text-tt-text placeholder:text-tt-muted/70 outline-none resize-none wrap-break-word"
            />
          </div>
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1.5 px-3 pt-1 pb-2 flex-nowrap min-w-0">
          {dateChipControl}
          {repeatChipControl}

          <div className="flex-1 min-w-1" />
          <button
            type="button"
            aria-label={isEditMode ? 'Save routine' : 'Create routine'}
            disabled={!canSubmit || isSubmitting}
            onClick={() => void handleSubmit()}
            className={`shrink-0 inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-[14px] sm:text-[15px] font-bold tracking-wide transition-all ${
              canSubmit && !isSubmitting
                ? 'bg-tt-blue hover:bg-tt-blue-hover active:scale-95 text-white shadow-md shadow-tt-blue/25 cursor-pointer'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed'
            }`}
          >
            {isEditMode ? (
              <Check className="w-4 h-4 stroke-[3]" />
            ) : (
              <Plus className="w-4 h-4 stroke-[3]" />
            )}
            <span>{isEditMode ? 'Save' : 'Create'}</span>
          </button>
        </div>

        {/* Repeat Panel */}
        {repeatPanelEl}
      </div>
      {choiceMenusEl}
    </div>
  );
}
