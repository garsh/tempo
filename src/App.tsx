import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  initDatabase,
  reorderTasks,
  saveTask,
  skipTaskOccurrence,
  softDeleteTask,
  uncompleteTask,
} from './db/db';
import type { Task, TaskInput } from './types/task';
import {
  addDays,
  formatDate,
  getDueDatePart,
  getNextUncompletedOccurrenceDate,
  isCompleted,
  isRecurring,
  projectTaskForDate,
} from './domain/recurrence';
import { sortTasksForDailyView } from './domain/sorting';
import { usePrefs } from './prefs/prefs';
import { completedTasksOnDate, shiftMonth, tasksDueOnDate } from './domain/calendar';
import {
  calendarExpandProgress,
  calendarHeaderTitle,
  classifyCalendarPull,
  commitCalendarExpanded,
  defaultDateForMonth,
  jumpToToday,
  readStoredCalendarExpanded,
  saveStoredCalendarExpanded,
  shiftWeek,
  stepCalendarView,
  type CalendarSwipeEvent,
} from './domain/calendarUi';
import { initDiagnostics, recordDiagEvent } from './domain/diagnostics';
import { shareTextFromParts, takeSharedText } from './pwa/shareText';
import { useAutoSync } from './hooks/useAutoSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { TaskCard } from './components/TaskCard';
import { ReorderableTaskList } from './components/ReorderableTaskList';
import { QuickAddSheet } from './components/QuickAddSheet';
import { SettingsPage, type SettingsPageId } from './components/settings/SettingsPage';
import {
  CALENDAR_EXPAND_DELTA,
  CalendarMonthView,
  type CalendarMonthHandle,
} from './components/CalendarMonthView';
import {
  SwipeableMonthTitle,
  type SwipeableMonthTitleHandle,
} from './components/calendar/SwipeableMonthTitle';
import { MonthYearPickerDialog } from './components/calendar/MonthYearPickerDialog';
import {
  ChangeDatePicker,
  type ChangeDatePickerHandle,
} from './components/dialogs/ChangeDatePicker';
import { SkipOccurrenceDialog } from './components/dialogs/SkipOccurrenceDialog';
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog';
import { InstallPrompt } from './components/InstallPrompt';
import { TaskGroupHeader } from './components/shell/TaskGroupHeader';
import { OverflowMenu } from './components/menu/OverflowMenu';
import { TaskSearchView } from './components/search/TaskSearchView';
import { triggerAppUpdate } from './components/PwaUpdatePrompt';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Keyboard,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react';

const EMPTY_TASKS: Task[] = [];

function TodayCalendarIcon({ day }: { day: number }) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="2.5" y="3.5" width="15" height="14" rx="3" />
      <path d="M6.5 2v2.5M13.5 2v2.5M2.5 7.5h15" />
      <text
        x="10"
        y="14.5"
        textAnchor="middle"
        fill="currentColor"
        stroke="none"
        fontSize="7.5"
        fontWeight="700"
      >
        {day}
      </text>
    </svg>
  );
}

