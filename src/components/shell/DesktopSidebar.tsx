import {
  Calendar,
  Keyboard,
  ListChecks,
  Plus,
  RefreshCw,
  Search,
  Settings,
} from 'lucide-react';
import type { SyncStatusSnapshot } from '../../sync/autoSync';

export type DesktopNavItem = 'calendar' | 'tasks' | 'recurring' | 'search';

interface DesktopSidebarProps {
  wide: boolean;
  activeNav: DesktopNavItem;
  tasksDotTone: 'overdue' | 'amber' | 'green' | null;
  tasksCount: number;
  syncPhase: SyncStatusSnapshot['phase'];
  syncNeedsAuth?: boolean;
  onSelectCalendar: () => void;
  onSelectTasks: () => void;
  onSelectRecurring: () => void;
  onSelectSearch: () => void;
  onNewTask: () => void;
  onOpenShortcuts: () => void;
  onOpenSettings: () => void;
}

function dotToneClass(tone: 'overdue' | 'amber' | 'green'): string {
  if (tone === 'overdue') return 'bg-tt-overdue';
  if (tone === 'amber') return 'bg-amber-500';
  return 'bg-tt-ring-green';
}

/**
 * Persistent left navigation rail/sidebar for desktop viewports (>= 1024px & tall).
 * Collapses to an icon rail on 1024–1279px and expands with labels + shortcut hints at 1280px+.
 */
