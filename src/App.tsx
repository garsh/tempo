import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  initDatabase,
  logTaskCompletion,
  moveRecurringOccurrenceOnly,
  moveRecurringSeries,
  removeTaskCompletion,
  reorderTasks,
  restoreTaskSnapshot,
  saveTask,
  setTaskEndOnDate,
  skipTaskOccurrence,
  softDeleteTask,
  stopRecurringTask,
  uncompleteTask,
  undoCompleteUndatedTask,
} from './db/db';
import type { Task, TaskInput } from './types/task';
import {
  addDays,
  formatDate,
  getDueDatePart,
  getNextUncompletedOccurrenceDate,
  getWindowProgress,
  isCompleted,
  isFixedRecurring,
  isUndatedOneTime,
  isWindowPeriodic,
  projectTaskForDate,
  type WindowProgress,
} from './domain/recurrence';
import { recurrenceRulesEqual } from './domain/moveRecurring';
import {
  sortTasksForDailyView,
  sortUndatedOneTimeTasks,
  sortWindowTasks,
} from './domain/sorting';
import { usePrefs } from './prefs/prefs';
import { completedTasksOnDate, shiftMonth, tasksDueOnDate } from './domain/calendar';
import {
  calendarHeaderTitle,
  defaultDateForMonth,
  jumpToToday,
  readStoredActiveView,
  readStoredCalendarExpanded,
  saveStoredActiveView,
  saveStoredCalendarExpanded,
  shiftWeek,
  stepCalendarView,
  type ActiveMainView,
  type CalendarSwipeEvent,
} from './domain/calendarUi';
import { initDiagnostics, recordDiagEvent } from './domain/diagnostics';
import { shareTextFromParts, takeSharedText } from './pwa/shareText';
import { useAutoSync } from './hooks/useAutoSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useCalendarPullGesture } from './hooks/useCalendarPullGesture';
import { useLayoutMode } from './hooks/useLayoutMode';
import { useUndoToast } from './hooks/useUndoToast';
import { TaskCard } from './components/TaskCard';
import { ReorderableTaskList } from './components/ReorderableTaskList';
import { QuickAddSheet } from './components/QuickAddSheet';
import { SettingsPage, type SettingsPageId } from './components/settings/SettingsPage';
import {
  CalendarMonthView,
  type CalendarMonthHandle,
} from './components/CalendarMonthView';
import {
  SwipeableMonthTitle,
  type SwipeableMonthTitleHandle,
} from './components/calendar/SwipeableMonthTitle';
import { TodayCalendarIcon } from './components/calendar/TodayCalendarIcon';
import { MonthYearPickerDialog } from './components/calendar/MonthYearPickerDialog';
import {
  ChangeDatePicker,
  type ChangeDatePickerHandle,
} from './components/dialogs/ChangeDatePicker';
import { SkipOccurrenceDialog } from './components/dialogs/SkipOccurrenceDialog';
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog';
import { MoveRecurringDialog } from './components/dialogs/MoveRecurringDialog';
import { ShortcutsHelpDialog } from './components/dialogs/ShortcutsHelpDialog';
import { InstallPrompt } from './components/InstallPrompt';
import { UndoToast } from './components/ui/UndoToast';
import { TaskGroupHeader } from './components/shell/TaskGroupHeader';
import { DesktopSidebar } from './components/shell/DesktopSidebar';
import { OverflowMenu } from './components/menu/OverflowMenu';
import { TaskSearchView } from './components/search/TaskSearchView';
import { TasksView } from './components/TasksView';
import { RecurringTasksView } from './components/RecurringTasksView';
import { triggerAppUpdate } from './components/PwaUpdatePrompt';
import {
  ArrowUpRight,
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MoreVertical,
  Plus,
  RefreshCw,
  Search,
} from 'lucide-react';

const EMPTY_TASKS: Task[] = [];

interface PendingRecurringMove {
  source: 'sheet' | 'picker';
  rawTask: Task;
  fromDate: string;
  toDate: string;
  title: string;
  notes?: string;
  listId: string;
  textChanged: boolean;
}

