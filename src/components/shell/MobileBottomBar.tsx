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

/**
 * Spare TickTick Android tab bar: Tasks | Calendar (date #) | Settings only.
 * Board/Search live in the drawer — never on this bar.
 */
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

  const muted = dark ? '#8E8E93' : '#8E8E93';
  const barBg = dark ? '#000000' : '#FFFFFF';
  const border = dark ? 'rgba(255,255,255,0.06)' : '#E8E8ED';

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
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        padding: '8px 0',
        border: 'none',
        background: 'transparent',
        color: isActive ? '#4772FA' : muted,
        cursor: 'pointer',
      }}
    >
      {children}
    </button>
  );

  return (
    <nav
      data-tempo-tab-count="3"
      className="xl:hidden shrink-0"
      style={{
        height: 56,
        display: 'flex',
        alignItems: 'stretch',
        background: barBg,
        borderTop: `1px solid ${border}`,
      }}
    >
      {item(
        tasksActive,
        onTasks,
        tasksActive ? (
          <span
            style={{
              display: 'inline-flex',
              width: 28,
              height: 28,
              borderRadius: 8,
              background: '#4772FA',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 12px rgba(71,114,250,0.45)',
            }}
          >
            <CheckSquare className="w-4 h-4" strokeWidth={2.5} color="#fff" />
          </span>
        ) : (
          <CheckSquare className="w-6 h-6" color={muted} />
        ),
        'Tasks'
      )}
      {item(
        calActive,
        onCalendar,
        <span style={{ position: 'relative', display: 'inline-flex', width: 24, height: 24 }}>
          <CalendarDays className="w-6 h-6" color={calActive ? '#4772FA' : muted} />
          <span
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 9,
              fontWeight: 700,
              paddingTop: 4,
              color: calActive ? '#4772FA' : muted,
            }}
          >
            {dayNum}
          </span>
        </span>,
        'Calendar'
      )}
      {item(false, onSettings, <Settings className="w-6 h-6" color={muted} />, 'Settings')}
    </nav>
  );
}
