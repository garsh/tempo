import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  initDatabase,
  reorderTasks,
  saveTask,
  softDeleteTask,
  uncompleteTask,
} from './db/db';
import type { AppView, Task, TaskInput } from './types/task';
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
import { completedTasksOnDate, tasksDueOnDate } from './domain/calendar';
import {
  calendarExpandProgress,
  classifyCalendarPull,
  commitCalendarExpanded,
  readStoredCalendarExpanded,
  saveStoredCalendarExpanded,
} from './domain/calendarUi';
import { initDiagnostics, recordDiagEvent } from './domain/diagnostics';
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
import { CalendarAgendaView } from './components/CalendarAgendaView';
import { ChangeDateDialog } from './components/dialogs/ChangeDateDialog';
import { SkipOccurrenceDialog } from './components/dialogs/SkipOccurrenceDialog';
import { DeleteConfirmDialog } from './components/dialogs/DeleteConfirmDialog';
import { getSkipOccurrenceDate } from './domain/recurrence';
import { InstallPrompt } from './components/InstallPrompt';
import { TaskGroupHeader } from './components/shell/TaskGroupHeader';
import { OverflowMenu } from './components/menu/OverflowMenu';
import { triggerAppUpdate } from './components/PwaUpdatePrompt';
import {
  CalendarRange,
  Keyboard,
  LayoutList,
  MoreVertical,
  Plus,
  X,
} from 'lucide-react';

const EMPTY_TASKS: Task[] = [];
const ACTIVE_VIEW_STORAGE_KEY = 'tempo_active_view';

function readInitialView(): AppView {
  try {
    const raw = localStorage.getItem(ACTIVE_VIEW_STORAGE_KEY);
    if (raw === 'calendar-agenda') return 'calendar-agenda';
  } catch {
    /* ignore storage access errors */
  }
  return 'calendar-month';
}