export function App() {
  const layout = useLayoutMode();
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [captureDefaultDueAt, setCaptureDefaultDueAt] = useState<string | null | undefined>(undefined);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeView, setActiveView] = useState<ActiveMainView>(readStoredActiveView);
  const [isRecurringOpen, setIsRecurringOpen] = useState(false);
  const { undoToast, showUndoToast, dismissUndoToast } = useUndoToast();

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(formatDate(now));
  const [calExpanded, setCalExpanded] = useState<boolean>(readStoredCalendarExpanded);
  const [isMonthYearPickerOpen, setIsMonthYearPickerOpen] = useState(false);

  const effectiveExpanded = layout.isSplit ? true : calExpanded;
  const calendarRowHeight = layout.isCompactLandscape ? 32 : layout.isDesktop ? 42 : undefined;
  const isThreePaneDashboard =
    layout.isWideDesktop && activeView === 'calendar' && !isSearchOpen && !isRecurringOpen;
  const selectedTaskId = layout.isDesktop && isTaskModalOpen ? (editingTask?.id ?? null) : null;

  const calViewRef = useRef({
    year: calYear,
    monthIndex: calMonth,
    selectedDateStr: calSelectedDate,
  });
  calViewRef.current = {
    year: calYear,
    monthIndex: calMonth,
    selectedDateStr: calSelectedDate,
  };

  useEffect(() => {
    saveStoredCalendarExpanded(calExpanded);
  }, [calExpanded]);

  useEffect(() => {
    saveStoredActiveView(activeView);
  }, [activeView]);

  const calAreaRef = useRef<HTMLDivElement>(null);
  const monthViewRef = useRef<CalendarMonthHandle>(null);
  const monthTitleRef = useRef<SwipeableMonthTitleHandle>(null);
  const calScrollRef = useRef<HTMLDivElement>(null);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const savedCalScrollTopRef = useRef<number | null>(null);
  const restoreMoreFocusRef = useRef(false);

  const handleCalendarSwipeProgress = useCallback((event: CalendarSwipeEvent) => {
    monthTitleRef.current?.applySwipe(event);
  }, []);

  const applyCalendarTarget = useCallback(
    (next: { year: number; monthIndex: number; dateStr: string }) => {
      monthViewRef.current?.cancelPendingSwipe();
      calViewRef.current = {
        year: next.year,
        monthIndex: next.monthIndex,
        selectedDateStr: next.dateStr,
      };
      setCalYear(next.year);
      setCalMonth(next.monthIndex);
      setCalSelectedDate(next.dateStr);
    },
    []
  );

  const handleStepCalendar = useCallback(
    (delta: -1 | 1) => {
      const current = calViewRef.current;
      const next = stepCalendarView({
        expanded: effectiveExpanded,
        year: current.year,
        monthIndex: current.monthIndex,
        selectedDateStr: current.selectedDateStr,
        delta,
        today: new Date(),
      });
      applyCalendarTarget(next);
    },
    [effectiveExpanded, applyCalendarTarget]
  );

  const handleJumpToToday = useCallback(() => {
    applyCalendarTarget(jumpToToday(new Date()));
  }, [applyCalendarTarget]);

  const handleSelectMonthYear = useCallback(
    (year: number, monthIndex: number) => {
      applyCalendarTarget({
        year,
        monthIndex,
        dateStr: defaultDateForMonth(year, monthIndex, new Date()),
      });
    },
    [applyCalendarTarget]
  );
  const { handleDragActiveChange, cancelPull, areaPointerProps } = useCalendarPullGesture({
    calAreaRef,
    calScrollRef,
    monthViewRef,
    calExpanded,
    setCalExpanded,
    active: !layout.isSplit && activeView === 'calendar' && !isSearchOpen && !isRecurringOpen,
  });

  const [prefs, updatePrefs] = usePrefs();
  const [settingsPage, setSettingsPage] = useState<SettingsPageId>('root');
  const [overflowAnchor, setOverflowAnchor] = useState<DOMRect | null>(null);
  const changeDatePickerRef = useRef<ChangeDatePickerHandle | null>(null);
  const logDatePickerRef = useRef<ChangeDatePickerHandle | null>(null);
  const [skipOccurrenceTask, setSkipOccurrenceTask] = useState<Task | null>(null);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Task | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingRecurringMove | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const openSettings = useCallback((page: SettingsPageId = 'root') => {
    setSettingsPage(page);
    setIsSettingsModalOpen(true);
  }, []);

  const [initialTasks, setInitialTasks] = useState<Task[] | null>(null);

  useEffect(() => {
    initDiagnostics();
    void (async () => {
      try {
        await initDatabase();
        const idbTasks = await db.tasks.toArray();
        setInitialTasks(idbTasks);
        recordDiagEvent('db_init', `idbTasks=${idbTasks.length}`);
      } catch (err) {
        recordDiagEvent('db_init_error', err instanceof Error ? err.message : String(err));
      }
    })();
  }, []);

  // PWA Web Share Target. Production posts to /share and the service worker
  // stashes the note. A length-capped query string remains for older links.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const stashed = await takeSharedText();
      const params = new URLSearchParams(window.location.search);
      const hasShareQuery = ['share', 'text', 'title', 'url'].some((key) => params.has(key));
      const fromQuery = hasShareQuery
        ? shareTextFromParts(params.get('title'), params.get('text'), params.get('url'))
        : '';
      if (hasShareQuery) {
        const url = new URL(window.location.href);
        ['share', 'text', 'title', 'url'].forEach((key) => url.searchParams.delete(key));
        window.history.replaceState({}, '', url.pathname + url.search);
      }
      const combined = stashed || fromQuery;
      if (cancelled || !combined) return;
      setEditingTask({ title: combined } as Task);
      setIsTaskModalOpen(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const liveTasks = useLiveQuery(() => db.tasks.toArray(), []);
  const allTasks = liveTasks ?? initialTasks ?? EMPTY_TASKS;

  const { status: syncStatus, refreshStatus: refreshSyncStatus, scheduleSync } = useAutoSync();
  const activeTasks = useMemo(() => allTasks.filter((t) => !t.deletedAt), [allTasks]);

  const displayedTasks = useMemo(() => {
    if (calSelectedDate) {
      return sortTasksForDailyView(tasksDueOnDate(activeTasks, calSelectedDate));
    }
    return [];
  }, [calSelectedDate, activeTasks]);

  const calCompletedTasks = useMemo(() => {
    if (!calSelectedDate || prefs.hideCompleted) return [];
    return sortTasksForDailyView(completedTasksOnDate(activeTasks, calSelectedDate));
  }, [calSelectedDate, activeTasks, prefs.hideCompleted]);

  const calOverdueTasks = useMemo(() => {
    if (!prefs.showOverdue) return [];
    const refNow = new Date();
    const todayStr = formatDate(refNow);
    if (calSelectedDate !== todayStr) return [];
    const overdue: Task[] = [];
    for (const t of activeTasks) {
      if (t.deletedAt || isCompleted(t)) continue;
      if (isFixedRecurring(t)) {
        const nextDate = getNextUncompletedOccurrenceDate(t, refNow);
        if (nextDate && nextDate < todayStr) {
          overdue.push(projectTaskForDate(t, nextDate));
        }
      } else if (!t.recurrence && t.dueAt && getDueDatePart(t.dueAt) < todayStr) {
        overdue.push(t);
      }
    }
    const displayedKeys = new Set(displayedTasks.map((t) => `${t.id}:${t.dueAt || ''}`));
    return sortTasksForDailyView(
      overdue.filter((t) => !displayedKeys.has(`${t.id}:${t.dueAt || ''}`))
    );
  }, [prefs.showOverdue, calSelectedDate, activeTasks, displayedTasks]);

  const { visiblePeriodicTasks, tasksDotTone, undatedOneTimeTasks } = useMemo(() => {
    const refNow = new Date();
    const periodic: Task[] = [];
    const progressById = new Map<string, WindowProgress | null>();
    const oneTime: Task[] = [];
    let hasOverdue = false;
    let hasAmber = false;
    let hasInWindow = false;

    for (const t of activeTasks) {
      if (t.deletedAt) continue;
      if (isWindowPeriodic(t)) {
        const prog = getWindowProgress(t, refNow);
        if (prog?.visibleInTasks) {
          periodic.push(t);
          progressById.set(t.id, prog);
          if (prog.stage === 'at_or_past_max' && prog.overdueIntensity > 0) {
            hasOverdue = true;
          } else if (prog.stage === 'at_or_past_max' || prog.stage === 'not_done_yet') {
            hasAmber = true;
          } else {
            hasInWindow = true;
          }
        }
      } else if (isUndatedOneTime(t) && !isCompleted(t)) {
        oneTime.push(t);
      }
    }

    return {
      visiblePeriodicTasks: sortWindowTasks(periodic, refNow, progressById),
      tasksDotTone: hasOverdue
        ? ('overdue' as const)
        : hasAmber
          ? ('amber' as const)
          : hasInWindow
            ? ('green' as const)
            : null,
      undatedOneTimeTasks: sortUndatedOneTimeTasks(oneTime),
    };
  }, [activeTasks]);

  const formatCalendarDayHeading = (dateStr: string): string => {
    const today = new Date();
    const todayStr = formatDate(today);
    if (dateStr === todayStr) return 'Today';
    if (dateStr === formatDate(addDays(today, 1))) return 'Tomorrow';
    if (dateStr === formatDate(addDays(today, -1))) return 'Yesterday';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const openSearch = useCallback(() => {
    cancelPull();
    savedCalScrollTopRef.current = calScrollRef.current?.scrollTop ?? null;
    setOverflowAnchor(null);
    setIsSearchOpen(true);
  }, [cancelPull]);

  const closeSearch = useCallback((restoreFocus = true) => {
    restoreMoreFocusRef.current = restoreFocus;
    setIsSearchOpen(false);
    setSearchQuery('');
  }, []);

  const handleJumpToDate = useCallback(
    (dateStr: string, expandCompleted: boolean) => {
      savedCalScrollTopRef.current = null;
      restoreMoreFocusRef.current = false;
      setIsSearchOpen(false);
      setIsRecurringOpen(false);
      setActiveView('calendar');
      setSearchQuery('');
      if (expandCompleted) {
        if (prefs.hideCompleted) {
          updatePrefs({ hideCompleted: false });
        }
        setCollapsedGroups((prev) =>
          prev['cal-completed'] ? { ...prev, 'cal-completed': false } : prev
        );
      }
      const [y, m] = dateStr.split('-').map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        applyCalendarTarget({ year: y, monthIndex: m - 1, dateStr });
      }
    },
    [applyCalendarTarget, prefs.hideCompleted, updatePrefs]
  );

  useLayoutEffect(() => {
    if (isSearchOpen) return;
    if (savedCalScrollTopRef.current != null && calScrollRef.current) {
      calScrollRef.current.scrollTop = savedCalScrollTopRef.current;
    }
    savedCalScrollTopRef.current = null;
    if (restoreMoreFocusRef.current) {
      restoreMoreFocusRef.current = false;
      moreButtonRef.current?.focus({ preventScroll: true });
    }
  }, [isSearchOpen]);

  const openCapture = useCallback((explicitDueAt?: string | null) => {
    setEditingTask(null);
    setCaptureDefaultDueAt(explicitDueAt);
    setIsTaskModalOpen(true);
  }, []);

  const closeTaskEditor = useCallback(() => {
    setIsTaskModalOpen(false);
    setEditingTask(null);
    setCaptureDefaultDueAt(undefined);
  }, []);

  const handleComplete = useCallback(async (id: string, dateStr?: string) => {
    const target = activeTasks.find((t) => t.id === id) ?? (await db.tasks.get(id));
    await completeTask(id, dateStr);
    scheduleSync();
    if (target && isUndatedOneTime(target)) {
      showUndoToast(`Completed "${target.title}"`, async () => {
        await undoCompleteUndatedTask(id);
        scheduleSync();
      });
    } else if (target && isWindowPeriodic(target)) {
      const targetDate = dateStr ?? formatDate(new Date());
      showUndoToast(`Logged "${target.title}"`, async () => {
        await uncompleteTask(id, targetDate);
        scheduleSync();
      });
    }
  }, [activeTasks, scheduleSync, showUndoToast]);

  const handleUncomplete = useCallback(async (id: string, dateStr?: string) => {
    await uncompleteTask(id, dateStr);
    scheduleSync();
  }, [scheduleSync]);

  const handleEdit = useCallback((task: Task) => {
    setCaptureDefaultDueAt(undefined);
    setEditingTask(task);
    setIsTaskModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await softDeleteTask(id);
    scheduleSync();
  }, [scheduleSync]);

  const handleStopRepeating = useCallback(async (task: Task) => {
    if (editingTask?.id === task.id) {
      closeTaskEditor();
    }
    const res = await stopRecurringTask(task.id);
    scheduleSync();
    if (res) {
      showUndoToast(`Stopped "${task.title}"`, async () => {
        await setTaskEndOnDate(task.id, res.previousEndOnDate);
        scheduleSync();
      });
    }
  }, [closeTaskEditor, editingTask?.id, scheduleSync, showUndoToast]);

  const handleSave = async (taskData: TaskInput): Promise<boolean> => {
    if (taskData.id) {
      const existing = await db.tasks.get(taskData.id);
      const fromDate = editingTask?.dueAt
        ? getDueDatePart(editingTask.dueAt)
        : existing?.dueAt
          ? getDueDatePart(existing.dueAt)
          : null;
      const toDate = taskData.dueAt ? getDueDatePart(taskData.dueAt) : null;

      if (
        existing &&
        isFixedRecurring(existing) &&
        taskData.recurrence &&
        isFixedRecurring({ recurrence: taskData.recurrence }) &&
        fromDate &&
        toDate &&
        fromDate !== toDate
      ) {
        const recurrenceChanged = !recurrenceRulesEqual(existing.recurrence, taskData.recurrence);
        if (!recurrenceChanged) {
          setPendingMove({
            source: 'sheet',
            rawTask: existing,
            fromDate,
            toDate,
            title: taskData.title,
            notes: taskData.notes,
            listId: taskData.listId ?? existing.listId,
            textChanged:
              existing.title !== taskData.title ||
              (existing.notes || undefined) !== taskData.notes,
          });
          return false;
        }
        const res = await moveRecurringSeries({
          id: existing.id,
          fromDate,
          toDate,
          title: taskData.title,
          notes: taskData.notes,
          listId: taskData.listId ?? existing.listId,
          explicitRecurrence: taskData.recurrence,
        });
        setEditingTask(null);
        scheduleSync();
        if (res) {
          showUndoToast(`Moved "${res.task.title}"`, async () => {
            await restoreTaskSnapshot(res.previousTask, res.task);
            scheduleSync();
          });
        }
        return true;
      }
    }

    await saveTask(taskData, { newTaskPosition: prefs.newTaskPosition });
    setEditingTask(null);
    scheduleSync();
    return true;
  };

  const handleRequestChangeDate = useCallback((task: Task, anchorRect?: DOMRect) => {
    changeDatePickerRef.current?.open(task, anchorRect);
  }, []);

  const handleRequestLogDate = useCallback((task: Task, anchorRect?: DOMRect) => {
    logDatePickerRef.current?.open(task, anchorRect);
  }, []);

  const handleConfirmChangeDateTask = useCallback(async (task: Task, newDueAt: string | null) => {
    const existing = await db.tasks.get(task.id);
    if (!existing) return;

    const fromDate = task.dueAt
      ? getDueDatePart(task.dueAt)
      : existing.dueAt
        ? getDueDatePart(existing.dueAt)
        : null;
    const toDate = newDueAt ? getDueDatePart(newDueAt) : null;

    if (isFixedRecurring(existing) && fromDate && toDate) {
      if (fromDate === toDate) return;
      setPendingMove({
        source: 'picker',
        rawTask: existing,
        fromDate,
        toDate,
        title: existing.title,
        notes: existing.notes,
        listId: existing.listId,
        textChanged: false,
      });
      return;
    }

    await saveTask({
      id: existing.id,
      title: existing.title,
      notes: existing.notes,
      listId: existing.listId,
      dueAt: newDueAt,
      recurrence: existing.recurrence,
    });
    scheduleSync();
  }, [scheduleSync]);

  const handleConfirmMoveOccurrence = useCallback(async () => {
    const move = pendingMove;
    if (!move) return;
    const res = await moveRecurringOccurrenceOnly({
      id: move.rawTask.id,
      fromDate: move.fromDate,
      toDate: move.toDate,
      title: move.title,
      notes: move.notes,
      listId: move.listId,
    });
    setPendingMove(null);
    if (move.source === 'sheet') {
      setIsTaskModalOpen(false);
      setEditingTask(null);
    }
    if (!res) return;
    scheduleSync();
    showUndoToast(`Moved occurrence of "${res.task.title}"`, async () => {
      await restoreTaskSnapshot(res.previousTask, res.task);
      scheduleSync();
    });
  }, [pendingMove, scheduleSync, showUndoToast]);

  const handleConfirmMoveSeries = useCallback(async () => {
    const move = pendingMove;
    if (!move) return;
    const res = await moveRecurringSeries({
      id: move.rawTask.id,
      fromDate: move.fromDate,
      toDate: move.toDate,
      title: move.title,
      notes: move.notes,
      listId: move.listId,
    });
    setPendingMove(null);
    if (move.source === 'sheet') {
      setIsTaskModalOpen(false);
      setEditingTask(null);
    }
    if (!res) return;
    scheduleSync();
    showUndoToast(`Moved recurring task "${res.task.title}"`, async () => {
      await restoreTaskSnapshot(res.previousTask, res.task);
      scheduleSync();
    });
  }, [pendingMove, scheduleSync, showUndoToast]);

  const handleConfirmLogDate = useCallback(async (taskId: string, pickedDate: string | null) => {
    if (!pickedDate) return;
    await logTaskCompletion(taskId, pickedDate);
    scheduleSync();
  }, [scheduleSync]);

  const handleRemoveCompletionTimestamp = useCallback(async (taskId: string, ts: number) => {
    await removeTaskCompletion(taskId, ts);
    scheduleSync();
  }, [scheduleSync]);

  const handleConfirmSkipOccurrence = async (task: Task, dateToSkip: string) => {
    await skipTaskOccurrence(task.id, dateToSkip);
    scheduleSync();
    setSkipOccurrenceTask(null);
  };

  const handleConfirmDelete = async (taskId: string) => {
    setDeleteConfirmTask(null);
    if (editingTask?.id === taskId) {
      closeTaskEditor();
    }
    await handleDelete(taskId);
  };

  const hasBlockingModal =
    isTaskModalOpen ||
    isSettingsModalOpen ||
    !!overflowAnchor ||
    showShortcutsHelp ||
    !!skipOccurrenceTask ||
    !!deleteConfirmTask ||
    !!pendingMove ||
    isMonthYearPickerOpen;

  const canOpenSearch =
    !isSearchOpen && (!isRecurringOpen || layout.isDesktop) && !hasBlockingModal;
  const canUseNavShortcuts = !isSearchOpen && !hasBlockingModal;

  useKeyboardShortcuts(
    {
      onCapture: () => openCapture(),
      onSearch: canOpenSearch ? openSearch : undefined,
      onViewCalendar: canUseNavShortcuts
        ? () => {
            setIsRecurringOpen(false);
            setActiveView('calendar');
          }
        : undefined,
      onViewTasks: canUseNavShortcuts
        ? () => {
            setIsRecurringOpen(false);
            setActiveView('tasks');
          }
        : undefined,
      onViewRecurring: canUseNavShortcuts
        ? () => {
            setOverflowAnchor(null);
            setIsRecurringOpen(true);
          }
        : undefined,
      onToday: canUseNavShortcuts
        ? () => {
            setIsRecurringOpen(false);
            setActiveView('calendar');
            handleJumpToToday();
          }
        : undefined,
      onPrevPeriod:
        canUseNavShortcuts && activeView === 'calendar' && !isRecurringOpen
          ? () => handleStepCalendar(-1)
          : undefined,
      onNextPeriod:
        canUseNavShortcuts && activeView === 'calendar' && !isRecurringOpen
          ? () => handleStepCalendar(1)
          : undefined,
      onEscape: () => {
        if (pendingMove) return;
        if (showShortcutsHelp) {
          setShowShortcutsHelp(false);
          return;
        }
        if (deleteConfirmTask) {
          setDeleteConfirmTask(null);
          return;
        }
        if (skipOccurrenceTask) {
          setSkipOccurrenceTask(null);
          return;
        }
        if (isTaskModalOpen) {
          closeTaskEditor();
          return;
        }
        if (isSettingsModalOpen) {
          setIsSettingsModalOpen(false);
          return;
        }
        if (isRecurringOpen) {
          setIsRecurringOpen(false);
          return;
        }
        if (isSearchOpen) {
          if (searchQuery.length > 0) {
            setSearchQuery('');
            searchInputRef.current?.focus({ preventScroll: true });
          } else {
            closeSearch(true);
          }
          return;
        }
      },
      onOpenHelp: () => setShowShortcutsHelp(true),
    },
    !isMonthYearPickerOpen && !pendingMove
  );

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const todayDateStr = formatDate(now);
  const isOnToday =
    calSelectedDate === todayDateStr &&
    calYear === now.getFullYear() &&
    calMonth === now.getMonth();
  const calFocusStr = calSelectedDate || todayDateStr;
  const prevTitleTarget = effectiveExpanded
    ? shiftMonth(calYear, calMonth, -1)
    : shiftWeek(calFocusStr, -1);
  const nextTitleTarget = effectiveExpanded
    ? shiftMonth(calYear, calMonth, 1)
    : shiftWeek(calFocusStr, 1);
  const prevCalHeaderTitle = calendarHeaderTitle(
    prevTitleTarget.year,
    prevTitleTarget.monthIndex
  );
  const calHeaderTitle = calendarHeaderTitle(calYear, calMonth);
  const nextCalHeaderTitle = calendarHeaderTitle(
    nextTitleTarget.year,
    nextTitleTarget.monthIndex
  );
  const canSwipePrevTitle =
    prevTitleTarget.year !== calYear || prevTitleTarget.monthIndex !== calMonth;
  const canSwipeNextTitle =
    nextTitleTarget.year !== calYear || nextTitleTarget.monthIndex !== calMonth;

  const openOverflow = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOverflowAnchor(e.currentTarget.getBoundingClientRect());
  };

  const renderTaskRows = (
    tasks: Task[],
    reorderEnabled = false,
    occurrenceDateStr?: string,
  ) => {
    return (
      <ReorderableTaskList
        tasks={tasks}
        enabled={reorderEnabled}
        onDragActiveChange={handleDragActiveChange}
        onReorder={(taskIds) => {
          void reorderTasks(taskIds);
          scheduleSync();
        }}
        renderRow={(t, dragProps) => (
          <TaskCard
            key={`${t.id}-${t.dueAt ?? ''}`}
            task={t}
            selected={selectedTaskId === t.id}
            showDetails={prefs.showDetails}
            occurrenceDateStr={occurrenceDateStr}
            onSelect={handleEdit}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRequestChangeDate={handleRequestChangeDate}
            onRequestLogDate={handleRequestLogDate}
            onRequestSkipOccurrence={setSkipOccurrenceTask}
            onRequestDelete={setDeleteConfirmTask}
            {...dragProps}
          />
        )}
      />
    );
  };

  const formatSelectedDaySubtitle = (dateStr: string): string => {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  const renderCalendarNavButtons = (includeOverflow = false) => (
    <>
      <button
        type="button"
        onClick={handleJumpToToday}
        aria-label="Today"
        title="Today (T)"
        className={`w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 desktop:w-8 desktop:h-8 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
          isOnToday
            ? 'text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar'
            : 'text-tt-blue hover:bg-tt-blue-soft'
        }`}
      >
        <TodayCalendarIcon day={now.getDate()} />
      </button>
      <button
        type="button"
        onClick={() => handleStepCalendar(-1)}
        aria-label={effectiveExpanded ? 'Previous month' : 'Previous week'}
        title={effectiveExpanded ? 'Previous month' : 'Previous week'}
        className="w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 desktop:w-8 desktop:h-8 flex items-center justify-center text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
      >
        <ChevronLeft className="w-5 h-5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => handleStepCalendar(1)}
        aria-label={effectiveExpanded ? 'Next month' : 'Next week'}
        title={effectiveExpanded ? 'Next month' : 'Next week'}
        className="w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 desktop:w-8 desktop:h-8 flex items-center justify-center text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
      >
        <ChevronRight className="w-5 h-5" strokeWidth={2} />
      </button>
      {includeOverflow && (
        <button
          ref={moreButtonRef}
          type="button"
          className="w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
          onClick={openOverflow}
          title="More options"
          aria-label="More options"
          aria-haspopup="menu"
          aria-expanded={!!overflowAnchor}
        >
          <MoreVertical className="w-5 h-5 text-tt-secondary" strokeWidth={2} />
        </button>
      )}
    </>
  );

  const renderMonthTitleSelector = () => (
    <div className="flex items-center gap-0.5 min-w-0">
      <SwipeableMonthTitle
        ref={monthTitleRef}
        prevTitle={prevCalHeaderTitle}
        currentTitle={calHeaderTitle}
        nextTitle={nextCalHeaderTitle}
        canSwipePrev={canSwipePrevTitle}
        canSwipeNext={canSwipeNextTitle}
        expanded={effectiveExpanded}
        onClick={() =>
          layout.isSplit
            ? setIsMonthYearPickerOpen(true)
            : setCalExpanded((prev) => !prev)
        }
      />
      <button
        type="button"
        onClick={() => setIsMonthYearPickerOpen(true)}
        aria-label="Choose month and year"
        aria-expanded={isMonthYearPickerOpen}
        title="Choose month and year"
        className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 compact-landscape:w-7 compact-landscape:h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
      >
        <ChevronDown
          className={`w-4 h-4 transition-transform duration-200 ${
            isMonthYearPickerOpen ? 'rotate-180' : ''
          }`}
          strokeWidth={2.2}
        />
      </button>
    </div>
  );

  const renderSelectedDayListContent = (selectedDate: string) => {
    if (
      displayedTasks.length === 0 &&
      calCompletedTasks.length === 0 &&
      calOverdueTasks.length === 0
    ) {
      return <p className="text-sm text-tt-muted px-4 py-6 text-center">No tasks this day</p>;
    }
    return (
      <>
        {calOverdueTasks.length > 0 && (
          <div>
            <TaskGroupHeader
              label="Overdue"
              count={calOverdueTasks.length}
              tone="overdue"
              collapsed={!!collapsedGroups['cal-overdue']}
              onToggle={() => toggleGroup('cal-overdue')}
              sticky={false}
            />
            {!collapsedGroups['cal-overdue'] && renderTaskRows(calOverdueTasks)}
          </div>
        )}
        {displayedTasks.length > 0 ? (
          <div>
            <div className="px-3 sm:px-4 py-2 flex items-center gap-1.5 bg-tt-bg desktop:bg-tt-surface">
              <span className="text-[20px] desktop:text-[16px] font-bold text-tt-text">
                {formatCalendarDayHeading(selectedDate)}
              </span>
              <span className="text-[13px] text-tt-muted tabular-nums">
                {displayedTasks.length}
              </span>
            </div>
            {renderTaskRows(displayedTasks, true)}
          </div>
        ) : (
          calOverdueTasks.length > 0 && (
            <div>
              <div className="px-3 sm:px-4 py-2 flex items-center gap-1.5 bg-tt-bg desktop:bg-tt-surface">
                <span className="text-[20px] desktop:text-[16px] font-bold text-tt-text">Today</span>
                <span className="text-[13px] text-tt-muted tabular-nums">0</span>
              </div>
              <p className="text-sm text-tt-muted px-3 sm:px-4 py-2">No tasks scheduled for today</p>
            </div>
          )
        )}
        {calCompletedTasks.length > 0 && (
          <div>
            <TaskGroupHeader
              label="Completed"
              count={calCompletedTasks.length}
              collapsed={!!collapsedGroups['cal-completed']}
              onToggle={() => toggleGroup('cal-completed')}
              sticky={false}
            />
            {!collapsedGroups['cal-completed'] &&
              renderTaskRows(calCompletedTasks, false, selectedDate)}
          </div>
        )}
      </>
    );
  };

  const renderDesktopCalendarMonthPane = (className: string) => (
    <section
      aria-label="Calendar month"
      className={`shrink-0 flex flex-col min-h-0 border-r border-tt-border bg-tt-surface ${className}`}
    >
      <div className="shrink-0 h-14 px-3.5 border-b border-tt-border flex items-center justify-between gap-1">
        {renderMonthTitleSelector()}
        <div className="shrink-0 flex items-center gap-0.5">
          {renderCalendarNavButtons(false)}
        </div>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-3 space-y-4">
        <CalendarMonthView
          ref={monthViewRef}
          year={calYear}
          monthIndex={calMonth}
          selectedDateStr={calSelectedDate}
          tasks={activeTasks}
          expanded={effectiveExpanded}
          collapsible={false}
          rowHeight={calendarRowHeight}
          onToggleExpanded={() => setIsMonthYearPickerOpen(true)}
          onSelectDate={setCalSelectedDate}
          onSwipeProgress={handleCalendarSwipeProgress}
          onMonthChange={(y, m) => {
            setCalYear(y);
            setCalMonth(m);
          }}
        />
        {calSelectedDate && (
          <div className="rounded-xl border border-tt-border bg-tt-sidebar/60 px-3.5 py-2.5 text-xs text-tt-secondary space-y-1">
            <div className="font-semibold text-tt-text text-[13px]">
              {formatCalendarDayHeading(calSelectedDate)} · {formatSelectedDaySubtitle(calSelectedDate)}
            </div>
            <div className="tabular-nums">
              {calOverdueTasks.length > 0 && (
                <span className="text-tt-overdue font-medium">{calOverdueTasks.length} overdue · </span>
              )}
              <span>
                {displayedTasks.length} {displayedTasks.length === 1 ? 'task' : 'tasks'} scheduled
              </span>
              {calCompletedTasks.length > 0 && (
                <span> · {calCompletedTasks.length} completed</span>
              )}
            </div>
          </div>
        )}
      </div>
    </section>
  );

  const renderDesktopSelectedDayPane = (className: string) => (
    <section
      aria-label="Selected day tasks"
      className={`flex-1 min-w-0 flex flex-col min-h-0 bg-tt-surface ${className}`}
    >
      <div className="shrink-0 h-14 px-5 border-b border-tt-border flex items-center justify-between gap-2">
        <div className="min-w-0 flex items-baseline gap-2">
          <h1 className="text-[18px] font-bold tracking-tight text-tt-text truncate">
            {calSelectedDate ? formatCalendarDayHeading(calSelectedDate) : 'Calendar'}
          </h1>
          {calSelectedDate && (
            <span className="text-[13px] text-tt-secondary truncate">
              {formatSelectedDaySubtitle(calSelectedDate)}
            </span>
          )}
        </div>
        <div className="shrink-0 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => openCapture(calSelectedDate ?? undefined)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4" strokeWidth={2.3} />
            <span>Add</span>
          </button>
          <button
            ref={moreButtonRef}
            type="button"
            className="w-8 h-8 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
            onClick={openOverflow}
            title="More options"
            aria-label="More options"
            aria-haspopup="menu"
            aria-expanded={!!overflowAnchor}
          >
            <MoreVertical className="w-4 h-4 text-tt-secondary" strokeWidth={2} />
          </button>
        </div>
      </div>

      {calSelectedDate && (
        <div
          ref={calScrollRef}
          className="flex-1 overflow-y-auto overscroll-y-contain tt-scroll-stable min-h-0 px-4 pt-2 pb-6"
        >
          <div className={isThreePaneDashboard ? 'space-y-2' : 'max-w-3xl mx-auto w-full space-y-2'}>
            {renderSelectedDayListContent(calSelectedDate)}
          </div>
        </div>
      )}
    </section>
  );

  const tasksCount = visiblePeriodicTasks.length + undatedOneTimeTasks.length;
  const resolvedDefaultDueAt =
    captureDefaultDueAt !== undefined
      ? captureDefaultDueAt
      : activeView === 'tasks'
        ? null
        : (calSelectedDate ?? undefined);
  const desktopActiveNav = isSearchOpen
    ? 'search'
    : isRecurringOpen
      ? 'recurring'
      : activeView;

  return (
    <div className="h-dvh bg-tt-bg desktop:bg-tt-surface text-tt-text flex flex-col desktop:flex-row overflow-hidden tt-safe-x">
      {layout.isDesktop && (
        <DesktopSidebar
          wide={layout.isWideDesktop}
          activeNav={desktopActiveNav}
          tasksDotTone={tasksDotTone}
          tasksCount={tasksCount}
          syncPhase={
            syncStatus.phase === 'syncing'
              ? 'syncing'
              : syncStatus.lastError
                ? 'error'
                : syncStatus.phase
          }
          onSelectCalendar={() => {
            setIsSearchOpen(false);
            setIsRecurringOpen(false);
            setActiveView('calendar');
          }}
          onSelectTasks={() => {
            setIsSearchOpen(false);
            setIsRecurringOpen(false);
            setActiveView('tasks');
          }}
          onSelectRecurring={() => {
            setIsSearchOpen(false);
            setOverflowAnchor(null);
            setIsRecurringOpen(true);
          }}
          onSelectSearch={openSearch}
          onNewTask={() => openCapture()}
          onOpenShortcuts={() => setShowShortcutsHelp(true)}
          onOpenSettings={() => openSettings('root')}
        />
      )}

      <div className="flex-1 flex min-w-0 min-h-0 relative overflow-hidden">
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
          {isSearchOpen ? (
            <TaskSearchView
              tasks={activeTasks}
              query={searchQuery}
              onQueryChange={setSearchQuery}
              onClose={() => closeSearch(true)}
              showDetails={prefs.showDetails}
              embedded={layout.isDesktop}
              selectedTaskId={selectedTaskId}
              onJumpToDate={handleJumpToDate}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRequestChangeDate={handleRequestChangeDate}
              onRequestLogDate={handleRequestLogDate}
              onRequestSkipOccurrence={setSkipOccurrenceTask}
              onRequestDelete={setDeleteConfirmTask}
              inputRef={searchInputRef}
            />
          ) : isRecurringOpen ? (
            <RecurringTasksView
              tasks={activeTasks}
              showDetails={prefs.showDetails}
              embedded={layout.isDesktop}
              selectedTaskId={selectedTaskId}
              onClose={() => setIsRecurringOpen(false)}
              onComplete={handleComplete}
              onUncomplete={handleUncomplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onRequestChangeDate={handleRequestChangeDate}
              onRequestLogDate={handleRequestLogDate}
              onRequestSkipOccurrence={setSkipOccurrenceTask}
              onRequestDelete={setDeleteConfirmTask}
            />
          ) : (
            <>
              {/* Non-Desktop Top Header (Portrait, Compact Landscape, Medium Split) */}
              {!layout.isDesktop && (
                <header className="shrink-0 flex items-center justify-between gap-1 sm:gap-2 h-14 sm:h-16 compact-landscape:h-12 px-2.5 sm:px-5 bg-tt-bg border-b border-tt-border text-tt-text z-20">
                  <div className="flex items-center gap-1 sm:gap-2 min-w-0">
                    {layout.isSplit && !layout.isCompactLandscape ? (
                      <div
                        role="tablist"
                        aria-label="Main view"
                        className="shrink-0 inline-flex items-center p-0.5 rounded-xl bg-tt-sidebar border border-tt-border"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeView === 'calendar'}
                          onClick={() => setActiveView('calendar')}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer ${
                            activeView === 'calendar'
                              ? 'bg-tt-surface text-tt-blue shadow-xs'
                              : 'text-tt-secondary hover:text-tt-text'
                          }`}
                        >
                          <Calendar className="w-3.5 h-3.5" />
                          <span>Calendar</span>
                        </button>
                        <button
                          type="button"
                          role="tab"
                          aria-selected={activeView === 'tasks'}
                          onClick={() => setActiveView('tasks')}
                          className={`relative inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[13px] font-semibold transition-colors cursor-pointer ${
                            activeView === 'tasks'
                              ? 'bg-tt-surface text-tt-blue shadow-xs'
                              : 'text-tt-secondary hover:text-tt-text'
                          }`}
                        >
                          <ListChecks className="w-3.5 h-3.5" />
                          <span>Tasks</span>
                          {tasksDotTone && (
                            <span
                              data-testid="tasks-nav-dot"
                              aria-hidden="true"
                              className={`w-2 h-2 rounded-full ${
                                tasksDotTone === 'overdue'
                                  ? 'bg-tt-overdue'
                                  : tasksDotTone === 'amber'
                                    ? 'bg-amber-500'
                                    : 'bg-tt-ring-green'
                              }`}
                            />
                          )}
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActiveView((v) => (v === 'calendar' ? 'tasks' : 'calendar'))}
                        aria-label={activeView === 'calendar' ? 'Switch to Tasks view' : 'Switch to Calendar view'}
                        title={activeView === 'calendar' ? 'Tasks' : 'Calendar'}
                        className="relative shrink-0 w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 flex items-center justify-center rounded-lg text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
                      >
                        {activeView === 'calendar' ? (
                          <>
                            <ListChecks className="w-5 h-5" strokeWidth={2} />
                            {tasksDotTone && (
                              <span
                                data-testid="tasks-nav-dot"
                                aria-hidden="true"
                                className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-tt-bg ${
                                  tasksDotTone === 'overdue'
                                    ? 'bg-tt-overdue'
                                    : tasksDotTone === 'amber'
                                      ? 'bg-amber-500'
                                      : 'bg-tt-ring-green'
                                }`}
                              />
                            )}
                          </>
                        ) : (
                          <Calendar className="w-5 h-5" strokeWidth={2} />
                        )}
                      </button>
                    )}

                    {activeView === 'calendar' ? (
                      renderMonthTitleSelector()
                    ) : (
                      (!layout.isSplit || layout.isCompactLandscape) && (
                        <h1 className="px-1 text-[20px] sm:text-[22px] compact-landscape:text-[18px] font-bold tracking-tight text-tt-text">
                          Tasks
                        </h1>
                      )
                    )}
                  </div>

                  <div className="shrink-0 flex items-center gap-0.5 sm:gap-1">
                    {activeView === 'calendar' && renderCalendarNavButtons(false)}
                    {layout.isSplit && !layout.isCompactLandscape && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setOverflowAnchor(null);
                            setIsRecurringOpen(true);
                          }}
                          aria-label="Recurring tasks"
                          title="Recurring tasks"
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
                        >
                          <RefreshCw className="w-4 h-4" strokeWidth={2} />
                        </button>
                        <button
                          type="button"
                          onClick={openSearch}
                          aria-label="Search tasks"
                          title="Search tasks"
                          className="w-9 h-9 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
                        >
                          <Search className="w-4 h-4" strokeWidth={2} />
                        </button>
                      </>
                    )}
                    <button
                      ref={moreButtonRef}
                      type="button"
                      className="w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
                      onClick={openOverflow}
                      title="More options"
                      aria-label="More options"
                      aria-haspopup="menu"
                      aria-expanded={!!overflowAnchor}
                    >
                      <MoreVertical className="w-5 h-5 text-tt-secondary" strokeWidth={2} />
                    </button>
                  </div>
                </header>
              )}

              {/* Desktop Tasks Workspace Header */}
              {layout.isDesktop && activeView === 'tasks' && (
                <header className="shrink-0 h-14 px-5 border-b border-tt-border bg-tt-surface flex items-center justify-between gap-2 z-20">
                  <div className="flex items-baseline gap-2.5 min-w-0">
                    <h1 className="text-[18px] font-bold tracking-tight text-tt-text">Tasks</h1>
                    <span className="text-[13px] text-tt-secondary truncate">
                      Periodic routines &amp; undated tasks
                    </span>
                  </div>
                  <div className="shrink-0 flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => openCapture(null)}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[13px] font-semibold text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
                    >
                      <Plus className="w-4 h-4" strokeWidth={2.3} />
                      <span>Add task</span>
                    </button>
                    <button
                      ref={moreButtonRef}
                      type="button"
                      className="w-8 h-8 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
                      onClick={openOverflow}
                      title="More options"
                      aria-label="More options"
                      aria-haspopup="menu"
                      aria-expanded={!!overflowAnchor}
                    >
                      <MoreVertical className="w-4 h-4 text-tt-secondary" strokeWidth={2} />
                    </button>
                  </div>
                </header>
              )}

              {/* Main Content Area */}
              <div className="flex-1 flex min-h-0 relative">
                <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg desktop:bg-tt-surface">
                  {activeView === 'tasks' ? (
                    <TasksView
                      periodicTasks={visiblePeriodicTasks}
                      oneTimeTasks={undatedOneTimeTasks}
                      showDetails={prefs.showDetails}
                      collapsedGroups={collapsedGroups}
                      layoutMode={layout.isSplit ? 'two-column' : 'stacked'}
                      selectedTaskId={selectedTaskId}
                      onToggleGroup={toggleGroup}
                      onDragActiveChange={handleDragActiveChange}
                      onReorderOneTime={(taskIds) => {
                        void reorderTasks(taskIds);
                        scheduleSync();
                      }}
                      onSelect={handleEdit}
                      onComplete={handleComplete}
                      onUncomplete={handleUncomplete}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onRequestChangeDate={handleRequestChangeDate}
                      onRequestLogDate={handleRequestLogDate}
                      onRequestDelete={setDeleteConfirmTask}
                    />
                  ) : isThreePaneDashboard ? (
                    <div
                      ref={calAreaRef}
                      data-testid="calendar-three-pane"
                      className="flex-1 flex min-w-0 min-h-0 overflow-hidden"
                    >
                      {renderDesktopCalendarMonthPane('w-[304px] min-[1440px]:w-[336px] 2xl:w-[360px]')}
                      {renderDesktopSelectedDayPane('border-r border-tt-border')}
                      <section
                        aria-label="Off-calendar tasks"
                        className="flex-1 min-w-0 max-w-[440px] 2xl:max-w-[500px] flex flex-col min-h-0 bg-tt-bg/50 dark:bg-tt-bg/60"
                      >
                        <div className="shrink-0 h-14 px-4 border-b border-tt-border flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <h2 className="text-[16px] font-bold text-tt-text">Tasks</h2>
                            {tasksDotTone && (
                              <span
                                aria-hidden="true"
                                className={`w-2 h-2 rounded-full ${
                                  tasksDotTone === 'overdue'
                                    ? 'bg-tt-overdue'
                                    : tasksDotTone === 'amber'
                                      ? 'bg-amber-500'
                                      : 'bg-tt-ring-green'
                                }`}
                              />
                            )}
                            {tasksCount > 0 && (
                              <span className="text-[12px] text-tt-muted tabular-nums">
                                {tasksCount}
                              </span>
                            )}
                          </div>
                          <div className="shrink-0 flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openCapture(null)}
                              aria-label="Add undated task"
                              title="Add undated task"
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[12px] font-semibold text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
                            >
                              <Plus className="w-3.5 h-3.5" strokeWidth={2.4} />
                              <span>Add</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => setActiveView('tasks')}
                              aria-label="Open full Tasks view"
                              title="Expand Tasks view (2)"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
                            >
                              <ArrowUpRight className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                        <TasksView
                          periodicTasks={visiblePeriodicTasks}
                          oneTimeTasks={undatedOneTimeTasks}
                          showDetails={prefs.showDetails}
                          collapsedGroups={collapsedGroups}
                          layoutMode="stacked"
                          selectedTaskId={selectedTaskId}
                          surfaceClassName="bg-transparent"
                          onToggleGroup={toggleGroup}
                          onDragActiveChange={handleDragActiveChange}
                          onReorderOneTime={(taskIds) => {
                            void reorderTasks(taskIds);
                            scheduleSync();
                          }}
                          onSelect={handleEdit}
                          onComplete={handleComplete}
                          onUncomplete={handleUncomplete}
                          onEdit={handleEdit}
                          onDelete={handleDelete}
                          onRequestChangeDate={handleRequestChangeDate}
                          onRequestLogDate={handleRequestLogDate}
                          onRequestDelete={setDeleteConfirmTask}
                        />
                      </section>
                    </div>
                  ) : layout.isSplit ? (
                    <div
                      ref={calAreaRef}
                      data-testid="calendar-split-pane"
                      className="flex-1 min-h-0 overflow-hidden grid grid-cols-[minmax(252px,38%)_minmax(0,1fr)] desktop:grid-cols-[320px_minmax(0,1fr)]"
                    >
                      {layout.isDesktop ? (
                        <>
                          {renderDesktopCalendarMonthPane('w-full')}
                          {renderDesktopSelectedDayPane('')}
                        </>
                      ) : (
                        <>
                          <div className="min-h-0 overflow-y-auto overscroll-y-contain border-r border-tt-border px-2.5 sm:px-4 py-2">
                            <CalendarMonthView
                              ref={monthViewRef}
                              year={calYear}
                              monthIndex={calMonth}
                              selectedDateStr={calSelectedDate}
                              tasks={activeTasks}
                              expanded={effectiveExpanded}
                              collapsible={false}
                              rowHeight={calendarRowHeight}
                              onToggleExpanded={() => setIsMonthYearPickerOpen(true)}
                              onSelectDate={setCalSelectedDate}
                              onSwipeProgress={handleCalendarSwipeProgress}
                              onMonthChange={(y, m) => {
                                setCalYear(y);
                                setCalMonth(m);
                              }}
                            />
                          </div>
                          {calSelectedDate ? (
                            <div
                              ref={calScrollRef}
                              className="min-h-0 overflow-y-auto overscroll-y-contain tt-scroll-stable px-3 sm:px-4 pt-2 pb-20 space-y-2"
                            >
                              {renderSelectedDayListContent(calSelectedDate)}
                            </div>
                          ) : (
                            <div />
                          )}
                        </>
                      )}
                    </div>
                  ) : (
                    <div
                      ref={calAreaRef}
                      {...areaPointerProps}
                      className="flex-1 flex flex-col min-h-0 overflow-hidden"
                    >
                      <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                        <div className="shrink-0 px-3 sm:px-5">
                          <CalendarMonthView
                            ref={monthViewRef}
                            year={calYear}
                            monthIndex={calMonth}
                            selectedDateStr={calSelectedDate}
                            tasks={activeTasks}
                            expanded={effectiveExpanded}
                            collapsible={true}
                            rowHeight={calendarRowHeight}
                            onToggleExpanded={(next) =>
                              setCalExpanded((prev) => (typeof next === 'boolean' ? next : !prev))
                            }
                            onSelectDate={setCalSelectedDate}
                            onSwipeProgress={handleCalendarSwipeProgress}
                            onMonthChange={(y, m) => {
                              setCalYear(y);
                              setCalMonth(m);
                            }}
                          />
                        </div>
                        {calSelectedDate && (
                          <div
                            ref={calScrollRef}
                            className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 border-t border-tt-border px-3 sm:px-5 pt-2 pb-20 space-y-2"
                          >
                            {renderSelectedDayListContent(calSelectedDate)}
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </main>
              </div>
            </>
          )}
        </div>

        {layout.isDesktop && (
          <QuickAddSheet
            presentation="drawer"
            overlayDrawer={isThreePaneDashboard}
            isOpen={isTaskModalOpen}
            onClose={closeTaskEditor}
            onSave={handleSave}
            initialTask={editingTask}
            defaultDueAt={resolvedDefaultDueAt}
            onRequestDelete={setDeleteConfirmTask}
            onLogCompletionDate={handleConfirmLogDate}
            onRemoveCompletionTimestamp={handleRemoveCompletionTimestamp}
          />
        )}
      </div>

      <UndoToast toast={undoToast} onDismiss={dismissUndoToast} />

      {/* FAB (Portrait, Compact Landscape, Medium Split) */}
      {!layout.isDesktop && (
        <button
          type="button"
          onClick={() => openCapture()}
          className="fixed z-40 w-14 h-14 compact-landscape:w-12 compact-landscape:h-12 rounded-full bg-tt-blue hover:bg-tt-blue-hover text-white flex items-center justify-center shadow-[0_6px_18px_rgba(71,114,250,0.35)] cursor-pointer hover:scale-105 active:scale-95 transition-all"
          style={{
            bottom: 'calc(16px + env(safe-area-inset-bottom))',
            right: 'max(20px, env(safe-area-inset-right))',
          }}
          title="Add task"
          aria-label="Add task"
        >
          <Plus className="w-7 h-7 compact-landscape:w-6 compact-landscape:h-6" strokeWidth={2.25} />
        </button>
      )}

      {!layout.isDesktop && (
        <QuickAddSheet
          presentation="sheet"
          isOpen={isTaskModalOpen}
          onClose={closeTaskEditor}
          onSave={handleSave}
          initialTask={editingTask}
          defaultDueAt={resolvedDefaultDueAt}
          onLogCompletionDate={handleConfirmLogDate}
          onRemoveCompletionTimestamp={handleRemoveCompletionTimestamp}
        />
      )}

      <SettingsPage
        key={isSettingsModalOpen ? `open-${settingsPage}` : 'closed'}
        isOpen={isSettingsModalOpen}
        initialPage={settingsPage}
        onClose={() => setIsSettingsModalOpen(false)}
        tasks={allTasks}
        syncStatus={syncStatus}
        onSyncStatusChange={() => refreshSyncStatus()}
        onShowShortcuts={() => setShowShortcutsHelp(true)}
        diagnosticsContext={{
          calSelectedDate,
          collapsedGroups,
          hideCompleted: prefs.hideCompleted,
        }}
      />

      <OverflowMenu
        open={!!overflowAnchor}
        anchor={overflowAnchor}
        showDetails={prefs.showDetails}
        hideCompleted={prefs.hideCompleted}
        showOverdue={prefs.showOverdue}
        showCalendarToggles={activeView === 'calendar' && !isRecurringOpen}
        onClose={() => setOverflowAnchor(null)}
        onSearch={openSearch}
        onRecurring={() => {
          setOverflowAnchor(null);
          setIsRecurringOpen(true);
        }}
        onToggleDetails={() => updatePrefs({ showDetails: !prefs.showDetails })}
        onToggleHideCompleted={() => updatePrefs({ hideCompleted: !prefs.hideCompleted })}
        onToggleShowOverdue={() => updatePrefs({ showOverdue: !prefs.showOverdue })}
        onSettings={() => openSettings('root')}
        onUpdateApp={triggerAppUpdate}
      />

      <InstallPrompt />

      <ShortcutsHelpDialog open={showShortcutsHelp} onClose={() => setShowShortcutsHelp(false)} />

      {/* Swipe Action Dialogs */}
      <ChangeDatePicker
        ref={changeDatePickerRef}
        onSaveTask={handleConfirmChangeDateTask}
      />
      <ChangeDatePicker
        ref={logDatePickerRef}
        maxDate={todayDateStr}
        ariaLabel="Log completion date"
        onSave={handleConfirmLogDate}
      />

      <MoveRecurringDialog
        isOpen={!!pendingMove}
        task={pendingMove?.rawTask ?? null}
        fromDate={pendingMove?.fromDate ?? null}
        toDate={pendingMove?.toDate ?? null}
        textChanged={pendingMove?.textChanged}
        onClose={() => setPendingMove(null)}
        onMoveOccurrence={handleConfirmMoveOccurrence}
        onMoveSeries={handleConfirmMoveSeries}
      />

      <SkipOccurrenceDialog
        isOpen={!!skipOccurrenceTask}
        task={skipOccurrenceTask}
        onClose={() => setSkipOccurrenceTask(null)}
        onConfirm={handleConfirmSkipOccurrence}
      />

      <DeleteConfirmDialog
        isOpen={!!deleteConfirmTask}
        task={deleteConfirmTask}
        onClose={() => setDeleteConfirmTask(null)}
        onConfirm={handleConfirmDelete}
        onStopRepeating={handleStopRepeating}
      />

      <MonthYearPickerDialog
        isOpen={isMonthYearPickerOpen}
        year={calYear}
        monthIndex={calMonth}
        today={now}
        onSelect={handleSelectMonthYear}
        onJumpToToday={handleJumpToToday}
        onClose={() => setIsMonthYearPickerOpen(false)}
      />
    </div>
  );
}

export default App;
