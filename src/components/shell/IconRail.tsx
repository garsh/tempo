import {
  CheckSquare,
  CalendarDays,
  Search,
  Cloud,
  Settings,
} from 'lucide-react';
import type { AppView } from '../../types/task';

interface IconRailProps {
  activeView: AppView;
  syncPhase: string;
  onTasks: () => void;
  onCalendar: () => void;
  onSearch: () => void;
  onSync: () => void;
  onSettings: () => void;
}

function railBtn(active: boolean) {
  return `w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
    active
      ? 'bg-tt-blue text-white shadow-sm'
      : 'text-white/70 hover:text-white hover:bg-white/10'
  }`;
}

export function IconRail({
  activeView,
  syncPhase,
  onTasks,
  onCalendar,
  onSearch,
  onSync,
  onSettings,
}: IconRailProps) {
  const tasksActive =
    activeView !== 'calendar-month' &&
    activeView !== 'calendar-agenda' &&
    !String(activeView).startsWith('board');
  const calActive =
    activeView === 'calendar-month' || activeView === 'calendar-agenda';

  return (
    <aside className="hidden xl:flex w-14 shrink-0 flex-col items-center py-3 gap-2 bg-tt-rail text-white">
      <div
        className="w-9 h-9 rounded-full bg-tt-blue flex items-center justify-center text-sm font-bold mb-2"
        title="Tempo"
      >
        T
      </div>

      <button type="button" className={railBtn(tasksActive)} onClick={onTasks} title="Tasks">
        <CheckSquare className="w-5 h-5" />
      </button>
      <button type="button" className={railBtn(calActive)} onClick={onCalendar} title="Calendar">
        <CalendarDays className="w-5 h-5" />
      </button>
      <button type="button" className={railBtn(false)} onClick={onSearch} title="Search">
        <Search className="w-5 h-5" />
      </button>

      <div className="flex-1" />

      <button
        type="button"
        className={`${railBtn(false)} ${syncPhase === 'syncing' ? 'animate-pulse text-tt-blue' : ''}`}
        onClick={onSync}
        title="Sync"
      >
        <Cloud className="w-5 h-5" />
      </button>
      <button type="button" className={railBtn(false)} onClick={onSettings} title="Settings">
        <Settings className="w-5 h-5" />
      </button>
    </aside>
  );
}
