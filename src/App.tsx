import { useMemo, useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  saveList,
  saveTask,
  seedInitialTasksIfEmpty,
  softDeleteList,
  softDeleteTask,
  togglePinTask,
} from './db/db';
import type { SmartView, Task, TaskInput, TaskList } from './types/task';
import { INBOX_LIST_ID } from './types/task';
import { getTaskUrgency, isCompleted } from './domain/recurrence';
import {
  filterByListId,
  filterInbox,
  filterNext7Days,
  filterToday,
  filterTomorrow,
  openTasks,
} from './domain/smartLists';
import { matchesSearch, matchesTag, sortTasksForDailyView } from './domain/sorting';
import { useDueNotifications } from './hooks/useDueNotifications';
import { TaskCard } from './components/TaskCard';
import { TaskModal } from './components/TaskModal';
import { SettingsModal } from './components/SettingsModal';
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
} from 'lucide-react';

function viewTitle(view: SmartView, lists: TaskList[]): string {
  if (view === 'today') return 'Today';
  if (view === 'tomorrow') return 'Tomorrow';
  if (view === 'next7') return 'Next 7 Days';
  if (view === 'inbox') return 'Inbox';
  if (view === 'all') return 'All Open';
  if (view === 'completed') return 'Completed';
  if (view.startsWith('list:')) {
    const id = view.slice(5);
    return lists.find((l) => l.id === id)?.name ?? 'List';
  }
  return 'Tasks';
}

