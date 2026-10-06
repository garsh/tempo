import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  saveFolder,
  saveList,
  saveSavedFilter,
  saveTask,
  initDatabase,
  softDeleteFolder,
  softDeleteList,
  softDeleteSavedFilter,
  softDeleteTask,
  togglePinTask,
  toggleSubtask,
} from './db/db';
import type { AppView, Folder, SavedFilter, Task, TaskInput, TaskList } from './types/task';
import { INBOX_LIST_ID } from './types/task';
import { formatDate, isCompleted } from './domain/recurrence';
import {
  filterByListId,
  filterInbox,
  filterNext7Days,
  filterToday,
  filterTomorrow,
  openTasks,
} from './domain/smartLists';
import { matchesSearch, matchesTag, sortTasksForDailyView } from './domain/sorting';
import { tasksDueOnDate } from './domain/calendar';
import { applySavedFilter } from './domain/filters';
import { useDueNotifications } from './hooks/useDueNotifications';
import { useAutoSync } from './hooks/useAutoSync';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { TaskCard } from './components/TaskCard';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
import { TaskDetailPane } from './components/TaskDetailPane';
import { CalendarMonthView } from './components/CalendarMonthView';
import { CalendarAgendaView } from './components/CalendarAgendaView';
import { QuickCaptureModal } from './components/QuickCaptureModal';
import { KanbanBoard } from './components/KanbanBoard';
import { SavedFilterModal } from './components/SavedFilterModal';
import { InstallPrompt } from './components/InstallPrompt';
import { IconRail } from './components/shell/IconRail';
import { SidebarNav } from './components/shell/SidebarNav';
import { MobileBottomBar } from './components/shell/MobileBottomBar';
import { EmptyInboxState } from './components/shell/EmptyInboxState';
import { TaskGroupHeader } from './components/shell/TaskGroupHeader';
import { QuickAddBar } from './components/shell/QuickAddBar';
import { groupTasksForListView } from './domain/taskGroups';
import {
  Plus,
  Search,
  Menu,
  Keyboard,
  X,
  MoreVertical,
} from 'lucide-react';

function resolveViewTitle(
  view: AppView,
  lists: TaskList[],
  filters: SavedFilter[] = []
): string {
  if (view.startsWith('filter:')) {
    const id = view.slice(7);
    return filters.find((f) => f.id === id)?.name ?? 'Saved filter';
  }
  return viewTitle(view, lists);
}

function viewTitle(view: AppView, lists: TaskList[]): string {
  if (view === 'today') return 'Today';
  if (view === 'tomorrow') return 'Tomorrow';
  if (view === 'next7') return 'Next 7 Days';
  if (view === 'inbox') return 'Inbox';
  if (view === 'all') return 'All Open';
  if (view === 'completed') return 'Completed';
  if (view === 'calendar-month') return 'Calendar';
  if (view === 'calendar-agenda') return 'Agenda';
  if (view === 'board-status') return 'Board · Status';
  if (view === 'board-list') return 'Board · Lists';
  if (view.startsWith('list:')) {
    const id = view.slice(5);
    return lists.find((l) => l.id === id)?.name ?? 'List';
  }
  if (view.startsWith('filter:')) return 'Saved filter';
  return 'Tasks';
}

const EMPTY_SAVED_FILTERS: SavedFilter[] = [];
const EMPTY_TASKS: Task[] = [];
const EMPTY_LISTS: TaskList[] = [];
const EMPTY_FOLDERS: Folder[] = [];