export function DesktopSidebar({
  wide,
  activeNav,
  tasksDotTone,
  tasksCount,
  syncPhase,
  syncNeedsAuth = false,
  onSelectCalendar,
  onSelectTasks,
  onSelectRecurring,
  onSelectSearch,
  onNewTask,
  onOpenShortcuts,
  onOpenSettings,
}: DesktopSidebarProps) {
  const navBtn = (active: boolean) =>
    `relative w-full flex items-center ${
      wide ? 'justify-start px-3 gap-2.5 h-9' : 'justify-center px-0 h-10'
    } rounded-xl text-[14px] transition-colors cursor-pointer ${
      active
        ? 'bg-tt-blue-soft text-tt-blue font-semibold'
        : 'text-tt-text hover:bg-tt-hover font-medium'
    }`;

  return (
    <aside
      data-testid="desktop-sidebar"
      aria-label="Sidebar"
      className={`shrink-0 h-full bg-tt-sidebar border-r border-tt-border flex flex-col select-none ${
        wide ? 'w-[208px] 2xl:w-[224px]' : 'w-16'
      }`}
    >
      {/* Brand header */}
      <div
        className={`h-14 shrink-0 flex items-center border-b border-tt-border/60 ${
          wide ? 'px-4 gap-2.5' : 'justify-center'
        }`}
      >
        <span
          aria-hidden="true"
          className="w-7 h-7 rounded-lg bg-tt-blue text-white flex items-center justify-center font-bold text-sm shadow-xs shrink-0"
        >
          T
        </span>
        {wide && (
          <span className="text-[16px] font-bold tracking-tight text-tt-text truncate">
            Tempo
          </span>
        )}
      </div>

      {/* Primary CTA */}
      <div className={wide ? 'px-3 pt-3 pb-2' : 'px-2 pt-3 pb-2 flex justify-center'}>
        <button
          type="button"
          onClick={onNewTask}
          aria-label="New task"
          title={wide ? 'New task (N)' : 'New task (N)'}
          className={`flex items-center justify-center rounded-xl bg-tt-blue hover:bg-tt-blue-hover active:scale-[0.98] text-white font-semibold shadow-sm shadow-tt-blue/25 transition-all cursor-pointer ${
            wide ? 'w-full h-9 px-3 gap-2 text-[14px]' : 'w-10 h-10'
          }`}
        >
          <Plus className="w-4 h-4 shrink-0" strokeWidth={2.4} />
          {wide && (
            <>
              <span className="flex-1 text-left">New Task</span>
              <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-white/15 text-white/90">
                N
              </kbd>
            </>
          )}
        </button>
      </div>

      {/* Main Navigation */}
      <nav
        aria-label="Main navigation"
        className={`flex-1 overflow-y-auto py-1 space-y-0.5 ${wide ? 'px-2.5' : 'px-2'}`}
      >
        <button
          type="button"
          onClick={onSelectCalendar}
          aria-current={activeNav === 'calendar' ? 'page' : undefined}
          title={wide ? undefined : 'Calendar (1)'}
          className={navBtn(activeNav === 'calendar')}
        >
          <Calendar className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
          {wide && <span className="flex-1 text-left truncate">Calendar</span>}
        </button>

        <button
          type="button"
          onClick={onSelectTasks}
          aria-current={activeNav === 'tasks' ? 'page' : undefined}
          title={wide ? undefined : 'Tasks (2)'}
          className={navBtn(activeNav === 'tasks')}
        >
          <ListChecks className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
          {wide ? (
            <>
              <span className="flex-1 text-left truncate">Tasks</span>
              {tasksDotTone && (
                <span
                  data-testid="tasks-nav-dot"
                  aria-hidden="true"
                  className={`w-2 h-2 rounded-full shrink-0 ${dotToneClass(tasksDotTone)}`}
                />
              )}
              {tasksCount > 0 && (
                <span className="text-[12px] text-tt-secondary tabular-nums shrink-0">
                  {tasksCount}
                </span>
              )}
            </>
          ) : (
            tasksDotTone && (
              <span
                data-testid="tasks-nav-dot"
                aria-hidden="true"
                className={`absolute top-2 right-2 w-2 h-2 rounded-full ring-2 ring-tt-sidebar ${dotToneClass(
                  tasksDotTone
                )}`}
              />
            )
          )}
        </button>

        <button
          type="button"
          onClick={onSelectRecurring}
          aria-current={activeNav === 'recurring' ? 'page' : undefined}
          title={wide ? undefined : 'Recurring (3)'}
          className={navBtn(activeNav === 'recurring')}
        >
          <RefreshCw className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
          {wide && <span className="flex-1 text-left truncate">Recurring</span>}
        </button>

        <button
          type="button"
          onClick={onSelectSearch}
          aria-current={activeNav === 'search' ? 'page' : undefined}
          title={wide ? undefined : 'Search (/)'}
          className={navBtn(activeNav === 'search')}
        >
          <Search className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
          {wide && (
            <>
              <span className="flex-1 text-left truncate">Search</span>
              <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-tt-hover text-tt-secondary">
                /
              </kbd>
            </>
          )}
        </button>
      </nav>

      {/* Footer Utilities */}
      <div className={`mt-auto border-t border-tt-border/60 py-2 space-y-0.5 ${wide ? 'px-2.5' : 'px-2'}`}>
        <button
          type="button"
          onClick={onOpenShortcuts}
          title={wide ? undefined : 'Keyboard shortcuts (?)'}
          className={navBtn(false)}
        >
          <Keyboard className="w-[18px] h-[18px] shrink-0 text-tt-secondary" strokeWidth={1.9} />
          {wide && (
            <>
              <span className="flex-1 text-left truncate text-tt-secondary">Shortcuts</span>
              <kbd className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-tt-hover text-tt-secondary">
                ?
              </kbd>
            </>
          )}
        </button>

        <button
          type="button"
          onClick={onOpenSettings}
          title={wide ? undefined : 'Settings'}
          className={navBtn(false)}
        >
          <span className="relative shrink-0">
            <Settings className="w-[18px] h-[18px] text-tt-secondary" strokeWidth={1.9} />
            {(syncPhase === 'error' || syncPhase === 'syncing' || syncNeedsAuth) && (
              <span
                aria-hidden="true"
                className={`absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-tt-sidebar ${
                  syncPhase === 'error'
                    ? 'bg-tt-overdue'
                    : syncPhase === 'syncing'
                      ? 'bg-tt-blue animate-pulse'
                      : 'bg-tt-icon-amber'
                }`}
              />
            )}
          </span>
          {wide && <span className="flex-1 text-left truncate text-tt-secondary">Settings</span>}
        </button>
      </div>
    </aside>
  );
}
