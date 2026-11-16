import type { AppView, Folder, SavedFilter, TaskList } from '../../types/task';
import type { SmartListId } from '../../prefs/prefs';
import {
  CalendarDays,
  Sun,
  Sunrise,
  CalendarRange,
  Inbox,
  Layers,
  CheckCircle2,
  Plus,
  Trash2,
  Filter,
  SlidersHorizontal,
} from 'lucide-react';

function rowClass(active: boolean) {
  return `w-full flex items-center justify-between gap-2 px-3 py-[7px] rounded-lg text-[13px] transition-colors ${
    active
      ? 'bg-tt-blue-soft text-tt-blue font-semibold'
      : 'text-tt-text hover:bg-tt-hover font-medium'
  }`;
}

interface SidebarNavProps {
  activeView: AppView;
  todayCount: number;
  tomorrowCount: number;
  next7Count: number;
  inboxCount: number;
  openCount: number;
  completedCount: number;
  activeFolders?: Folder[];
  unfiledLists?: TaskList[];
  userLists?: TaskList[];
  activeSavedFilters: SavedFilter[];
  allTags?: string[];
  selectedTag?: string | null;
  showNewListInput?: boolean;
  showNewFolderInput?: boolean;
  newListName?: string;
  newFolderName?: string;
  newListFolderId?: string;
  onGo: (view: AppView) => void;
  onSelectTag?: (tag: string | null) => void;
  onNewList?: (e: React.FormEvent) => void;
  onNewFolder?: (e: React.FormEvent) => void;
  onDeleteList?: (list: TaskList) => void;
  onDeleteFolder?: (folder: Folder) => void;
  onDeleteFilter: (filter: SavedFilter) => void;
  setShowNewListInput?: (v: boolean) => void;
  setShowNewFolderInput?: (v: boolean) => void;
  setNewListName?: (v: string) => void;
  setNewFolderName?: (v: string) => void;
  setNewListFolderId?: (v: string) => void;
  onOpenFilterModal: () => void;
  onEditFilter: (f: SavedFilter) => void;
  /** Smart-list visibility (shared with the mobile drawer's manage sheet). */
  smartLists: Record<SmartListId, boolean>;
  onManageSmartLists: () => void;
}

export function SidebarNav(props: SidebarNavProps) {
  const {
    activeView,
    todayCount,
    tomorrowCount,
    next7Count,
    inboxCount,
    openCount,
    completedCount,
    activeSavedFilters,
    onGo,
    onDeleteFilter,
    onOpenFilterModal,
    onEditFilter,
    smartLists,
    onManageSmartLists,
  } = props;

  const smart: { id: AppView & SmartListId; label: string; Icon: typeof Sun; count: number | null }[] = [
    { id: 'today', label: 'Today', Icon: Sun, count: todayCount },
    { id: 'tomorrow', label: 'Tomorrow', Icon: Sunrise, count: tomorrowCount },
    { id: 'next7', label: 'Next 7 Days', Icon: CalendarRange, count: next7Count },
    { id: 'inbox', label: 'Inbox', Icon: Inbox, count: inboxCount },
    { id: 'all', label: 'All Open', Icon: Layers, count: openCount },
  ];

  return (
    <div className="h-full flex flex-col bg-tt-sidebar text-tt-text">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-0.5">
          <button
            type="button"
            className={rowClass(activeView === 'calendar-month' || activeView === 'calendar-agenda')}
            onClick={() => onGo('calendar-month')}
          >
            <span className="inline-flex items-center gap-2.5 min-w-0">
              <CalendarDays className="w-4 h-4 shrink-0 text-tt-blue" />
              <span className="truncate">Calendar</span>
            </span>
          </button>
          {smart.filter(({ id }) => smartLists[id]).map(({ id, label, Icon, count }) => (
            <button
              key={id}
              type="button"
              className={rowClass(activeView === id)}
              onClick={() => onGo(id)}
            >
              <span className="inline-flex items-center gap-2.5 min-w-0">
                <Icon className="w-4 h-4 shrink-0 opacity-80" />
                <span className="truncate">{label}</span>
              </span>
              {count != null && count > 0 && (
                <span className="text-[12px] text-tt-secondary tabular-nums shrink-0">{count}</span>
              )}
            </button>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between px-3 mb-1 group/sec">
            <span className="text-[11px] font-semibold text-tt-secondary">Filters</span>
            <button
              type="button"
              className="p-0.5 rounded text-tt-muted opacity-0 group-hover/sec:opacity-100 hover:text-tt-blue"
              onClick={onOpenFilterModal}
              title="New filter"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-0.5">
            {activeSavedFilters.map((f) => (
              <div key={f.id} className="relative group/filter">
                <button
                  type="button"
                  className={rowClass(activeView === `filter:${f.id}`)}
                  onClick={() => onGo(`filter:${f.id}`)}
                  onDoubleClick={() => onEditFilter(f)}
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Filter className="w-3.5 h-3.5 shrink-0 opacity-70" />
                    {f.name}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onDeleteFilter(f)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/filter:flex w-5 h-5 items-center justify-center rounded-md text-tt-overdue"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="shrink-0 border-t border-tt-border/80 px-2 py-2 space-y-0.5">
        {smartLists.completed && (
        <button
          type="button"
          className={rowClass(activeView === 'completed')}
          onClick={() => onGo('completed')}
        >
          <span className="inline-flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 opacity-80" />
            Completed
          </span>
          {completedCount > 0 && (
            <span className="text-[12px] text-tt-secondary tabular-nums">{completedCount}</span>
          )}
        </button>
        )}
        <button type="button" className={rowClass(false)} onClick={onManageSmartLists}>
          <span className="inline-flex items-center gap-2.5 text-tt-secondary">
            <SlidersHorizontal className="w-4 h-4 opacity-80" />
            Manage smart lists
          </span>
        </button>
      </div>
    </div>
  );
}
