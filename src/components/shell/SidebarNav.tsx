import type { AppView, Folder, SavedFilter, TaskList } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';
import {
  Sun,
  Sunrise,
  CalendarRange,
  Inbox,
  Layers,
  CheckCircle2,
  Plus,
  Trash2,
  Folder as FolderIcon,
  Tag,
  Filter,
  Columns3,
} from 'lucide-react';

const LIST_DOTS = ['#4772FA', '#34C759', '#FF9500', '#FF3B30', '#AF52DE', '#5AC8FA', '#FF2D55'];

function listDot(i: number) {
  return LIST_DOTS[i % LIST_DOTS.length];
}

function rowClass(active: boolean) {
  return `w-full flex items-center justify-between gap-2 px-3 py-[7px] rounded-lg text-[13px] transition-colors ${
    active
      ? 'bg-tt-blue-soft text-tt-blue font-semibold'
      : 'text-tt-text hover:bg-black/[0.04] font-medium'
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
  activeFolders: Folder[];
  unfiledLists: TaskList[];
  userLists: TaskList[];
  activeSavedFilters: SavedFilter[];
  allTags: string[];
  selectedTag: string | null;
  showNewListInput: boolean;
  showNewFolderInput: boolean;
  newListName: string;
  newFolderName: string;
  newListFolderId: string;
  onGo: (view: AppView) => void;
  onSelectTag: (tag: string | null) => void;
  onNewList: (e: React.FormEvent) => void;
  onNewFolder: (e: React.FormEvent) => void;
  onDeleteList: (list: TaskList) => void;
  onDeleteFolder: (folder: Folder) => void;
  onDeleteFilter: (filter: SavedFilter) => void;
  setShowNewListInput: (v: boolean) => void;
  setShowNewFolderInput: (v: boolean) => void;
  setNewListName: (v: string) => void;
  setNewFolderName: (v: string) => void;
  setNewListFolderId: (v: string) => void;
  onOpenFilterModal: () => void;
  onEditFilter: (f: SavedFilter) => void;
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
    activeFolders,
    unfiledLists,
    userLists,
    activeSavedFilters,
    allTags,
    selectedTag,
    showNewListInput,
    showNewFolderInput,
    newListName,
    newFolderName,
    newListFolderId,
    onGo,
    onSelectTag,
    onNewList,
    onNewFolder,
    onDeleteList,
    onDeleteFolder,
    onDeleteFilter,
    setShowNewListInput,
    setShowNewFolderInput,
    setNewListName,
    setNewFolderName,
    setNewListFolderId,
    onOpenFilterModal,
    onEditFilter,
  } = props;

  const smart: { id: AppView; label: string; Icon: typeof Sun; count: number | null }[] = [
    { id: 'today', label: 'Today', Icon: Sun, count: todayCount },
    { id: 'tomorrow', label: 'Tomorrow', Icon: Sunrise, count: tomorrowCount },
    { id: 'next7', label: 'Next 7 Days', Icon: CalendarRange, count: next7Count },
    { id: 'inbox', label: 'Inbox', Icon: Inbox, count: inboxCount },
    { id: 'all', label: 'All Open', Icon: Layers, count: openCount },
  ];

  const renderListRow = (list: TaskList, idx: number, indent = false) => (
    <div key={list.id} className={`relative group/list ${indent ? 'pl-2' : ''}`}>
      <button
        type="button"
        className={rowClass(activeView === `list:${list.id}`)}
        onClick={() => onGo(`list:${list.id}`)}
      >
        <span className="inline-flex items-center gap-2 truncate min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: listDot(idx) }}
          />
          <span className="truncate">{list.name}</span>
        </span>
      </button>
      {list.id !== INBOX_LIST_ID && (
        <button
          type="button"
          title={`Delete ${list.name}`}
          onClick={() => onDeleteList(list)}
          className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover/list:flex w-5 h-5 items-center justify-center rounded-md text-tt-overdue hover:bg-red-50"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-tt-sidebar text-tt-text">
      <div className="flex-1 overflow-y-auto px-2 py-3 space-y-4">
        <div className="space-y-0.5">
          {smart.map(({ id, label, Icon, count }) => (
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
            <span className="text-[11px] font-semibold text-tt-secondary">Lists</span>
            <button
              type="button"
              className="p-0.5 rounded text-tt-muted opacity-0 group-hover/sec:opacity-100 hover:text-tt-blue"
              onClick={() => setShowNewListInput(true)}
              title="New list"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
          {showNewListInput && (
            <form onSubmit={onNewList} className="px-2 mb-1 space-y-1">
              <input
                autoFocus
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                placeholder="List name"
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-tt-border bg-white"
              />
              <select
                value={newListFolderId}
                onChange={(e) => setNewListFolderId(e.target.value)}
                className="w-full px-2 py-1.5 text-xs rounded-lg border border-tt-border bg-white"
              >
                <option value="">No folder</option>
                {activeFolders.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
              <div className="flex gap-1">
                <button type="submit" className="flex-1 text-xs py-1 rounded-lg bg-tt-blue text-white">
                  Add
                </button>
                <button
                  type="button"
                  className="flex-1 text-xs py-1 rounded-lg bg-white border border-tt-border"
                  onClick={() => setShowNewListInput(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
          <div className="space-y-0.5">
            {activeFolders.map((folder, fi) => {
              const listsInFolder = userLists.filter((l) => l.folderId === folder.id);
              return (
                <div key={folder.id} className="group/folder">
                  <div className="flex items-center gap-1 px-3 py-1 text-[12px] text-tt-secondary font-semibold">
                    <FolderIcon className="w-3.5 h-3.5" />
                    <span className="flex-1 truncate">{folder.name}</span>
                    <button
                      type="button"
                      title={`Delete folder ${folder.name}`}
                      onClick={() => onDeleteFolder(folder)}
                      className="hidden group-hover/folder:flex w-5 h-5 items-center justify-center rounded-md text-tt-overdue"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                  {listsInFolder.map((list, li) => renderListRow(list, fi * 10 + li, true))}
                </div>
              );
            })}
            {unfiledLists.map((list, i) => renderListRow(list, i + 20))}
            {userLists.length === 0 && !showNewListInput && (
              <p className="px-3 text-[11px] text-tt-muted">No custom lists yet</p>
            )}
          </div>
          <button
            type="button"
            className="mt-1 mx-2 text-[11px] text-tt-muted hover:text-tt-blue inline-flex items-center gap-1"
            onClick={() => setShowNewFolderInput(true)}
          >
            <Plus className="w-3 h-3" /> Folder
          </button>
          {showNewFolderInput && (
            <form onSubmit={onNewFolder} className="px-2 mt-1 flex gap-1">
              <input
                autoFocus
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="Folder name"
                className="flex-1 px-2 py-1.5 text-xs rounded-lg border border-tt-border bg-white"
              />
              <button type="submit" className="text-xs px-2 rounded-lg bg-tt-blue text-white">
                Add
              </button>
            </form>
          )}
        </div>

        <div>
          <div className="flex items-center justify-between px-3 mb-1">
            <span className="text-[11px] font-semibold text-tt-secondary">Tags</span>
          </div>
          <div className="space-y-0.5">
            {allTags.length === 0 && (
              <p className="px-3 text-[11px] text-tt-muted">No tags yet</p>
            )}
            {allTags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={rowClass(selectedTag === tag)}
                onClick={() => onSelectTag(selectedTag === tag ? null : tag)}
              >
                <span className="inline-flex items-center gap-2 truncate">
                  <Tag className="w-3.5 h-3.5 text-tt-blue shrink-0" />
                  {tag}
                </span>
              </button>
            ))}
          </div>
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

        <div className="space-y-0.5 pt-1">
          <button
            type="button"
            className={rowClass(activeView === 'board-status' || activeView === 'board-list')}
            onClick={() => onGo('board-status')}
          >
            <span className="inline-flex items-center gap-2.5">
              <Columns3 className="w-4 h-4 opacity-80" />
              Board
            </span>
          </button>
        </div>
      </div>

      <div className="shrink-0 border-t border-tt-border/80 px-2 py-2 space-y-0.5">
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
      </div>
    </div>
  );
}