export function App() {
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

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
  const calGestureRef = useRef<{
    startY: number;
    startX: number;
    startProgress: number;
    latestProgress: number;
    mode: 'pending' | 'drag' | 'scroll';
  } | null>(null);
  const isTaskReorderingRef = useRef(false);

  const handleDragActiveChange = useCallback((active: boolean) => {
    isTaskReorderingRef.current = active;
    if (active) {
      const g = calGestureRef.current;
      calGestureRef.current = null;
      if (g && g.mode === 'drag') {
        monthViewRef.current?.releasePull(() => {});
      }
    }
  }, []);

  const [prefs, updatePrefs] = usePrefs();
  const [settingsPage, setSettingsPage] = useState<SettingsPageId>('root');
  const [overflowAnchor, setOverflowAnchor] = useState<DOMRect | null>(null);
  const changeDatePickerRef = useRef<ChangeDatePickerHandle | null>(null);
  const [skipOccurrenceTask, setSkipOccurrenceTask] = useState<Task | null>(null);
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<Task | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  const openSettings = useCallback((page: SettingsPageId = 'root') => {
    setSettingsPage(page);
    setIsSettingsModalOpen(true);
  }, []);

  const [initialTasks, setInitialTasks] = useState<Task[] | null>(null);
  const [reorderOverride] = useState<Map<string, number> | null>(null);

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
  const allTasks = useMemo(() => {
    const base = liveTasks ?? initialTasks ?? EMPTY_TASKS;
    if (!reorderOverride || reorderOverride.size === 0) return base;
    return base.map((t) => {
      const order = reorderOverride.get(t.id);
      return order !== undefined ? { ...t, sortOrder: order } : t;
    });
  }, [liveTasks, initialTasks, reorderOverride]);

  const { status: syncStatus, refreshStatus: refreshSyncStatus, scheduleSync } = useAutoSync();
  const activeTasks = useMemo(() => allTasks.filter((t) => !t.deletedAt), [allTasks]);

  const displayedTasks = useMemo(() => {
    if (calSelectedDate) {
      return sortTasksForDailyView(tasksDueOnDate(activeTasks, calSelectedDate));
    }
    return [];
  }, [calSelectedDate, activeTasks]);

  const calCompletedTasks = useMemo(() => {
    if (!calSelectedDate) return [];
    return sortTasksForDailyView(completedTasksOnDate(activeTasks, calSelectedDate));
  }, [calSelectedDate, activeTasks]);

  const calOverdueTasks = useMemo(() => {
    if (!prefs.showOverdue) return [];
    const todayStr = formatDate(new Date());
    if (calSelectedDate !== todayStr) return [];
    const overdue: Task[] = [];
    for (const t of activeTasks) {
      if (t.deletedAt || isCompleted(t)) continue;
      if (isRecurring(t)) {
        const nextDate = getNextUncompletedOccurrenceDate(t, new Date());
        if (nextDate && nextDate < todayStr) {
          overdue.push(projectTaskForDate(t, nextDate));
        }
      } else if (t.dueAt && getDueDatePart(t.dueAt) < todayStr) {
        overdue.push(t);
      }
    }
    const displayedKeys = new Set(displayedTasks.map((t) => `${t.id}:${t.dueAt || ''}`));
    return sortTasksForDailyView(
      overdue.filter((t) => !displayedKeys.has(`${t.id}:${t.dueAt || ''}`))
    );
  }, [prefs.showOverdue, calSelectedDate, activeTasks, displayedTasks]);

  const formatCalendarDayHeading = (dateStr: string): string => {
    const todayStr = formatDate(new Date());
    if (dateStr === todayStr) return 'Today';
    if (dateStr === formatDate(addDays(new Date(), 1))) return 'Tomorrow';
    if (dateStr === formatDate(addDays(new Date(), -1))) return 'Yesterday';
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  useEffect(() => {
    const area = calAreaRef.current;
    if (!area) return;

    const onTouchStart = (e: TouchEvent) => {
      if (isTaskReorderingRef.current) return;
      const t = e.touches[0];
      if (!t) return;
      const startProgress = calExpanded ? 1 : 0;
      calGestureRef.current = {
        startY: t.clientY,
        startX: t.clientX,
        startProgress,
        latestProgress: startProgress,
        mode: 'pending',
      };
    };

    const onTouchMove = (e: TouchEvent) => {
      if (isTaskReorderingRef.current) return;
      const g = calGestureRef.current;
      const t = e.touches[0];
      if (!g || !t) return;

      const dy = t.clientY - g.startY;
      const dx = t.clientX - g.startX;

      if (g.mode === 'pending') {
        const scroller = calScrollRef.current;
        const nextMode = classifyCalendarPull({
          mode: g.mode,
          dx,
          dy,
          atTop: !scroller || scroller.scrollTop <= 1,
          onHeader: scroller ? !scroller.contains(e.target as Node) : true,
          expanded: calExpanded,
        });
        if (nextMode === 'pending') return;
        g.mode = nextMode;
        if (g.mode !== 'drag') return;
      }

      if (g.mode === 'drag') {
        e.preventDefault();
        const next = calendarExpandProgress(g.startProgress, dy, CALENDAR_EXPAND_DELTA);
        g.latestProgress = next;
        monthViewRef.current?.setPullProgress(next);
      }
    };

    const finishDrag = () => {
      if (isTaskReorderingRef.current) {
        calGestureRef.current = null;
        return;
      }
      const g = calGestureRef.current;
      calGestureRef.current = null;
      if (!g || g.mode !== 'drag') return;
      const shouldExpand = commitCalendarExpanded(g.startProgress, g.latestProgress);
      monthViewRef.current?.releasePull(() => {
        setCalExpanded(shouldExpand);
      });
    };

    area.addEventListener('touchstart', onTouchStart, { passive: true });
    area.addEventListener('touchmove', onTouchMove, { passive: false });
    area.addEventListener('touchend', finishDrag, { passive: true });
    area.addEventListener('touchcancel', finishDrag, { passive: true });
    return () => {
      area.removeEventListener('touchstart', onTouchStart);
      area.removeEventListener('touchmove', onTouchMove);
      area.removeEventListener('touchend', finishDrag);
      area.removeEventListener('touchcancel', finishDrag);
    };
  }, [calExpanded, isSearchOpen]);

  const openSearch = useCallback(() => {
    calGestureRef.current = null;
    savedCalScrollTopRef.current = calScrollRef.current?.scrollTop ?? null;
    setOverflowAnchor(null);
    setIsSearchOpen(true);
  }, []);

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
      setSearchQuery('');
      if (expandCompleted) {
        setCollapsedGroups((prev) =>
          prev['cal-completed'] ? { ...prev, 'cal-completed': false } : prev
        );
      }
      const [y, m] = dateStr.split('-').map(Number);
      if (!Number.isNaN(y) && !Number.isNaN(m)) {
        applyCalendarTarget({ year: y, monthIndex: m - 1, dateStr });
      }
    },
    [applyCalendarTarget]
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
    await completeTask(id, dateStr);
    scheduleSync();
  }, [scheduleSync]);

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

  const handleSave = async (taskData: TaskInput) => {
    await saveTask(taskData);
    setEditingTask(null);
    scheduleSync();
  };

  const handlePatchTask = async (
    id: string,
    patch: Partial<{
      dueAt: string | null;
      recurrence: Task['recurrence'];
      notes: string;
      title: string;
    }>
  ) => {
    const existing = await db.tasks.get(id);
    if (!existing) return;
    await saveTask({
      id: existing.id,
      title: patch.title ?? existing.title,
      notes: patch.notes ?? existing.notes,
      listId: existing.listId,
      dueAt: patch.dueAt !== undefined ? patch.dueAt : existing.dueAt,
      recurrence: patch.recurrence !== undefined ? patch.recurrence : existing.recurrence,
    });
    scheduleSync();
  };

  const handleRequestChangeDate = useCallback((task: Task, anchorRect?: DOMRect) => {
    changeDatePickerRef.current?.open(task, anchorRect);
  }, []);

  const handleConfirmChangeDate = async (taskId: string, newDueAt: string | null) => {
    await handlePatchTask(taskId, { dueAt: newDueAt });
  };

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
    !isTaskModalOpen &&
    !isSettingsModalOpen &&
    !overflowAnchor &&
    !showShortcutsHelp &&
    !skipOccurrenceTask &&
    !deleteConfirmTask &&
    !isMonthYearPickerOpen;

  useKeyboardShortcuts(
    {
      onCapture: openCapture,
      onSearch: canOpenSearch ? openSearch : undefined,
      onEscape: () => {
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
    !isMonthYearPickerOpen
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

  const renderTaskRows = (tasks: Task[], dense: boolean, reorderEnabled = false) => {
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
            dense={dense}
            showDetails={prefs.showDetails}
            onSelect={handleEdit}
            onComplete={handleComplete}
            onUncomplete={handleUncomplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onRequestChangeDate={handleRequestChangeDate}
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
          onRequestSkipOccurrence={setSkipOccurrenceTask}
          onRequestDelete={setDeleteConfirmTask}
          inputRef={searchInputRef}
        />
      ) : (
        <>
          {/* Header */}
          <header className="shrink-0 flex items-center justify-between gap-1 sm:gap-2 h-14 sm:h-16 px-2.5 sm:px-5 bg-tt-bg xl:bg-tt-surface border-b border-tt-border text-tt-text z-20">
            <div className="flex items-center gap-0.5 sm:gap-1 min-w-0">
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
            </div>

            <div className="shrink-0 flex items-center gap-0.5 sm:gap-1">
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
          <div
            ref={calAreaRef}
            onPointerDown={(e) => {
              if (e.pointerType === 'touch' || isTaskReorderingRef.current) return;
              const startProgress = calExpanded ? 1 : 0;
              calGestureRef.current = {
                startY: e.clientY,
                startX: e.clientX,
                startProgress,
                latestProgress: startProgress,
                mode: 'pending',
              };
            }}
            onPointerMove={(e) => {
              if (e.pointerType === 'touch' || isTaskReorderingRef.current) return;
              const g = calGestureRef.current;
              if (!g) return;

              const dy = e.clientY - g.startY;
              const dx = e.clientX - g.startX;

              if (g.mode === 'pending') {
                const scroller = calScrollRef.current;
                const nextMode = classifyCalendarPull({
                  mode: g.mode,
                  dx,
                  dy,
                  atTop: !scroller || scroller.scrollTop <= 1,
                  onHeader: scroller ? !scroller.contains(e.target as Node) : true,
                  expanded: calExpanded,
                });
                if (nextMode === 'pending') return;
                if (nextMode === 'scroll') {
                  calGestureRef.current = null;
                  return;
                }
                g.mode = 'drag';
              }

              if (g.mode === 'drag') {
                const next = calendarExpandProgress(g.startProgress, dy, CALENDAR_EXPAND_DELTA);
                g.latestProgress = next;
                monthViewRef.current?.setPullProgress(next);
              }
            }}
            onPointerUp={(e) => {
              if (e.pointerType === 'touch' || isTaskReorderingRef.current) return;
              const g = calGestureRef.current;
              calGestureRef.current = null;
              if (!g || g.mode !== 'drag') return;
              const shouldExpand = commitCalendarExpanded(g.startProgress, g.latestProgress);
              monthViewRef.current?.releasePull(() => {
                setCalExpanded(shouldExpand);
              });
            }}
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
                          {!collapsedGroups['cal-overdue'] && renderTaskRows(calOverdueTasks, false)}
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
                          {renderTaskRows(displayedTasks, false, true)}
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
                          {!collapsedGroups['cal-completed'] && renderTaskRows(calCompletedTasks, false)}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
        </>
      )}

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
        defaultDueAt={calSelectedDate ?? undefined}
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
          groupBy: prefs.groupBy,
          sortBy: prefs.sortBy,
          hideCompleted: prefs.hideCompleted,
        }}
      />

      <OverflowMenu
        open={!!overflowAnchor}
        anchor={overflowAnchor}
        showDetails={prefs.showDetails}
        hideCompleted={prefs.hideCompleted}
        showOverdue={prefs.showOverdue}
        onClose={() => setOverflowAnchor(null)}
        onSearch={openSearch}
        onToggleDetails={() => updatePrefs({ showDetails: !prefs.showDetails })}
        onToggleHideCompleted={() => updatePrefs({ hideCompleted: !prefs.hideCompleted })}
        onToggleShowOverdue={() => updatePrefs({ showOverdue: !prefs.showOverdue })}
        onSettings={() => openSettings('root')}
        onUpdateApp={triggerAppUpdate}
      />

      <InstallPrompt />

      {showShortcutsHelp && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
          <div className="w-full max-w-md bg-tt-elevated border border-tt-border rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-tt-text inline-flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-tt-blue" />
                Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="p-1.5 text-tt-secondary hover:text-tt-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2 text-xs text-tt-text">
              {[
                ['n / c', 'New task (capture)'],
                ['/', 'Search tasks'],
                ['Esc', 'Close modals'],
                ['?', 'This help'],
              ].map(([key, desc]) => (
                <li key={key} className="flex items-center justify-between gap-3">
                  <span className="text-tt-secondary">{desc}</span>
                  <kbd className="px-2 py-1 rounded-lg bg-tt-sidebar text-tt-text font-mono text-[11px]">
                    {key}
                  </kbd>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* Swipe Action Dialogs */}
      <ChangeDatePicker
        ref={changeDatePickerRef}
        onSave={handleConfirmChangeDate}
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
