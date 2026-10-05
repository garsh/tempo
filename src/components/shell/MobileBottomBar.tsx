import { CheckSquare, CalendarDays, Settings } from 'lucide-react';
import type { AppView } from '../../types/task';

interface MobileBottomBarProps {
  activeView: AppView;
  /** Pure-black TickTick empty-inbox chrome */
  dark?: boolean;
  onTasks: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}

export function MobileBottomBar({
  activeView,
  dark = false,
  onTasks,
  onCalendar,
  onSettings,
}: MobileBottomBarProps) {
  const dayNum = new Date().getDate();
  const tasksActive =
    activeView !== 'calendar-month' &&
    activeView !== 'calendar-agenda' &&
    activeView !== 'board-status' &&
    activeView !== 'board-list';
  const calActive =
    activeView === 'calendar-month' || activeView === 'calendar-agenda';
  const settingsActive = false;

  const muted = dark ? 'text-[#8E8E93]' : 'text-tt-secondary';
  const active = 'text-tt-blue';

  const item = (
    isActive: boolean,
    onClick: () => void,
    children: React.ReactNode,
    title: string
  ) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-2 ${
        isActive ? active : muted
      }`}
    >
      {children}
    </button>
  );

  return (
    <nav
      className={`xl:hidden shrink-0 h-14 flex items-stretch safe-pb ${
        dark ? 'bg-black border-t border-white/5' : 'bg-tt-surface border-t border-tt-border'
      }`}
    >
      {item(
        tasksActive,
        onTasks,
        tasksActive ? (
          <span className="inline-flex w-7 h-7 rounded-[8px] bg-tt-blue items-center justify-center text-white shadow-sm shadow-tt-blue/40">
            <CheckSquare className="w-4 h-4" strokeWidth={2.5} />
          </span>
        ) : (
          <CheckSquare className="w-6 h-6" />
        ),
        'Tasks'
      )}
      {item(
        calActive,
        onCalendar,
        <span className="relative inline-flex w-6 h-6 items-center justify-center">
          <CalendarDays className="w-6 h-6" />
          <span
            className={`absolute inset-0 flex items-center justify-center text-[9px] font-bold pt-1 ${
              calActive ? 'text-tt-blue' : dark ? 'text-[#8E8E93]' : 'text-tt-secondary'
            }`}
          >
            {dayNum}
          </span>
        </span>,
        'Calendar'
      )}
      {item(settingsActive, onSettings, <Settings className="w-6 h-6" />, 'Settings')}
    </nav>
  );
}
