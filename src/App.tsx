import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  completeTask,
  db,
  saveList,
  saveTask,
  seedInitialTasksIfEmpty,
  softDeleteList,
  softDeleteTask,
} from './db/db';
import type { Task, TaskInput, TaskList } from './types/task';
import { INBOX_LIST_ID } from './types/task';
import { getTaskUrgency, isCompleted } from './domain/recurrence';
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
} from 'lucide-react';

type TabView = 'due' | 'upcoming' | 'all' | 'completed';

export function App() {
  const [activeTab, setActiveTab] = useState<TabView>('due');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [selectedListId, setSelectedListId] = useState<string | 'all'>('all');

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

  const activeLists = allLists
    .filter((l) => !l.deletedAt)
    .sort((a, b) => {
      if (a.id === INBOX_LIST_ID) return -1;
      if (b.id === INBOX_LIST_ID) return 1;
      return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.name.localeCompare(b.name);
    });

  const listNameById = new Map(activeLists.map((l) => [l.id, l.name]));

  const activeTasks = allTasks.filter((t) => !t.deletedAt);
  const openTasks = activeTasks.filter((t) => !isCompleted(t));
  const completedOneOffs = activeTasks.filter((t) => isCompleted(t));

  const allTags = Array.from(new Set(openTasks.flatMap((t) => t.tags || []))).filter(Boolean);

  const filterByList = (tasks: Task[]) => {
    if (selectedListId === 'all') return tasks;
    return tasks.filter((t) => t.listId === selectedListId);
  };

  const listScopedOpen = filterByList(openTasks);
  const listScopedCompleted = filterByList(completedOneOffs);

  const overdueTasks = listScopedOpen.filter((t) => getTaskUrgency(t.dueAt) === 'overdue');
  const dueTodayTasks = listScopedOpen.filter((t) => getTaskUrgency(t.dueAt) === 'due_today');
  const upcomingTasks = listScopedOpen.filter((t) => getTaskUrgency(t.dueAt) === 'upcoming');
  const laterOrNoDue = listScopedOpen.filter((t) => {
    const u = getTaskUrgency(t.dueAt);
    return u === 'later' || u === 'none';
  });

  const getDisplayedTasks = () => {
    let list: Task[] = [];

    if (activeTab === 'due') {
      list = [...overdueTasks, ...dueTodayTasks];
    } else if (activeTab === 'upcoming') {
      list = [...upcomingTasks, ...laterOrNoDue];
    } else if (activeTab === 'completed') {
      list = [...listScopedCompleted].sort(
        (a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0)
      );
    } else {
      list = [...overdueTasks, ...dueTodayTasks, ...upcomingTasks, ...laterOrNoDue];
    }

    if (selectedTag) {
      list = list.filter((t) => t.tags?.includes(selectedTag));
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          t.notes?.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
      );
    }

    return list;
  };

  const displayedTasks = getDisplayedTasks();

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
    setSelectedListId(list.id);
  };

  const handleDeleteList = async (list: TaskList) => {
    if (list.id === INBOX_LIST_ID) return;
    await softDeleteList(list.id);
    if (selectedListId === list.id) setSelectedListId('all');
  };

  const defaultListForNew =
    selectedListId === 'all' ? INBOX_LIST_ID : selectedListId;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-black text-xl">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">Tempo</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Tasks
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                One-off & recurring tasks · local-first
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

      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Lists row */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Lists
            </span>
            <button
              type="button"
              onClick={() => setShowNewListInput((v) => !v)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1"
            >
              <Plus className="w-3 h-3" />
              New list
            </button>
          </div>

          {showNewListInput && (
            <form onSubmit={handleCreateList} className="flex gap-2">
              <input
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name"
                autoFocus
                className="flex-1 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl"
              >
                Add
              </button>
            </form>
          )}

          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs no-scrollbar">
            <button
              onClick={() => setSelectedListId('all')}
              className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 shrink-0 ${
                selectedListId === 'all'
                  ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                  : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-300'
              }`}
            >
              <Layers className="w-3 h-3" />
              All
            </button>
            {activeLists.map((list) => (
              <div key={list.id} className="relative group/list shrink-0">
                <button
                  onClick={() => setSelectedListId(list.id)}
                  className={`px-2.5 py-1.5 rounded-full text-[11px] font-medium transition-colors inline-flex items-center gap-1 ${
                    selectedListId === list.id
                      ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/40'
                      : 'bg-slate-900 text-slate-400 border border-slate-800 hover:text-slate-300'
                  }`}
                >
                  {list.id === INBOX_LIST_ID ? (
                    <Inbox className="w-3 h-3" />
                  ) : (
                    <ListIcon className="w-3 h-3" />
                  )}
                  {list.name}
                </button>
                {list.id !== INBOX_LIST_ID && (
                  <button
                    type="button"
                    title={`Delete ${list.name}`}
                    onClick={() => handleDeleteList(list)}
                    className="absolute -top-1 -right-1 hidden group-hover/list:flex w-4 h-4 items-center justify-center rounded-full bg-rose-900 text-rose-200 border border-rose-700"
                  >
                    <Trash2 className="w-2.5 h-2.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-4">
          <div
            onClick={() => setActiveTab('due')}
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
            onClick={() => setActiveTab('due')}
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
            onClick={() => setActiveTab('all')}
            className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium">Open Tasks</span>
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-200">
              {listScopedOpen.length}
            </div>
          </div>
        </div>

        {/* Tabs & search */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex p-1 bg-slate-900/90 border border-slate-800 rounded-2xl overflow-x-auto">
              <button
                onClick={() => setActiveTab('due')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'due'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Due & Overdue
                {overdueTasks.length + dueTodayTasks.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === 'due'
                        ? 'bg-indigo-800 text-indigo-100'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {overdueTasks.length + dueTodayTasks.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('upcoming')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'upcoming'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Upcoming
              </button>

              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Open
              </button>

              <button
                onClick={() => setActiveTab('completed')}
                className={`flex-1 sm:flex-initial px-3 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all whitespace-nowrap ${
                  activeTab === 'completed'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Completed
                {listScopedCompleted.length > 0 && (
                  <span
                    className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                      activeTab === 'completed'
                        ? 'bg-indigo-800 text-indigo-100'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    {listScopedCompleted.length}
                  </span>
                )}
              </button>
            </div>

            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search tasks or tags..."
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
                className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
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
                  className={`px-2.5 py-1 rounded-full text-[11px] font-medium transition-colors ${
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
        </div>

        {/* Task list */}
        <div className="space-y-3">
          {displayedTasks.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-200">
                {activeTab === 'due'
                  ? 'All caught up!'
                  : activeTab === 'completed'
                    ? 'No completed tasks yet'
                    : 'No tasks found'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                {activeTab === 'due'
                  ? 'Nothing overdue or due today. Create a one-off or recurring task anytime.'
                  : 'Create a one-off or recurring task and assign it to Inbox or a list.'}
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
                    selectedListId === 'all'
                      ? listNameById.get(task.listId)
                      : undefined
                  }
                  onComplete={handleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
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