export function App() {
  const [activeView, setActiveView] = useState<AppView>(readInitialView);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(formatDate(now));
  const [calExpanded, setCalExpanded] = useState<boolean>(readStoredCalendarExpanded);

  useEffect(() => {
    try {
      localStorage.setItem(ACTIVE_VIEW_STORAGE_KEY, activeView);
    } catch {
      /* ignore storage errors */
    }
  }, [activeView]);

  useEffect(() => {
    saveStoredCalendarExpanded(calExpanded);
  }, [calExpanded]);

  const calAreaRef = useRef<HTMLDivElement>(null);
  const monthViewRef = useRef<CalendarMonthHandle>(null);
  const calScrollRef = useRef<HTMLDivElement>(null);
  const calGestureRef = useRef<{
    startY: number;
    startX: number;
    startProgress: number;
    latestProgress: number;
    mode: 'pending' | 'drag' | 'scroll';
  } | null>(null);

  const [prefs, updatePrefs] = usePrefs();
  const [settingsPage, setSettingsPage] = useState<SettingsPageId>('root');
  const [overflowAnchor, setOverflowAnchor] = useState<DOMRect | null>(null);
  const [changeDateTask, setChangeDateTask] = useState<Task | null>(null);
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

  // PWA Web Share Target / URL capture (?text=&title=&url= or ?share=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('share') && !params.has('text') && !params.has('title')) return;
    const parts = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean);
    const combined = parts.join(' — ').trim();
    if (combined) {
      setEditingTask({ title: combined } as Task);
      setIsTaskModalOpen(true);
    }
    const url = new URL(window.location.href);
    ['share', 'text', 'title', 'url'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.pathname + url.search);
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
    if (activeView === 'calendar-month' && calSelectedDate) {
      return sortTasksForDailyView(tasksDueOnDate(activeTasks, calSelectedDate));
    }
    return [];
  }, [activeView, calSelectedDate, activeTasks]);

  const calCompletedTasks = useMemo(() => {
    if (activeView !== 'calendar-month' || !calSelectedDate) return [];
    return sortTasksForDailyView(completedTasksOnDate(activeTasks, calSelectedDate));
  }, [activeView, calSelectedDate, activeTasks]);

  const calOverdueTasks = useMemo(() => {
    if (activeView !== 'calendar-month' || !prefs.showOverdue) return [];
    const todayStr = formatDate(new Date());
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
    const displayedIds = new Set(displayedTasks.map((t) => t.id));
    return sortTasksForDailyView(overdue.filter((t) => !displayedIds.has(t.id)));
  }, [activeView, prefs.showOverdue, activeTasks, displayedTasks]);

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
    if (!area || activeView !== 'calendar-month') return;

    const onTouchStart = (e: TouchEvent) => {
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
  }, [activeView, calExpanded]);

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

  const handleConfirmChangeDate = async (taskId: string, newDueAt: string | null) => {
    await handlePatchTask(taskId, { dueAt: newDueAt });
    setChangeDateTask(null);
  };

  const handleConfirmSkipOccurrence = async (task: Task) => {
    const curDate = task.dueAt ? getDueDatePart(task.dueAt) : undefined;
    const nextDate = getSkipOccurrenceDate(task, curDate);
    if (nextDate) {
      await handlePatchTask(task.id, { dueAt: nextDate });
    }
    setSkipOccurrenceTask(null);
  };

  const handleConfirmDelete = async (taskId: string) => {
    setDeleteConfirmTask(null);
    await handleDelete(taskId);
  };

  const goView = useCallback((view: AppView) => {
    setActiveView(view);
    setOverflowAnchor(null);
  }, []);

  useKeyboardShortcuts({
    onCapture: openCapture,
    onEscape: () => {
      if (showShortcutsHelp) {
        setShowShortcutsHelp(false);
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
    },
    onGoCalendarMonth: () => goView('calendar-month'),
    onGoCalendarAgenda: () => goView('calendar-agenda'),
    onOpenHelp: () => setShowShortcutsHelp(true),
  });

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const calHeaderTitle = new Date(calYear, calMonth, 1).toLocaleDateString(undefined, {
    month: 'long',
    ...(calYear !== now.getFullYear() ? { year: 'numeric' } : {}),
  });
  const viewTitleText = activeView === 'calendar-month' ? calHeaderTitle : 'Agenda';

  const openOverflow = (e: React.MouseEvent<HTMLButtonElement>) => {
    setOverflowAnchor(e.currentTarget.getBoundingClientRect());
  };

  const renderTaskRows = (tasks: Task[], dense: boolean, reorderEnabled = false) => {
    return (
      <ReorderableTaskList
        tasks={tasks}
        enabled={reorderEnabled}
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
            onRequestChangeDate={setChangeDateTask}
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
      {/* Header */}
      <header className="shrink-0 flex items-center justify-between h-14 sm:h-16 px-3 sm:px-5 bg-tt-bg xl:bg-tt-surface border-b border-tt-border text-tt-text z-20">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (activeView === 'calendar-month') setCalExpanded((prev) => !prev);
              }}
              className="text-left text-[22px] sm:text-[25px] font-bold tracking-[-0.01em] truncate text-tt-text cursor-pointer hover:opacity-80 transition-opacity"
              title={activeView === 'calendar-month' ? 'Click to expand/collapse month' : undefined}
            >
              {viewTitleText}
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2">
            {/* Toggle Month / Agenda View */}
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors"
              onClick={() =>
                goView(activeView === 'calendar-month' ? 'calendar-agenda' : 'calendar-month')
              }
              title={activeView === 'calendar-month' ? 'Switch to Agenda view' : 'Switch to Month view'}
              aria-label={activeView === 'calendar-month' ? 'Switch to Agenda view' : 'Switch to Month view'}
            >
              {activeView === 'calendar-month' ? (
                <CalendarRange className="w-5 h-5 text-tt-secondary" strokeWidth={1.9} />
              ) : (
                <LayoutList className="w-5 h-5 text-tt-secondary" strokeWidth={1.9} />
              )}
            </button>

            {/* More / Overflow */}
            <button
              type="button"
              className="w-10 h-10 flex items-center justify-center text-tt-text hover:bg-tt-sidebar rounded-lg transition-colors"
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
              if (activeView !== 'calendar-month' || e.pointerType === 'touch') return;
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
              if (e.pointerType === 'touch') return;
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
              if (e.pointerType === 'touch') return;
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
            <div
              className={
                activeView === 'calendar-month'
                  ? 'flex-1 flex flex-col min-h-0 overflow-hidden'
                  : 'px-3 sm:px-5 space-y-3 flex-1 overflow-y-auto'
              }
            >
              <div className={activeView === 'calendar-month' ? 'shrink-0 px-3 sm:px-5' : 'space-y-3'}>
                {activeView === 'calendar-month' ? (
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
                    onMonthChange={(y, m) => {
                      setCalYear(y);
                      setCalMonth(m);
                    }}
                  />
                ) : (
                  <CalendarAgendaView
                    tasks={activeTasks}
                    onSelectTask={handleEdit}
                    selectedDateStr={calSelectedDate}
                    onSelectDate={setCalSelectedDate}
                    onMonthChange={(y, m) => {
                      setCalYear(y);
                      setCalMonth(m);
                    }}
                  />
                )}
              </div>
              {activeView === 'calendar-month' && calSelectedDate && (
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
                      {displayedTasks.length > 0 && (
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
          activeView,
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
                ['m / a', 'Calendar month / Agenda'],
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
      <ChangeDateDialog
        isOpen={!!changeDateTask}
        task={changeDateTask}
        onClose={() => setChangeDateTask(null)}
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
    </div>
  );
}

export default App;