export function App() {
  const [activeView, setActiveView] = useState<SmartView>('today');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newListName, setNewListName] = useState('');
  const [showNewListInput, setShowNewListInput] = useState(false);

  useEffect(() => {
    seedInitialTasksIfEmpty();
  }, []);

  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];
  const allLists = useLiveQuery(() => db.lists.toArray(), []) || [];

  useDueNotifications(allTasks);

  const activeLists = [...allLists]
    .filter((l) => !l.deletedAt)
    .sort((a, b) => {
      if (a.id === INBOX_LIST_ID) return -1;
      if (b.id === INBOX_LIST_ID) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    });

  const listNameById = new Map(activeLists.map((l) => [l.id, l.name]));

  const userLists = activeLists.filter((l) => l.id !== INBOX_LIST_ID);

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
      default:
        if (activeView.startsWith('list:')) {
          return filterByListId(activeTasks, activeView.slice(5));
        }
        return open;
    }
  }, [activeView, activeTasks, open, completedOneOffs]);

  const displayedTasks = useMemo(() => {
    let list = baseForView.filter(
      (t) => matchesSearch(t, searchQuery) && matchesTag(t, selectedTag)
    );
    if (activeView !== 'completed') {
      list = sortTasksForDailyView(list);
    }
    return list;
  }, [baseForView, searchQuery, selectedTag, activeView]);

  const handleComplete = async (id: string) => {
    await completeTask(id);
  };

  const handleEdit = (task: Task) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await softDeleteTask(id);
  };

  const handleTogglePin = async (id: string) => {
    await togglePinTask(id);
  };

  const handleSave = async (taskData: TaskInput) => {
    await saveTask(taskData);
    setEditingTask(null);
  };

  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newListName.trim();
    if (!name) return;
    const list = await saveList({ name });
    setNewListName('');
    setShowNewListInput(false);
    setActiveView(`list:${list.id}`);
  };

  const handleDeleteList = async (list: TaskList) => {
    if (list.id === INBOX_LIST_ID) return;
    await softDeleteList(list.id);
    if (activeView === `list:${list.id}`) setActiveView('today');
  };

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
    activeView === 'completed';

  const navBtn = (active: boolean) =>
    `w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-semibold transition-all ${
      active
        ? 'bg-indigo-600 text-white shadow-sm'
        : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
    }`;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-black text-xl">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">Tempo</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Daily
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Today · smart lists · reminders
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsSettingsModalOpen(true)}
              className="p-2 text-slate-400 hover:text-slate-200 hover:bg-slate-900 border border-slate-800 rounded-xl transition-colors"
              title="Settings & Google Drive Sync"
            >
              <Settings className="w-4 h-4" />
            </button>

            <button
              onClick={() => {
                setEditingTask(null);
                setIsTaskModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs sm:text-sm transition-all shadow-md shadow-indigo-600/25 active:scale-95"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">New Task</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-8 py-6">
        <div className="flex flex-col lg:flex-row gap-6">
          {/* Sidebar: smart lists + user lists */}
          <aside className="lg:w-56 shrink-0 space-y-4">
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 px-3 mb-1">
                Smart lists
              </div>
              <button type="button" className={navBtn(activeView === 'today')} onClick={() => setActiveView('today')}>
                <span className="inline-flex items-center gap-2">
                  <Sun className="w-3.5 h-3.5" />
                  Today
                </span>
                {todayCount > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeView === 'today' ? 'bg-indigo-800' : 'bg-slate-800'}`}>
                    {todayCount}
                  </span>
                )}
              </button>
              <button type="button" className={navBtn(activeView === 'tomorrow')} onClick={() => setActiveView('tomorrow')}>
                <span className="inline-flex items-center gap-2">
                  <Sunrise className="w-3.5 h-3.5" />
                  Tomorrow
                </span>
                {tomorrowCount > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeView === 'tomorrow' ? 'bg-indigo-800' : 'bg-slate-800'}`}>
                    {tomorrowCount}
                  </span>
                )}
              </button>
              <button type="button" className={navBtn(activeView === 'next7')} onClick={() => setActiveView('next7')}>
                <span className="inline-flex items-center gap-2">
                  <CalendarRange className="w-3.5 h-3.5" />
                  Next 7 Days
                </span>
                {next7Count > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeView === 'next7' ? 'bg-indigo-800' : 'bg-slate-800'}`}>
                    {next7Count}
                  </span>
                )}
              </button>
              <button type="button" className={navBtn(activeView === 'inbox')} onClick={() => setActiveView('inbox')}>
                <span className="inline-flex items-center gap-2">
                  <Inbox className="w-3.5 h-3.5" />
                  Inbox
                </span>
                {inboxCount > 0 && (
                  <span className={`text-[10px] px-1.5 rounded-full ${activeView === 'inbox' ? 'bg-indigo-800' : 'bg-slate-800'}`}>
                    {inboxCount}
                  </span>
                )}
              </button>
              <button type="button" className={navBtn(activeView === 'all')} onClick={() => setActiveView('all')}>
                <span className="inline-flex items-center gap-2">
                  <Layers className="w-3.5 h-3.5" />
                  All Open
                </span>
              </button>
              <button type="button" className={navBtn(activeView === 'completed')} onClick={() => setActiveView('completed')}>
                <span className="inline-flex items-center gap-2">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  Completed
                </span>
              </button>
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between px-3 mb-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                  Lists
                </span>
                <button
                  type="button"
                  onClick={() => setShowNewListInput((v) => !v)}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium inline-flex items-center gap-0.5"
                >
                  <Plus className="w-3 h-3" />
                  New
                </button>
              </div>

              {showNewListInput && (
                <form onSubmit={handleCreateList} className="flex gap-1.5 px-1 mb-1">
                  <input
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    placeholder="List name"
                    autoFocus
                    className="flex-1 px-2 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    className="px-2 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-lg"
                  >
                    Add
                  </button>
                </form>
              )}

              {userLists.map((list) => (
                <div key={list.id} className="relative group/list">
                  <button
                    type="button"
                    className={navBtn(activeView === `list:${list.id}`)}
                    onClick={() => setActiveView(`list:${list.id}`)}
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
          </aside>

          {/* Main column */}
          <section className="flex-1 min-w-0 space-y-5">
            {/* Stats for Today context */}
            <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
              <div
                onClick={() => setActiveView('today')}
                className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
                  overdueTasks.length > 0
                    ? 'bg-rose-950/20 border-rose-900/40 hover:border-rose-700/60'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-medium">Overdue</span>
                  <Clock
                    className={`w-3.5 h-3.5 ${overdueTasks.length > 0 ? 'text-rose-400' : 'text-slate-500'}`}
                  />
                </div>
                <div
                  className={`text-xl sm:text-2xl font-bold ${
                    overdueTasks.length > 0 ? 'text-rose-400' : 'text-slate-200'
                  }`}
                >
                  {overdueTasks.length}
                </div>
              </div>

              <div
                onClick={() => setActiveView('today')}
                className={`p-3.5 sm:p-4 rounded-2xl border cursor-pointer transition-all ${
                  dueTodayTasks.length > 0
                    ? 'bg-amber-950/20 border-amber-900/40 hover:border-amber-700/60'
                    : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-medium">Due Today</span>
                  <CalendarCheck
                    className={`w-3.5 h-3.5 ${dueTodayTasks.length > 0 ? 'text-amber-400' : 'text-slate-500'}`}
                  />
                </div>
                <div
                  className={`text-xl sm:text-2xl font-bold ${
                    dueTodayTasks.length > 0 ? 'text-amber-400' : 'text-slate-200'
                  }`}
                >
                  {dueTodayTasks.length}
                </div>
              </div>

              <div
                onClick={() => setActiveView('all')}
                className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
              >
                <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
                  <span className="font-medium">Open</span>
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                </div>
                <div className="text-xl sm:text-2xl font-bold text-slate-200">{open.length}</div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h2 className="text-base font-bold text-slate-100">
                {viewTitle(activeView, activeLists)}
                <span className="ml-2 text-xs font-medium text-slate-500">
                  {displayedTasks.length}
                </span>
              </h2>
              <div className="relative flex-1 sm:max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Search title, notes, tags..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {allTags.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
                <button
                  onClick={() => setSelectedTag(null)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 ${
                    selectedTag === null
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-300'
                  }`}
                >
                  All tags
                </button>
                {allTags.map((tag) => (
                  <button
                    key={tag}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors shrink-0 ${
                      selectedTag === tag
                        ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                        : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-300'
                    }`}
                  >
                    #{tag}
                  </button>
                ))}
              </div>
            )}

            <div className="space-y-3">
              {displayedTasks.length === 0 ? (
                <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
                  <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <h3 className="text-base font-semibold text-slate-200">
                    {activeView === 'today'
                      ? 'All caught up for today!'
                      : activeView === 'completed'
                        ? 'No completed tasks yet'
                        : 'No tasks here'}
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                    Create a one-off or recurring task with an optional due date and time.
                  </p>
                  <button
                    onClick={() => {
                      setEditingTask(null);
                      setIsTaskModalOpen(true);
                    }}
                    className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add a Task
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-3">
                  {displayedTasks.map((task) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      listName={
                        showListNameOnCards ? listNameById.get(task.listId) : undefined
                      }
                      onComplete={handleComplete}
                      onEdit={handleEdit}
                      onDelete={handleDelete}
                      onTogglePin={handleTogglePin}
                    />
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      </main>

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
      />
    </div>
  );
}

export default App;