export function App() {
  const [activeView, setActiveView] = useState<AppView>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [isQuickCaptureOpen, setIsQuickCaptureOpen] = useState(false);
  const [quickCaptureText, setQuickCaptureText] = useState('');
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [editingFilter, setEditingFilter] = useState<SavedFilter | null>(null);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [detailOpenMobile, setDetailOpenMobile] = useState(false);

  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newListFolderId, setNewListFolderId] = useState('');

  const now = new Date();
  const [calYear, setCalYear] = useState(now.getFullYear());
  const [calMonth, setCalMonth] = useState(now.getMonth());
  const [calSelectedDate, setCalSelectedDate] = useState<string | null>(formatDate(now));

  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void initDatabase();
  }, []);

  // PWA Web Share Target / URL capture (?text=&title=&url= or ?share=1)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (!params.has('share') && !params.has('text') && !params.has('title')) return;
    const parts = [params.get('title'), params.get('text'), params.get('url')].filter(Boolean);
    const combined = parts.join(' — ').trim();
    if (combined) {
      setQuickCaptureText(combined);
      setIsQuickCaptureOpen(true);
    }
    // Clean share params without reload
    const url = new URL(window.location.href);
    ['share', 'text', 'title', 'url'].forEach((k) => url.searchParams.delete(k));
    window.history.replaceState({}, '', url.pathname + url.search);
  }, []);

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) ?? EMPTY_TASKS;
  const allLists = useLiveQuery(() => db.lists.toArray(), []) ?? EMPTY_LISTS;
  const allFolders = useLiveQuery(() => db.folders.toArray(), []) ?? EMPTY_FOLDERS;
  const allSavedFilters = useLiveQuery(() => db.savedFilters.toArray(), []) ?? EMPTY_SAVED_FILTERS;

  useDueNotifications(allTasks);

  const { status: syncStatus, syncNow } = useAutoSync();
  const activeLists = [...allLists]
    .filter((l) => !l.deletedAt)
    .sort((a, b) => {
      if (a.id === INBOX_LIST_ID) return -1;
      if (b.id === INBOX_LIST_ID) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    });

  const listNameById = new Map(activeLists.map((l) => [l.id, l.name]));
  const userLists = activeLists.filter((l) => l.id !== INBOX_LIST_ID);
  const activeFolders = [...allFolders]
    .filter((f) => !f.deletedAt)
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name));
  const unfiledLists = userLists.filter((l) => !l.folderId);
  const activeSavedFilters = [...allSavedFilters]
    .filter((f) => !f.deletedAt)
    .sort((a, b) => a.name.localeCompare(b.name));

  const activeTasks = allTasks.filter((t) => !t.deletedAt);
  const open = openTasks(activeTasks);
  const completedOneOffs = activeTasks.filter((t) => isCompleted(t));

  const todayCount = filterToday(activeTasks).length;
  const tomorrowCount = filterTomorrow(activeTasks).length;
  const next7Count = filterNext7Days(activeTasks).length;
  const inboxCount = filterInbox(activeTasks).length;

  const allTags = Array.from(new Set(open.flatMap((t) => t.tags || []))).filter(Boolean);

  const isCalendar =
    activeView === 'calendar-month' || activeView === 'calendar-agenda';
  const isBoard = activeView === 'board-status' || activeView === 'board-list';

  const baseForView = useMemo((): Task[] => {
    switch (activeView) {
      case 'today':
        return filterToday(activeTasks);
      case 'tomorrow':
        return filterTomorrow(activeTasks);
      case 'next7':
        return filterNext7Days(activeTasks);
      case 'inbox':
        return filterInbox(activeTasks);
      case 'all':
        return open;
      case 'completed':
        return [...completedOneOffs].sort(
          (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
        );
      case 'calendar-month':
      case 'calendar-agenda':
      case 'board-status':
      case 'board-list':
        return open;
      default:
        if (activeView.startsWith('list:')) {
          return filterByListId(activeTasks, activeView.slice(5));
        }
        if (activeView.startsWith('filter:')) {
          const fid = activeView.slice(7);
          const sf = allSavedFilters.find((f) => f.id === fid && !f.deletedAt);
          if (!sf) return open;
          return applySavedFilter(activeTasks, sf);
        }
        return open;
    }
  }, [activeView, activeTasks, open, completedOneOffs, allSavedFilters]);

  const displayedTasks = useMemo(() => {
    if (isCalendar && activeView === 'calendar-month' && calSelectedDate) {
      let list = tasksDueOnDate(activeTasks, calSelectedDate);
      list = list.filter((t) => matchesSearch(t, searchQuery) && matchesTag(t, selectedTag));
      return sortTasksForDailyView(list);
    }

    let list = baseForView.filter(
      (t) => matchesSearch(t, searchQuery) && matchesTag(t, selectedTag)
    );
    if (activeView !== 'completed' && !isCalendar) {
      list = sortTasksForDailyView(list);
    }
    if (activeView === 'calendar-agenda') {
      return sortTasksForDailyView(list);
    }
    return list;
  }, [
    baseForView,
    searchQuery,
    selectedTag,
    activeView,
    isCalendar,
    calSelectedDate,
    activeTasks,
  ]);

  const selectedTask =
    selectedTaskId != null
      ? activeTasks.find((t) => t.id === selectedTaskId) || null
      : null;

  const selectTask = useCallback((task: Task) => {
    setSelectedTaskId(task.id);
    setDetailOpenMobile(true);
  }, []);

  const openCapture = useCallback(() => {
    setQuickCaptureText('');
    setIsQuickCaptureOpen(true);
  }, []);

  const handleComplete = async (id: string) => {
    await completeTask(id);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await softDeleteTask(id);
    if (selectedTaskId === id) {
      setSelectedTaskId(null);
      setDetailOpenMobile(false);
    }
  };

  const handleTogglePin = async (id: string) => {
    await togglePinTask(id);
  };

  const handleSave = async (taskData: TaskInput) => {
    const saved = await saveTask(taskData);
    setEditingTask(null);
    setSelectedTaskId(saved.id);
  };

  const handlePatchTask = async (
    id: string,
    patch: Partial<{
      dueAt: string | null;
      priority: Task['priority'];
      recurrence: Task['recurrence'];
      notes: string;
      title: string;
      pinned: boolean;
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
      priority: patch.priority !== undefined ? patch.priority : existing.priority,
      pinned: patch.pinned !== undefined ? patch.pinned : existing.pinned,
      tags: existing.tags,
      subtasks: existing.subtasks,
      recurrence: patch.recurrence !== undefined ? patch.recurrence : existing.recurrence,
    });
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const list = await saveList({ name, folderId: newListFolderId || null });
    setNewListName('');
    setNewListFolderId('');
    setShowNewListInput(false);
    setActiveView(`list:${list.id}`);
    setSidebarOpen(false);
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newFolderName.trim();
    if (!name) return;
    await saveFolder({ name });
    setNewFolderName('');
    setShowNewFolderInput(false);
  };

  const handleDeleteList = async (list: TaskList) => {
    if (list.id === INBOX_LIST_ID) return;
    await softDeleteList(list.id);
    if (activeView === `list:${list.id}`) setActiveView('today');
  };

  const handleDeleteFolder = async (folder: Folder) => {
    await softDeleteFolder(folder.id);
  };

  const handleToggleSubtask = async (taskId: string, subtaskId: string) => {
    await toggleSubtask(taskId, subtaskId);
  };

  const handleSaveFilter = async (filter: {
    id?: string;
    name: string;
    match: 'and' | 'or';
    criteria: SavedFilter['criteria'];
  }) => {
    const saved = await saveSavedFilter(filter);
    setActiveView(`filter:${saved.id}`);
  };

  const handleDeleteFilter = async (filter: SavedFilter) => {
    await softDeleteSavedFilter(filter.id);
    if (activeView === `filter:${filter.id}`) setActiveView('today');
  };

  const handleMoveToList = async (taskId: string, listId: string) => {
    const task = await db.tasks.get(taskId);
    if (!task || task.listId === listId) return;
    await saveTask({
      id: task.id,
      title: task.title,
      notes: task.notes,
      listId,
      dueAt: task.dueAt,
      priority: task.priority,
      pinned: task.pinned,
      tags: task.tags,
      subtasks: task.subtasks,
      recurrence: task.recurrence,
    });
  };

  const goView = useCallback((view: AppView) => {
    setActiveView(view);
    setSidebarOpen(false);
  }, []);

  useKeyboardShortcuts({
    onCapture: openCapture,
    onSearchFocus: () => searchRef.current?.focus(),
    onEscape: () => {
      if (showShortcutsHelp) {
        setShowShortcutsHelp(false);
        return;
      }
      if (isQuickCaptureOpen) {
        setIsQuickCaptureOpen(false);
        return;
      }
      if (isFilterModalOpen) {
        setIsFilterModalOpen(false);
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
      if (detailOpenMobile) {
        setDetailOpenMobile(false);
        return;
      }
      if (sidebarOpen) {
        setSidebarOpen(false);
        return;
      }
      setSelectedTaskId(null);
    },
    onGoToday: () => goView('today'),
    onGoTomorrow: () => goView('tomorrow'),
    onGoNext7: () => goView('next7'),
    onGoInbox: () => goView('inbox'),
    onGoCalendarMonth: () => goView('calendar-month'),
    onGoCalendarAgenda: () => goView('calendar-agenda'),
    onToggleSidebar: () => setSidebarOpen((v) => !v),
    onNextTask: () => {
      if (displayedTasks.length === 0) return;
      const idx = displayedTasks.findIndex((t) => t.id === selectedTaskId);
      const next = displayedTasks[Math.min(idx + 1, displayedTasks.length - 1)] ?? displayedTasks[0];
      selectTask(next);
    },
    onPrevTask: () => {
      if (displayedTasks.length === 0) return;
      const idx = displayedTasks.findIndex((t) => t.id === selectedTaskId);
      const prev =
        displayedTasks[Math.max(idx - 1, 0)] ?? displayedTasks[displayedTasks.length - 1];
      selectTask(prev);
    },
    onCompleteSelected: () => {
      if (selectedTaskId) void handleComplete(selectedTaskId);
    },
    onEditSelected: () => {
      if (selectedTask) handleEdit(selectedTask);
    },
    onOpenHelp: () => setShowShortcutsHelp(true),
  });



  const defaultListForNew =
    activeView === 'inbox'
      ? INBOX_LIST_ID
      : activeView.startsWith('list:')
        ? activeView.slice(5)
        : INBOX_LIST_ID;

  const showListNameOnCards =
    activeView === 'today' ||
    activeView === 'tomorrow' ||
    activeView === 'next7' ||
    activeView === 'all' ||
    activeView === 'completed' ||
    isCalendar ||
    activeView.startsWith('filter:');

  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});
  const taskGroups = useMemo(() => {
    if (isCalendar || isBoard || activeView === 'completed') return [];
    return groupTasksForListView(displayedTasks, {
      includeCompleted: activeView === 'today' || activeView === 'all' || activeView.startsWith('list:'),
    });
  }, [displayedTasks, isCalendar, isBoard, activeView]);

  const toggleGroup = (id: string) => {
    setCollapsedGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const viewTitleText = resolveViewTitle(activeView, activeLists, activeSavedFilters);

  /**
   * TickTick new-install empty Inbox (mobile): title row + illustration + FAB + tabs only.
   * Layout only — colors always come from the system theme (prefers-color-scheme).
   */
  const emptyInbox = activeView === 'inbox' && inboxCount === 0;

  const sidebar = (
    <SidebarNav
      activeView={activeView}
      todayCount={todayCount}
      tomorrowCount={tomorrowCount}
      next7Count={next7Count}
      inboxCount={inboxCount}
      openCount={open.length}
      completedCount={completedOneOffs.length}
      activeFolders={activeFolders}
      unfiledLists={unfiledLists}
      userLists={userLists}
      activeSavedFilters={activeSavedFilters}
      allTags={allTags}
      selectedTag={selectedTag}
      showNewListInput={showNewListInput}
      showNewFolderInput={showNewFolderInput}
      newListName={newListName}
      newFolderName={newFolderName}
      newListFolderId={newListFolderId}
      onGo={goView}
      onSelectTag={setSelectedTag}
      onNewList={handleCreateList}
      onNewFolder={handleCreateFolder}
      onDeleteList={handleDeleteList}
      onDeleteFolder={handleDeleteFolder}
      onDeleteFilter={handleDeleteFilter}
      setShowNewListInput={setShowNewListInput}
      setShowNewFolderInput={setShowNewFolderInput}
      setNewListName={setNewListName}
      setNewFolderName={setNewFolderName}
      setNewListFolderId={setNewListFolderId}
      onOpenFilterModal={() => {
        setEditingFilter(null);
        setIsFilterModalOpen(true);
      }}
      onEditFilter={(f) => {
        setEditingFilter(f);
        setIsFilterModalOpen(true);
      }}
    />
  );

  const renderTaskRows = (tasks: Task[], dense: boolean) =>
    tasks.map((task) => (
      <TaskCard
        key={task.id}
        task={task}
        listName={showListNameOnCards ? listNameById.get(task.listId) : undefined}
        showListName={showListNameOnCards}
        selected={selectedTaskId === task.id}
        dense={dense}
        onComplete={handleComplete}
        onSelect={selectTask}
        onEdit={handleEdit}
        onDelete={handleDelete}
        onTogglePin={handleTogglePin}
        onToggleSubtask={handleToggleSubtask}
      />
    ));

  return (
    <div className="h-dvh bg-tt-bg xl:bg-tt-surface text-tt-text flex overflow-hidden">
      <IconRail
        activeView={activeView}
        syncPhase={syncStatus.phase}
        onTasks={() => goView('today')}
        onCalendar={() => goView('calendar-month')}
        onSearch={() => searchRef.current?.focus()}
        onSync={() => void syncNow(true)}
        onSettings={() => setIsSettingsModalOpen(true)}
      />

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-[232px] shrink-0 flex-col border-r border-tt-border">
        {sidebar}
      </aside>

      {/* Mobile drawer */}
      {sidebarOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="w-[280px] max-w-[85vw] bg-tt-sidebar shadow-2xl flex flex-col">
            <div className="flex items-center gap-3 px-4 py-3 border-b border-tt-border">
              <div className="w-9 h-9 rounded-full bg-tt-blue text-white flex items-center justify-center font-bold">
                T
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-semibold">Tempo</div>
                <div className="text-[11px] text-tt-secondary">Local-first tasks</div>
              </div>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-1.5 text-tt-secondary hover:text-tt-text"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-0">{sidebar}</div>
          </div>
          <div className="flex-1 bg-black/40" onClick={() => setSidebarOpen(false)} />
        </div>
      )}

      <div
        className="flex-1 flex flex-col min-w-0 min-h-0 bg-tt-bg xl:bg-tt-surface"
        data-tempo-empty-inbox-view={emptyInbox ? '1' : '0'}
      >
        {/* Mobile top bar — TickTick: hamburger | title | ⋮ */}
        <header className="xl:hidden shrink-0 flex items-center gap-1 pl-1 pr-1 h-16 bg-tt-bg text-tt-text">
          <button
            type="button"
            className="w-11 h-11 flex items-center justify-center text-tt-text"
            onClick={() => setSidebarOpen(true)}
            title="Menu"
            aria-label="Menu"
          >
            <Menu className="w-6 h-6" strokeWidth={1.75} />
          </button>
          <h1 className="flex-1 min-w-0 text-[21px] font-bold tracking-[-0.01em] truncate text-tt-text">
            {viewTitleText}
          </h1>
          <button
            type="button"
            className="w-11 h-11 flex items-center justify-center text-tt-text"
            onClick={() => setShowShortcutsHelp(true)}
            title="More"
            aria-label="More"
          >
            <MoreVertical className="w-5 h-5" strokeWidth={2.25} />
          </button>
        </header>

        <div className="flex-1 flex min-h-0">
          {/* Center pane */}
          <section className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg xl:bg-tt-surface">
            {/* Desktop list header */}
            <div className="hidden xl:flex shrink-0 items-center justify-between gap-3 px-5 pt-4 pb-2">
              <h1 className="text-[22px] font-bold tracking-tight">{viewTitleText}</h1>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setShowShortcutsHelp(true)}
                  className="p-2 text-tt-secondary hover:bg-tt-sidebar rounded-lg"
                  title="Shortcuts"
                >
                  <Keyboard className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  className="p-2 text-tt-secondary hover:bg-tt-sidebar rounded-lg"
                  title="More"
                >
                  <MoreVertical className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Search (desktop + when focused on mobile via tab) */}
            <div
              className={`shrink-0 px-3 sm:px-5 pb-2 ${emptyInbox ? 'hidden xl:block' : ''}`}
            >
              <div className="relative hidden xl:block mb-2">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-tt-muted" />
                <input
                  ref={searchRef}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search"
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-tt-input border border-transparent focus:border-tt-blue focus:bg-tt-elevated text-sm outline-none placeholder:text-tt-muted"
                />
              </div>
              {!isCalendar && !isBoard && activeView !== 'completed' && (
                <div className="hidden xl:block">
                  <QuickAddBar onClick={openCapture} />
                </div>
              )}
              {/* Mobile search field when on search from bottom bar — always available collapsed */}
              {!emptyInbox && (
                <div className="xl:hidden mb-1">
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search tasks"
                    aria-label="Search tasks"
                    className="w-full px-3 py-2 rounded-xl bg-tt-input text-sm outline-none focus:ring-1 focus:ring-tt-blue placeholder:text-tt-muted"
                  />
                </div>
              )}
            </div>

            <div
              className={`flex-1 overflow-y-auto min-h-0 xl:pb-4 ${emptyInbox ? 'flex flex-col xl:block' : 'pb-20'}`}
            >
              {emptyInbox ? (
                <>
                  <div className="xl:hidden flex-1 flex flex-col">
                    <EmptyInboxState />
                  </div>
                  <p className="hidden xl:block text-sm text-tt-muted px-4 py-10 text-center">
                    No tasks here — add one
                  </p>
                </>
              ) : isBoard ? (
                <div className="px-3 sm:px-5">
                  <div className="flex gap-2 mb-3">
                    <button
                      type="button"
                      onClick={() => goView('board-status')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeView === 'board-status'
                          ? 'bg-tt-blue text-white'
                          : 'bg-tt-sidebar text-tt-secondary'
                      }`}
                    >
                      By status
                    </button>
                    <button
                      type="button"
                      onClick={() => goView('board-list')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeView === 'board-list'
                          ? 'bg-tt-blue text-white'
                          : 'bg-tt-sidebar text-tt-secondary'
                      }`}
                    >
                      By list
                    </button>
                  </div>
                  <KanbanBoard
                    tasks={displayedTasks}
                    lists={activeLists}
                    mode={activeView === 'board-list' ? 'list' : 'status'}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={selectTask}
                    onMoveToList={handleMoveToList}
                  />
                </div>
              ) : isCalendar ? (
                <div className="px-3 sm:px-5 space-y-3">
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => goView('calendar-month')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeView === 'calendar-month'
                          ? 'bg-tt-blue text-white'
                          : 'bg-tt-sidebar text-tt-secondary'
                      }`}
                    >
                      Month
                    </button>
                    <button
                      type="button"
                      onClick={() => goView('calendar-agenda')}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold ${
                        activeView === 'calendar-agenda'
                          ? 'bg-tt-blue text-white'
                          : 'bg-tt-sidebar text-tt-secondary'
                      }`}
                    >
                      Agenda
                    </button>
                  </div>
                  {activeView === 'calendar-month' ? (
                    <CalendarMonthView
                      year={calYear}
                      monthIndex={calMonth}
                      selectedDateStr={calSelectedDate}
                      tasks={activeTasks}
                      onSelectDate={setCalSelectedDate}
                      onMonthChange={(y, m) => {
                        setCalYear(y);
                        setCalMonth(m);
                      }}
                      onSelectTask={selectTask}
                    />
                  ) : (
                    <CalendarAgendaView
                      tasks={activeTasks}
                      onSelectTask={selectTask}
                      selectedTaskId={selectedTaskId}
                      selectedDateStr={calSelectedDate}
                      onSelectDate={setCalSelectedDate}
                    />
                  )}
                  {activeView === 'calendar-month' && calSelectedDate && (
                    <div className="border-t border-tt-border pt-2">
                      {renderTaskRows(displayedTasks, true)}
                      {displayedTasks.length === 0 && (
                        <p className="text-sm text-tt-muted px-4 py-6 text-center">No tasks this day</p>
                      )}
                    </div>
                  )}
                </div>
              ) : activeView === 'completed' ? (
                <div>
                  {displayedTasks.length === 0 ? (
                    <p className="text-sm text-tt-muted px-4 py-10 text-center">No completed tasks</p>
                  ) : (
                    renderTaskRows(displayedTasks, false)
                  )}
                </div>
              ) : taskGroups.length === 0 ? (
                <p className="text-sm text-tt-muted px-4 py-10 text-center">No tasks here — add one</p>
              ) : (
                taskGroups.map((g) => {
                  const collapsed = !!collapsedGroups[g.id];
                  return (
                    <div key={g.id}>
                      <TaskGroupHeader
                        label={g.label}
                        count={g.tasks.length}
                        collapsed={collapsed}
                        onToggle={() => toggleGroup(g.id)}
                        tone={g.id === 'overdue' ? 'overdue' : 'default'}
                      />
                      {!collapsed && renderTaskRows(g.tasks, true)}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Desktop detail */}
          <aside className="hidden xl:flex w-[340px] shrink-0 flex-col border-l border-tt-border">
            <TaskDetailPane
              task={selectedTask}
              listName={selectedTask ? listNameById.get(selectedTask.listId) : undefined}
              onClose={() => setSelectedTaskId(null)}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onToggleSubtask={handleToggleSubtask}
              onPatch={handlePatchTask}
            />
          </aside>
        </div>

        {/* Mobile FAB */}
        <button
          type="button"
          onClick={openCapture}
          className="xl:hidden fixed right-5 z-40 w-14 h-14 rounded-full bg-tt-blue hover:bg-tt-blue-hover text-white flex items-center justify-center shadow-[0_6px_18px_rgba(71,114,250,0.35)]"
          style={{ bottom: 'calc(67px + env(safe-area-inset-bottom))' }}
          title="Add task"
          aria-label="Add task"
        >
          <Plus className="w-7 h-7" strokeWidth={2.25} />
        </button>

        <MobileBottomBar
          activeView={activeView}
          onTasks={() => goView(emptyInbox ? 'inbox' : 'today')}
          onCalendar={() => goView('calendar-month')}
          onSettings={() => setIsSettingsModalOpen(true)}
        />
      </div>

      {/* Mobile detail drawer */}
      {detailOpenMobile && (
        <div className="xl:hidden fixed inset-0 z-50 flex justify-end">
          <div className="flex-1 bg-black/40" onClick={() => setDetailOpenMobile(false)} />
          <div className="w-full max-w-md bg-tt-elevated shadow-2xl">
            <TaskDetailPane
              task={selectedTask}
              listName={selectedTask ? listNameById.get(selectedTask.listId) : undefined}
              onClose={() => setDetailOpenMobile(false)}
              onComplete={handleComplete}
              onEdit={handleEdit}
              onDelete={handleDelete}
              onTogglePin={handleTogglePin}
              onToggleSubtask={handleToggleSubtask}
              onPatch={handlePatchTask}
            />
          </div>
        </div>
      )}


      <QuickCaptureModal
        isOpen={isQuickCaptureOpen}
        onClose={() => setIsQuickCaptureOpen(false)}
        onSave={handleSave}
        lists={activeLists}
        defaultListId={defaultListForNew}
        initialText={quickCaptureText}
      />

      <SavedFilterModal
        isOpen={isFilterModalOpen}
        onClose={() => {
          setIsFilterModalOpen(false);
          setEditingFilter(null);
        }}
        onSave={handleSaveFilter}
        lists={activeLists}
        availableTags={allTags}
        initial={editingFilter}
      />

      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
        initialTask={editingTask}
        lists={activeLists}
        defaultListId={defaultListForNew}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        tasks={allTasks}
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
                ['/', 'Focus search'],
                ['1–4', 'Today / Tomorrow / Next 7 / Inbox'],
                ['m / a', 'Calendar month / Agenda'],
                ['j / k', 'Next / previous task'],
                ['x', 'Complete selected'],
                ['e', 'Edit selected'],
                ['\\', 'Toggle sidebar (mobile)'],
                ['Esc', 'Close panels / deselect'],
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
    </div>
  );
}

export default App;
