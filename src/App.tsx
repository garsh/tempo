import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  saveFolder,
  saveList,
  saveSavedFilter,
  saveTask,
  seedInitialTasksIfEmpty,
  softDeleteFolder,
  softDeleteList,
  softDeleteSavedFilter,
  softDeleteTask,
  togglePinTask,
  toggleSubtask,
} from './db/db';
import type { AppView, Folder, SavedFilter, Task, TaskInput, TaskList } from './types/task';
import { INBOX_LIST_ID } from './types/task';
import { formatDate, getTaskUrgency, isCompleted } from './domain/recurrence';
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
import { computeTempoStats } from './domain/stats';
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
import { StatsStrip } from './components/StatsStrip';
import {
  Plus,
  Settings,
  CalendarCheck,
  Clock,
  Layers,
  Search,
  CheckCircle2,
  Inbox,
  List as ListIcon,
  Trash2,
  Sun,
  Sunrise,
  CalendarRange,
  Folder as FolderIcon,
  Menu,
  PanelRightOpen,
  Keyboard,
  CalendarDays,
  X,
  Columns3,
  Filter,
  Zap,
  Cloud,
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

function navBtn(active: boolean) {
  return `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
    active
      ? 'bg-indigo-600 text-white shadow-sm'
      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
  }`;
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
    seedInitialTasksIfEmpty();
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
  const tempoStats = useMemo(() => computeTempoStats(allTasks), [allTasks]);

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

  const overdueTasks = open.filter((t) => getTaskUrgency(t.dueAt) === 'overdue');
  const dueTodayTasks = open.filter((t) => getTaskUrgency(t.dueAt) === 'due_today');
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

  const openFullEditor = useCallback(() => {
    setEditingTask(null);
    setIsTaskModalOpen(true);
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

  const sidebar = (
    <div className="h-full overflow-y-auto p-3 space-y-4">
      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1">
          Smart lists
        </div>
        {(
          [
            ['today', 'Today', Sun, todayCount],
            ['tomorrow', 'Tomorrow', Sunrise, tomorrowCount],
            ['next7', 'Next 7 Days', CalendarRange, next7Count],
            ['inbox', 'Inbox', Inbox, inboxCount],
            ['all', 'All Open', Layers, null],
            ['completed', 'Completed', CheckCircle2, null],
          ] as const
        ).map(([id, label, Icon, count]) => (
          <button
            key={id}
            type="button"
            className={navBtn(activeView === id)}
            onClick={() => goView(id)}
          >
            <span className="inline-flex items-center gap-2">
              <Icon className="w-3.5 h-3.5" />
              {label}
            </span>
            {count != null && count > 0 && (
              <span
                className={`text-[10px] px-1.5 rounded-full ${
                  activeView === id ? 'bg-indigo-800' : 'bg-slate-800'
                }`}
              >
                {count}
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1">
          Calendar
        </div>
        <button
          type="button"
          className={navBtn(activeView === 'calendar-month')}
          onClick={() => goView('calendar-month')}
        >
          <span className="inline-flex items-center gap-2">
            <CalendarDays className="w-3.5 h-3.5" />
            Month
          </span>
        </button>
        <button
          type="button"
          className={navBtn(activeView === 'calendar-agenda')}
          onClick={() => goView('calendar-agenda')}
        >
          <span className="inline-flex items-center gap-2">
            <CalendarRange className="w-3.5 h-3.5" />
            Agenda
          </span>
        </button>
      </div>

      <div className="space-y-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1">
          Board
        </div>
        <button
          type="button"
          className={navBtn(activeView === 'board-status')}
          onClick={() => goView('board-status')}
        >
          <span className="inline-flex items-center gap-2">
            <Columns3 className="w-3.5 h-3.5" />
            By status
          </span>
        </button>
        <button
          type="button"
          className={navBtn(activeView === 'board-list')}
          onClick={() => goView('board-list')}
        >
          <span className="inline-flex items-center gap-2">
            <Columns3 className="w-3.5 h-3.5" />
            By list
          </span>
        </button>
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Saved filters
          </span>
          <button
            type="button"
            onClick={() => {
              setEditingFilter(null);
              setIsFilterModalOpen(true);
            }}
            className="text-[11px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
          >
            <Plus className="w-3 h-3" />
            New
          </button>
        </div>
        {activeSavedFilters.length === 0 && (
          <p className="px-3 text-[11px] text-slate-600">No saved filters yet</p>
        )}
        {activeSavedFilters.map((sf) => (
          <div key={sf.id} className="relative group/filter">
            <button
              type="button"
              className={navBtn(activeView === `filter:${sf.id}`)}
              onClick={() => goView(`filter:${sf.id}`)}
            >
              <span className="inline-flex items-center gap-2 truncate">
                <Filter className="w-3.5 h-3.5 shrink-0" />
                {sf.name}
              </span>
              <span className="text-[9px] uppercase text-slate-500">{sf.match}</span>
            </button>
            <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/filter:flex gap-0.5">
              <button
                type="button"
                title="Edit filter"
                onClick={() => {
                  setEditingFilter(sf);
                  setIsFilterModalOpen(true);
                }}
                className="w-5 h-5 flex items-center justify-center rounded-md bg-slate-800 text-slate-300 border border-slate-700 text-[9px]"
              >
                ✎
              </button>
              <button
                type="button"
                title="Delete filter"
                onClick={() => handleDeleteFilter(sf)}
                className="w-5 h-5 flex items-center justify-center rounded-md bg-rose-950 text-rose-300 border border-rose-800"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="space-y-1">
        <div className="flex items-center justify-between px-3 mb-1">
          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Folders & lists
          </span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setShowNewFolderInput((v) => !v)}
              className="text-[11px] text-slate-400 hover:text-indigo-300"
              title="New folder"
            >
              <FolderIcon className="w-3 h-3" />
            </button>
            <button
              type="button"
              onClick={() => setShowNewListInput((v) => !v)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 inline-flex items-center gap-0.5"
            >
              <Plus className="w-3 h-3" />
              New
            </button>
          </div>
        </div>

        {showNewFolderInput && (
          <form onSubmit={handleCreateFolder} className="flex gap-1.5 px-1 mb-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              autoFocus
              className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              className="px-2 py-1.5 bg-slate-700 hover:bg-slate-600 text-white text-xs font-semibold rounded-lg"
            >
              Add
            </button>
          </form>
        )}

        {showNewListInput && (
          <form onSubmit={handleCreateList} className="space-y-1.5 px-1 mb-1">
            <input
              type="text"
              value={newListName}
              onChange={(e) => setNewListName(e.target.value)}
              placeholder="List name"
              autoFocus
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
            />
            <select
              value={newListFolderId}
              onChange={(e) => setNewListFolderId(e.target.value)}
              className="w-full px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-300 focus:outline-none focus:border-indigo-500"
            >
              <option value="">No folder</option>
              {activeFolders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="w-full px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
            >
              Add list
            </button>
          </form>
        )}

        {activeFolders.map((folder) => {
          const listsInFolder = userLists.filter((l) => l.folderId === folder.id);
          return (
            <div key={folder.id} className="mb-1">
              <div className="relative group/folder flex items-center justify-between px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                <span className="inline-flex items-center gap-1.5 truncate">
                  <FolderIcon className="w-3 h-3 text-amber-400/80" />
                  {folder.name}
                </span>
                <button
                  type="button"
                  title={`Delete folder ${folder.name}`}
                  onClick={() => handleDeleteFolder(folder)}
                  className="hidden group-hover/folder:flex w-5 h-5 items-center justify-center rounded-md bg-rose-950 text-rose-300 border border-rose-800"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
              {listsInFolder.map((list) => (
                <div key={list.id} className="relative group/list pl-2">
                  <button
                    type="button"
                    className={navBtn(activeView === `list:${list.id}`)}
                    onClick={() => goView(`list:${list.id}`)}
                  >
                    <span className="inline-flex items-center gap-2 truncate">
                      <ListIcon className="w-3.5 h-3.5 shrink-0" />
                      {list.name}
                    </span>
                  </button>
                  <button
                    type="button"
                    title={`Delete ${list.name}`}
                    onClick={() => handleDeleteList(list)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/list:flex w-5 h-5 items-center justify-center rounded-md bg-rose-950 text-rose-300 border border-rose-800"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          );
        })}

        {unfiledLists.map((list) => (
          <div key={list.id} className="relative group/list">
            <button
              type="button"
              className={navBtn(activeView === `list:${list.id}`)}
              onClick={() => goView(`list:${list.id}`)}
            >
              <span className="inline-flex items-center gap-2 truncate">
                <ListIcon className="w-3.5 h-3.5 shrink-0" />
                {list.name}
              </span>
            </button>
            <button
              type="button"
              title={`Delete ${list.name}`}
              onClick={() => handleDeleteList(list)}
              className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/list:flex w-5 h-5 items-center justify-center rounded-md bg-rose-950 text-rose-300 border border-rose-800"
            >
              <Trash2 className="w-3 h-3" />
            </button>
          </div>
        ))}
      </div>

      <StatsStrip stats={tempoStats} />

      <p className="px-3 pt-2 text-[10px] text-slate-600">
        Press <kbd className="px-1 rounded bg-slate-900 text-slate-400">?</kbd> for shortcuts
      </p>
    </div>
  );

  return (
    <div className="h-dvh bg-slate-950 text-slate-100 flex flex-col overflow-hidden selection:bg-indigo-500/30 selection:text-indigo-200">
      <header className="shrink-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-slate-800/80 px-3 sm:px-4 py-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              className="lg:hidden p-2 text-slate-400 hover:text-slate-200 border border-slate-800 rounded-xl"
              onClick={() => setSidebarOpen(true)}
              title="Open sidebar (\\)"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-black text-lg shrink-0">
              T
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="text-base font-bold text-slate-100 tracking-tight">Tempo</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 hidden sm:inline">
                  Sync
                </span>
              </div>
              <p className="text-[11px] text-slate-500 truncate hidden md:block">
                Silent Drive sync · reminders · install
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <button
              type="button"
              onClick={() => setShowShortcutsHelp(true)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 rounded-xl hidden sm:inline-flex"
              title="Keyboard shortcuts (?)"
            >
              <Keyboard className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setDetailOpenMobile(true)}
              className="xl:hidden p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 rounded-xl"
              title="Open detail pane"
            >
              <PanelRightOpen className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => void syncNow(true)}
              className={`p-2 border border-slate-800 rounded-xl ${
                syncStatus.phase === 'syncing'
                  ? 'text-indigo-400'
                  : syncStatus.phase === 'error'
                    ? 'text-rose-400'
                    : syncStatus.phase === 'ok'
                      ? 'text-emerald-400'
                      : 'text-slate-400 hover:text-slate-200'
              } hover:bg-slate-900`}
              title={
                syncStatus.lastError
                  ? `Sync error: ${syncStatus.lastError}`
                  : syncStatus.lastSyncedAt
                    ? `Last sync ${new Date(syncStatus.lastSyncedAt).toLocaleString()} (click to sync)`
                    : 'Sync with Google Drive'
              }
            >
              <Cloud className={`w-4 h-4 ${syncStatus.phase === 'syncing' ? 'animate-pulse' : ''}`} />
            </button>
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 rounded-xl"
              title="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
            <button
              onClick={openCapture}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm shadow-md shadow-indigo-600/25"
              title="New task (n)"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New</span>
            </button>
          </div>
        </div>
      </header>

      {/* Three-pane shell */}
      <div className="flex-1 flex min-h-0 relative">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-56 xl:w-60 shrink-0 flex-col border-r border-slate-800 bg-slate-950/60">
          {sidebar}
        </aside>

        {/* Mobile sidebar drawer */}
        {sidebarOpen && (
          <div className="lg:hidden fixed inset-0 z-50 flex">
            <div className="w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 shadow-2xl flex flex-col">
              <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-300">Navigate</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-slate-200"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              {sidebar}
            </div>
            <div className="flex-1 bg-black/50" onClick={() => setSidebarOpen(false)} />
          </div>
        )}

        {/* Main column */}
        <section className="flex-1 min-w-0 flex flex-col min-h-0">
          <div className="shrink-0 px-3 sm:px-5 pt-4 space-y-3">
            {!isCalendar && !isBoard && (
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => goView('today')}
                  className={`p-3 rounded-2xl border text-left ${
                    overdueTasks.length > 0
                      ? 'bg-rose-950/20 border-rose-900/40'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Overdue</span>
                    <Clock className={`w-3.5 h-3.5 ${overdueTasks.length ? 'text-rose-400' : ''}`} />
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      overdueTasks.length ? 'text-rose-400' : 'text-slate-200'
                    }`}
                  >
                    {overdueTasks.length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => goView('today')}
                  className={`p-3 rounded-2xl border text-left ${
                    dueTodayTasks.length > 0
                      ? 'bg-amber-950/20 border-amber-900/40'
                      : 'bg-slate-900/60 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Due Today</span>
                    <CalendarCheck
                      className={`w-3.5 h-3.5 ${dueTodayTasks.length ? 'text-amber-400' : ''}`}
                    />
                  </div>
                  <div
                    className={`text-xl font-bold ${
                      dueTodayTasks.length ? 'text-amber-400' : 'text-slate-200'
                    }`}
                  >
                    {dueTodayTasks.length}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => goView('all')}
                  className="p-3 rounded-2xl border border-slate-800 bg-slate-900/60 text-left"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mb-0.5">
                    <span>Open</span>
                    <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  </div>
                  <div className="text-xl font-bold text-slate-200">{open.length}</div>
                </button>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-100">
                {resolveViewTitle(activeView, activeLists, activeSavedFilters)}
                {!isCalendar && (
                  <span className="ml-2 text-xs font-medium text-slate-500">
                    {displayedTasks.length}
                  </span>
                )}
              </h2>
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  ref={searchRef}
                  type="text"
                  placeholder="Search… (/)"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {allTags.length > 0 && !isCalendar && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <button
                  onClick={() => setSelectedTag(null)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${
                    selectedTag === null
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800'
                  }`}
                >
                  All tags
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium shrink-0 ${
                      selectedTag === tag
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-3 sm:px-5 py-4 space-y-3">
            {isBoard && (
              <KanbanBoard
                tasks={displayedTasks}
                lists={activeLists}
                mode={activeView === 'board-list' ? 'list' : 'status'}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
                onMoveToList={handleMoveToList}
              />
            )}

            {activeView === 'calendar-month' && (
              <>
                <CalendarMonthView
                  tasks={activeTasks}
                  year={calYear}
                  monthIndex={calMonth}
                  selectedDateStr={calSelectedDate}
                  onMonthChange={(y, m) => {
                    setCalYear(y);
                    setCalMonth(m);
                  }}
                  onSelectDate={setCalSelectedDate}
                  onSelectTask={selectTask}
                />
                {calSelectedDate && (
                  <div className="pt-2 space-y-2">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      {calSelectedDate}
                    </h3>
                    {displayedTasks.length === 0 ? (
                      <p className="text-xs text-slate-500">No tasks this day.</p>
                    ) : (
                      displayedTasks.map((task) => (
                        <div
                          key={task.id}
                          className={
                            selectedTaskId === task.id ? 'ring-2 ring-indigo-500 rounded-2xl' : ''
                          }
                          onClick={() => selectTask(task)}
                        >
                          <TaskCard
                            task={task}
                            listName={listNameById.get(task.listId)}
                            onComplete={handleComplete}
                            onEdit={handleEdit}
                            onDelete={handleDelete}
                            onTogglePin={handleTogglePin}
                            onToggleSubtask={handleToggleSubtask}
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}
              </>
            )}

            {activeView === 'calendar-agenda' && (
              <CalendarAgendaView
                tasks={activeTasks}
                selectedTaskId={selectedTaskId}
                onSelectTask={selectTask}
              />
            )}

            {!isCalendar && !isBoard &&
              (displayedTasks.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200">
                    {activeView === 'today' ? 'All caught up!' : 'No tasks here'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                    Press <kbd className="px-1 rounded bg-slate-800">n</kbd> to capture a task.
                  </p>
                  <div className="mt-4 flex items-center justify-center gap-2">
                    <button
                      onClick={openCapture}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Zap className="w-3.5 h-3.5" />
                      Quick capture
                    </button>
                    <button
                      onClick={openFullEditor}
                      className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl inline-flex items-center gap-1.5"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Full editor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {displayedTasks.map((task) => (
                    <div
                      key={task.id}
                      className={
                        selectedTaskId === task.id ? 'ring-2 ring-indigo-500/80 rounded-2xl' : ''
                      }
                      onClick={() => selectTask(task)}
                    >
                      <TaskCard
                        task={task}
                        listName={
                          showListNameOnCards ? listNameById.get(task.listId) : undefined
                        }
                        onComplete={handleComplete}
                        onEdit={handleEdit}
                        onDelete={handleDelete}
                        onTogglePin={handleTogglePin}
                        onToggleSubtask={handleToggleSubtask}
                      />
                    </div>
                  ))}
                </div>
              ))}
          </div>
        </section>

        {/* Desktop detail pane */}
        <aside className="hidden xl:flex w-80 shrink-0 flex-col border-l border-slate-800 bg-slate-950/40">
          <TaskDetailPane
            task={selectedTask}
            listName={selectedTask ? listNameById.get(selectedTask.listId) : undefined}
            onClose={() => setSelectedTaskId(null)}
            onComplete={handleComplete}
            onEdit={handleEdit}
            onDelete={handleDelete}
            onTogglePin={handleTogglePin}
            onToggleSubtask={handleToggleSubtask}
          />
        </aside>

        {/* Mobile/tablet detail drawer */}
        {detailOpenMobile && (
          <div className="xl:hidden fixed inset-0 z-50 flex justify-end">
            <div className="flex-1 bg-black/50" onClick={() => setDetailOpenMobile(false)} />
            <div className="w-full max-w-md bg-slate-950 border-l border-slate-800 shadow-2xl">
              <TaskDetailPane
                task={selectedTask}
                listName={selectedTask ? listNameById.get(selectedTask.listId) : undefined}
                onClose={() => setDetailOpenMobile(false)}
                onComplete={handleComplete}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onTogglePin={handleTogglePin}
                onToggleSubtask={handleToggleSubtask}
              />
            </div>
          </div>
        )}
      </div>

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
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-100 inline-flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-indigo-400" />
                Shortcuts
              </h3>
              <button
                type="button"
                onClick={() => setShowShortcutsHelp(false)}
                className="p-1.5 text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <ul className="space-y-2 text-xs text-slate-300">
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
                  <span className="text-slate-400">{desc}</span>
                  <kbd className="px-2 py-1 rounded-lg bg-slate-800 text-slate-200 font-mono text-[11px]">
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
