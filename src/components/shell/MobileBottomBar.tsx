import type { ReactNode } from 'react';
import type { AppView } from '../../types/task';

interface MobileBottomBarProps {
  activeView: AppView;
  onTasks: () => void;
  onCalendar: () => void;
  onSettings: () => void;
}

/** Filled rounded check square (TickTick "Tasks" tab). */
function TasksGlyph({ active }: { active: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden>
      <rect
        width="22"
        height="22"
        rx="5"
        fill={active ? 'var(--tt-blue)' : 'var(--tt-tab-icon)'}
      />
      <path
        d="M6.2 11.4 L9.6 14.7 L15.9 7.6"
        stroke="var(--tt-bg)"
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Filled calendar with today's date knocked out (TickTick "Calendar" tab). */
function CalendarGlyph({ active, day }: { active: boolean; day: number }) {
  const fill = active ? 'var(--tt-blue)' : 'var(--tt-tab-icon)';
  return (
    <svg width="24" height="26" viewBox="0 0 24 26" aria-hidden>
      <rect x="5" y="0" width="3" height="6" rx="1.5" fill={fill} />
      <rect x="16" y="0" width="3" height="6" rx="1.5" fill={fill} />
      <rect x="0" y="3" width="24" height="23" rx="5" fill={fill} />
      <text
        x="12"
        y="20.5"
        textAnchor="middle"
        fontSize="13"
        fontWeight="700"
        fill="var(--tt-bg)"
        style={{ fontFamily: 'Roboto, -apple-system, "Segoe UI", sans-serif' }}
      >
        {day}
      </text>
    </svg>
  );
}

/** Filled hexagon with a round hole (TickTick "Settings" tab). */
function SettingsGlyph() {
  return (
    <svg width="22" height="24" viewBox="0 0 22 24" aria-hidden>
      <path
        fillRule="evenodd"
        fill="var(--tt-tab-icon)"
        d="M9 0.8 Q11 -0.35 13 0.8 L20 4.85 Q22 6 22 8.3 L22 15.7 Q22 18 20 19.15 L13 23.2 Q11 24.35 9 23.2 L2 19.15 Q0 18 0 15.7 L0 8.3 Q0 6 2 4.85 Z M11 8.4 A3.6 3.6 0 1 0 11 15.6 A3.6 3.6 0 1 0 11 8.4 Z"
      />
    </svg>
  );
}

/**
 * TickTick Android tab bar: icon-only Tasks | Calendar (today's date) | Settings.
 * No text labels (accessible names via aria-label). Board/Search live in the drawer.
 * Colors follow prefers-color-scheme through theme CSS variables.
 */
export function MobileBottomBar({
  activeView,
  onTasks,
  onCalendar,
  onSettings,
}: MobileBottomBarProps) {
  const dayNum = new Date().getDate();
  const calActive =
    activeView === 'calendar-month' || activeView === 'calendar-agenda';
  const tasksActive =
    !calActive && activeView !== 'board-status' && activeView !== 'board-list';

  const item = (label: string, isActive: boolean, onClick: () => void, glyph: ReactNode) => (
    <button
      type="button"
      aria-label={label}
      aria-current={isActive ? 'page' : undefined}
      title={label}
      onClick={onClick}
      className="flex-1 flex items-center justify-center bg-transparent border-0 cursor-pointer"
    >
      {glyph}
    </button>
  );

  return (
    <nav
      aria-label="Primary"
      data-tempo-tab-count="3"
      className="xl:hidden shrink-0 flex items-stretch h-14 bg-tt-bg"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)', boxSizing: 'content-box' }}
    >
      {item('Tasks', tasksActive, onTasks, <TasksGlyph active={tasksActive} />)}
      {item('Calendar', calActive, onCalendar, <CalendarGlyph active={calActive} day={dayNum} />)}
      {item('Settings', false, onSettings, <SettingsGlyph />)}
    </nav>
  );
}
