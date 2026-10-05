import {
  CheckSquare,
  CalendarDays,
  Columns3,
  Search,
  Settings,
} from 'lucide-react';
import type { AppView } from '../../types/task';

interface MobileBottomBarProps {
  activeView: AppView;
  onTasks: () => void;
  onCalendar: () => void;
  onBoard: () => void;
  onSearch: () => void;
  onSettings: () => void;
}

export function MobileBottomBar({
  activeView,
  onTasks,
  onCalendar,
  onBoard,
  onSearch,
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
  const boardActive = activeView === 'board-status' || activeView === 'board-list';

  const item = (active: boolean, onClick: () => void, children: React.ReactNode, title: string) => (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 ${
        active ? 'text-tt-blue' : 'text-tt-secondary'
      }`}
    >
      {children}
    </button>
  );

  return (
    <nav className="xl:hidden shrink-0 h-14 border-t border-tt-border bg-tt-surface flex items-stretch safe-pb">
      {item(tasksActive, onTasks, <CheckSquare className="w-6 h-6" />, 'Tasks')}
      {item(
        calActive,
        onCalendar,
        <span className="relative inline-flex w-6 h-6 items-center justify-center">
          <CalendarDays className="w-6 h-6" />
          <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold pt-1">
            {dayNum}
          </span>
        </span>,
        'Calendar'
      )}
      {item(boardActive, onBoard, <Columns3 className="w-6 h-6" />, 'Board')}
      {item(false, onSearch, <Search className="w-6 h-6" />, 'Search')}
      {item(false, onSettings, <Settings className="w-6 h-6" />, 'Settings')}
    </nav>
  );
}
