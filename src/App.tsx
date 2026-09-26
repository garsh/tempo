import { useState, useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { completeTask, db, saveTask, seedInitialTasksIfEmpty, softDeleteTask } from './db/db';
import type { PeriodicTask } from './types/task';
import { getTaskUrgency } from './domain/recurrence';
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
} from 'lucide-react';

type TabView = 'due' | 'upcoming' | 'all';

export function App() {
  const [activeTab, setActiveTab] = useState<TabView>('due');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<PeriodicTask | null>(null);

  // Seed sample data on first run
  useEffect(() => {
    seedInitialTasksIfEmpty();
  }, []);

  // Live query from IndexedDB
  const allTasks = useLiveQuery(() => db.tasks.toArray(), []) || [];

  // Filter out soft-deleted tasks
  const activeTasks = allTasks.filter((t) => !t.deletedAt);

  // Extract all unique tags
  const allTags = Array.from(
    new Set(activeTasks.flatMap((t) => t.tags || []))
  ).filter(Boolean);

  // Categorize tasks
  const overdueTasks = activeTasks.filter((t) => getTaskUrgency(t.dueDate) === 'overdue');
  const dueTodayTasks = activeTasks.filter((t) => getTaskUrgency(t.dueDate) === 'due_today');
  const upcomingTasks = activeTasks.filter((t) => getTaskUrgency(t.dueDate) === 'upcoming');
  const laterTasks = activeTasks.filter((t) => getTaskUrgency(t.dueDate) === 'later');

  // Filter based on active tab and search query
  const getDisplayedTasks = () => {
    let list: PeriodicTask[] = [];

    if (activeTab === 'due') {
      // Overdue first, then due today
      list = [...overdueTasks, ...dueTodayTasks];
    } else if (activeTab === 'upcoming') {
      list = [...upcomingTasks, ...laterTasks];
    } else {
      // All routines
      list = [...overdueTasks, ...dueTodayTasks, ...upcomingTasks, ...laterTasks];
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

  const handleEdit = (task: PeriodicTask) => {
    setEditingTask(task);
    setIsTaskModalOpen(true);
  };

  const handleDelete = async (id: string) => {
    await softDeleteTask(id);
  };

  const handleSave = async (
    taskData: Omit<PeriodicTask, 'id' | 'createdAt' | 'updatedAt' | 'completionHistory'> & { id?: string }
  ) => {
    await saveTask(taskData);
    setEditingTask(null);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col selection:bg-indigo-500/30 selection:text-indigo-200">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-slate-950/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 py-3.5">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center shadow-lg shadow-indigo-600/30 text-white font-black text-xl">
              T
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-slate-100 tracking-tight">Tempo</h1>
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                  Periodic
                </span>
              </div>
              <p className="text-xs text-slate-400 hidden sm:block">
                Recurring routines & maintenance tracker
              </p>
            </div>
          </div>

          {/* Header Action Buttons */}
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
              <span className="hidden sm:inline">New Routine</span>
              <span className="sm:hidden">New</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 space-y-6">
        {/* Quick Stats / Overview Banner */}
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
              <Clock className={`w-3.5 h-3.5 ${overdueTasks.length > 0 ? 'text-rose-400' : 'text-slate-500'}`} />
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${overdueTasks.length > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
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
              <CalendarCheck className={`w-3.5 h-3.5 ${dueTodayTasks.length > 0 ? 'text-amber-400' : 'text-slate-500'}`} />
            </div>
            <div className={`text-xl sm:text-2xl font-bold ${dueTodayTasks.length > 0 ? 'text-amber-400' : 'text-slate-200'}`}>
              {dueTodayTasks.length}
            </div>
          </div>

          <div
            onClick={() => setActiveTab('all')}
            className="p-3.5 sm:p-4 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-slate-700 cursor-pointer transition-all"
          >
            <div className="flex items-center justify-between text-xs text-slate-400 mb-1">
              <span className="font-medium">Total Routines</span>
              <Layers className="w-3.5 h-3.5 text-indigo-400" />
            </div>
            <div className="text-xl sm:text-2xl font-bold text-slate-200">
              {activeTasks.length}
            </div>
          </div>
        </div>

        {/* View Tabs & Search */}
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            {/* View Switcher Tabs */}
            <div className="flex p-1 bg-slate-900/90 border border-slate-800 rounded-2xl">
              <button
                onClick={() => setActiveTab('due')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'due'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Due & Overdue
                {overdueTasks.length + dueTodayTasks.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === 'due' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {overdueTasks.length + dueTodayTasks.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('upcoming')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'upcoming'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Upcoming
                {upcomingTasks.length > 0 && (
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                    activeTab === 'upcoming' ? 'bg-indigo-800 text-indigo-100' : 'bg-slate-800 text-slate-300'
                  }`}>
                    {upcomingTasks.length}
                  </span>
                )}
              </button>

              <button
                onClick={() => setActiveTab('all')}
                className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                  activeTab === 'all'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                All Routines
              </button>
            </div>

            {/* Search Input */}
            <div className="relative flex-1 sm:max-w-xs">
              <Search className="w-3.5 h-3.5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search routines or tags..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-slate-900/90 border border-slate-800 rounded-2xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Tags Filter pills */}
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
                All
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

        {/* Task List Section */}
        <div className="space-y-3">
          {displayedTasks.length === 0 ? (
            <div className="py-16 text-center border border-dashed border-slate-800 rounded-3xl bg-slate-900/30">
              <div className="w-12 h-12 rounded-2xl bg-indigo-500/10 text-indigo-400 mx-auto flex items-center justify-center mb-3">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-semibold text-slate-200">
                {activeTab === 'due' ? 'All caught up!' : 'No routines found'}
              </h3>
              <p className="text-xs text-slate-400 max-w-xs mx-auto mt-1">
                {activeTab === 'due'
                  ? 'There are no overdue or pending tasks for today. Great rhythm!'
                  : 'Create your first recurring periodic routine to get started.'}
              </p>
              <button
                onClick={() => {
                  setEditingTask(null);
                  setIsTaskModalOpen(true);
                }}
                className="mt-4 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl inline-flex items-center gap-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                Add a Routine
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {displayedTasks.map((task) => (
                <TaskCard
                  key={task.id}
                  task={task}
                  onComplete={handleComplete}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <TaskModal
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setEditingTask(null);
        }}
        onSave={handleSave}
        initialTask={editingTask}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />
    </div>
  );
}

export default App;
