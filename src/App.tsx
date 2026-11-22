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
import { OverflowMenu } from './components/menu/OverflowMenu';
import { TaskSearchView } from './components/search/TaskSearchView';
import { TasksView } from './components/TasksView';
import { RecurringTasksView } from './components/RecurringTasksView';
import { triggerAppUpdate } from './components/PwaUpdatePrompt';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ListChecks,
  MoreVertical,
  Plus,
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
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
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
        expanded: calExpanded,
        year: current.year,
        monthIndex: current.monthIndex,
        selectedDateStr: current.selectedDateStr,
        delta,
        today: new Date(),
      });
      applyCalendarTarget(next);
    },
    [calExpanded, applyCalendarTarget]
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
    active: activeView === 'calendar' && !isSearchOpen && !isRecurringOpen,
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

  const openCapture = useCallback(() => {
    setEditingTask(null);
    setIsTaskModalOpen(true);
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
    setEditingTask(task);
    setIsTaskModalOpen(true);
  }, []);

  const handleDelete = useCallback(async (id: string) => {
    await softDeleteTask(id);
    scheduleSync();
  }, [scheduleSync]);

  const handleStopRepeating = useCallback(async (task: Task) => {
    const res = await stopRecurringTask(task.id);
    scheduleSync();
    if (res) {
      showUndoToast(`Stopped "${task.title}"`, async () => {
        await setTaskEndOnDate(task.id, res.previousEndOnDate);
        scheduleSync();
      });
    }
  }, [scheduleSync, showUndoToast]);

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

    await saveTask(taskData);
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
    await handleDelete(taskId);
  };

  const canOpenSearch =
    !isSearchOpen &&
    !isRecurringOpen &&
    !isTaskModalOpen &&
    !isSettingsModalOpen &&
    !overflowAnchor &&
    !showShortcutsHelp &&
    !skipOccurrenceTask &&
    !deleteConfirmTask &&
    !pendingMove &&
    !isMonthYearPickerOpen;

  useKeyboardShortcuts(
    {
      onCapture: openCapture,
      onSearch: canOpenSearch ? openSearch : undefined,
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
          setIsTaskModalOpen(false);
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
  const prevTitleTarget = calExpanded
    ? shiftMonth(calYear, calMonth, -1)
    : shiftWeek(calFocusStr, -1);
  const nextTitleTarget = calExpanded
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

  return (
    <div className="h-dvh bg-tt-bg xl:bg-tt-surface text-tt-text flex flex-col overflow-hidden">
      {isSearchOpen ? (
        <TaskSearchView
          tasks={activeTasks}
          query={searchQuery}
          onQueryChange={setSearchQuery}
          onClose={() => closeSearch(true)}
          showDetails={prefs.showDetails}
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
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between gap-1 sm:gap-2 h-14 sm:h-16 px-2.5 sm:px-5 bg-tt-bg xl:bg-tt-surface border-b border-tt-border text-tt-text z-20">
            <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
              <button
                type="button"
                onClick={() => setActiveView((v) => (v === 'calendar' ? 'tasks' : 'calendar'))}
                aria-label={activeView === 'calendar' ? 'Switch to Tasks view' : 'Switch to Calendar view'}
                title={activeView === 'calendar' ? 'Tasks' : 'Calendar'}
                className="relative shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg text-tt-blue hover:bg-tt-blue-soft transition-colors cursor-pointer"
              >
                {activeView === 'calendar' ? (
                  <>
                    <ListChecks className="w-5 h-5" strokeWidth={2} />
                    {tasksDotTone && (
                      <span
                        data-testid="tasks-nav-dot"
                        aria-hidden="true"
                        className={`absolute top-1.5 right-1.5 w-2 h-2 rounded-full ring-2 ring-tt-bg xl:ring-tt-surface ${
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

              {activeView === 'calendar' ? (
                <>
                  <SwipeableMonthTitle
                    ref={monthTitleRef}
                    prevTitle={prevCalHeaderTitle}
                    currentTitle={calHeaderTitle}
                    nextTitle={nextCalHeaderTitle}
                    canSwipePrev={canSwipePrevTitle}
                    canSwipeNext={canSwipeNextTitle}
                    expanded={calExpanded}
                    onClick={() => setCalExpanded((prev) => !prev)}
                  />
                  <button
                    type="button"
                    onClick={() => setIsMonthYearPickerOpen(true)}
                    aria-label="Choose month and year"
                    aria-expanded={isMonthYearPickerOpen}
                    title="Choose month and year"
                    className="shrink-0 w-8 h-8 sm:w-9 sm:h-9 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
                  >
                    <ChevronDown
                      className={`w-4 h-4 transition-transform duration-200 ${
                        isMonthYearPickerOpen ? 'rotate-180' : ''
                      }`}
                      strokeWidth={2.2}
                    />
                  </button>
                </>
              ) : (
                <h1 className="px-1 text-[20px] sm:text-[22px] font-bold tracking-tight text-tt-text">
                  Tasks
                </h1>
              )}
            </div>

            <div className="shrink-0 flex items-center gap-0.5 sm:gap-1">
              {activeView === 'calendar' && (
                <>
                  <button
                    type="button"
                    onClick={handleJumpToToday}
                    aria-label="Today"
                    title="Today"
                    className={`w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg transition-colors cursor-pointer ${
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
                    aria-label={calExpanded ? 'Previous month' : 'Previous week'}
                    title={calExpanded ? 'Previous month' : 'Previous week'}
                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-5 h-5" strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    onClick={() => handleStepCalendar(1)}
                    aria-label={calExpanded ? 'Next month' : 'Next week'}
                    title={calExpanded ? 'Next month' : 'Next week'}
                    className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
                  >
                    <ChevronRight className="w-5 h-5" strokeWidth={2} />
                  </button>
                </>
              )}
              {/* More / Overflow */}
              <button
                ref={moreButtonRef}
                type="button"
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors cursor-pointer"
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

      {/* Main Content Area */}
      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg xl:bg-tt-surface">
          {activeView === 'tasks' ? (
            <TasksView
              periodicTasks={visiblePeriodicTasks}
              oneTimeTasks={undatedOneTimeTasks}
              showDetails={prefs.showDetails}
              collapsedGroups={collapsedGroups}
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
                  expanded={calExpanded}
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
                  className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 border-t border-tt-border px-3 sm:px-5 pt-2 pb-20 xl:pb-4 space-y-2"
                >
                  {displayedTasks.length === 0 &&
                  calCompletedTasks.length === 0 &&
                  calOverdueTasks.length === 0 ? (
                    <p className="text-sm text-tt-muted px-4 py-6 text-center">No tasks this day</p>
                  ) : (
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
                          <div className="px-3 sm:px-4 py-2 flex items-center gap-1.5 bg-tt-bg xl:bg-tt-surface">
                            <span className="text-[20px] font-bold text-tt-text">
                              {formatCalendarDayHeading(calSelectedDate)}
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
                            <div className="px-3 sm:px-4 py-2 flex items-center gap-1.5 bg-tt-bg xl:bg-tt-surface">
                              <span className="text-[20px] font-bold text-tt-text">Today</span>
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
                            renderTaskRows(calCompletedTasks, false, calSelectedDate ?? undefined)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
          )}
        </main>
      </div>
        </>
      )}

      <UndoToast toast={undoToast} onDismiss={dismissUndoToast} />

      {/* FAB */}
      <button
        type="button"
        onClick={openCapture}
        className="fixed right-5 z-40 w-14 h-14 rounded-full bg-tt-blue hover:bg-tt-blue-hover text-white flex items-center justify-center shadow-[0_6px_18px_rgba(71,114,250,0.35)] cursor-pointer hover:scale-105 active:scale-95 transition-all"
        style={{ bottom: 'calc(16px + env(safe-area-inset-bottom))' }}
        title="Add task"
        aria-label="Add task"
      >
        <Plus className="w-7 h-7" strokeWidth={2.25} />
      </button>

      <QuickAddSheet
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
        initialTask={editingTask}
        defaultDueAt={activeView === 'tasks' ? null : (calSelectedDate ?? undefined)}
        onLogCompletionDate={handleConfirmLogDate}
        onRemoveCompletionTimestamp={handleRemoveCompletionTimestamp}
      />

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
