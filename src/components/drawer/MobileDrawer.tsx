import { useState } from 'react';
import { ChevronDown, ChevronRight, Filter, Folder as FolderIcon, List, Search, Tag } from 'lucide-react';
import type { AppView, Folder, SavedFilter, TaskList } from '../../types/task';
import type { SmartListId } from '../../prefs/prefs';
import { SMART_LIST_LABELS } from '../../prefs/prefs';
import { listDotColor } from '../../theme/listColors';
import type { GoogleAccount } from '../../sync/googleAccount';
import type { AccountSummary } from '../../sync/accountSummary';
import { AddSquareIcon, Avatar, HexGearIcon, ManageListsIcon, WarnDot } from './drawerBits';
import { SmartListIcon } from './SmartListIcon';

/** Smart lists rendered as rows, in drawer order (Tags / Filters are sections). */
const SMART_ROWS = ['today', 'tomorrow', 'next7', 'inbox', 'all', 'completed'] as const satisfies readonly SmartListId[];

interface MobileDrawerProps {
  open: boolean;
  activeView: AppView;
  account: GoogleAccount | null;
  summary: AccountSummary;
  smartLists: Record<SmartListId, boolean>;
  counts: Partial<Record<SmartListId, number>>;
  folders: Folder[];
  userLists: TaskList[];
  filters: SavedFilter[];
  tags: string[];
  selectedTag: string | null;
  onClose: () => void;
  onGo: (view: AppView) => void;
  onSelectTag: (tag: string | null) => void;
  onSearch: () => void;
  onSettings: () => void;
  onAccount: () => void;
  onAdd: () => void;
  onManage: () => void;
  onListMenu: (list: TaskList) => void;
  onFolderMenu: (folder: Folder) => void;
  onEditFilter: (filter: SavedFilter) => void;
}

/**
 * TickTick Android left drawer: navy panel (navy even in light mode), account header
 * with search + settings, Today / Inbox (+ optional smart lists), folders & lists with
 * color dots, and a bottom bar with "+ Add" and the manage-smart-lists button.
 */
export function MobileDrawer(props: MobileDrawerProps) {
  const { open, activeView, account, summary, smartLists, counts, folders, userLists, filters, tags } = props;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  if (!open) return null;

  const colorIndex = new Map(userLists.map((l, i) => [l.id, i]));
  const rowBase =
    'w-full h-[52px] flex items-center gap-[15px] pl-4 pr-4 rounded-[15px] text-left text-[17px] font-bold tracking-[0.005em] text-tt-drawer-text';
  const rowCls = (active: boolean) => `${rowBase} ${active ? 'bg-tt-drawer-pill' : 'active:bg-tt-drawer-pill/60'}`;
  const count = (n: number | undefined) =>
    n ? <span className="ml-auto text-[14px] font-normal text-tt-drawer-muted tabular-nums">{n}</span> : null;
  const longPress = (fn: () => void) => ({
    onContextMenu: (e: React.MouseEvent) => {
      e.preventDefault();
      fn();
    },
  });

  const listRow = (list: TaskList, indent = false) => (
    <button
      key={list.id}
      type="button"
      className={`${rowCls(activeView === `list:${list.id}`)} ${indent ? 'pl-9' : ''}`}
      onClick={() => props.onGo(`list:${list.id}`)}
      {...longPress(() => props.onListMenu(list))}
    >
      <List className="w-[19px] h-[19px] shrink-0 text-tt-drawer-muted" strokeWidth={2} />
      <span className="truncate min-w-0">{list.name}</span>
      <span className="ml-auto flex items-center gap-3">
        <span
          className="w-2 h-2 rounded-full"
          style={{ backgroundColor: listDotColor(colorIndex.get(list.id) ?? 0) }}
          aria-hidden
        />
      </span>
    </button>
  );

  const unfiled = userLists.filter((l) => !l.folderId || !folders.some((f) => f.id === l.folderId));
  const showTags = smartLists.tags && tags.length > 0;
  const showFilters = smartLists.filters && filters.length > 0;

  return (
    <div className="lg:hidden fixed inset-0 z-50 flex" data-testid="mobile-drawer">
      <nav
        aria-label="Lists"
        className="w-[355px] max-w-[86.4vw] h-full flex flex-col bg-tt-drawer text-tt-drawer-text shadow-2xl"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        {/* Header: avatar + account / sync status | search, settings */}
        <div className="shrink-0 flex items-center pl-[21px] pr-[13px] pt-[32px] pb-[27px]">
          <button
            type="button"
            onClick={props.onAccount}
            className="flex-1 min-w-0 flex items-center gap-[23px] text-left"
            aria-label={`Account: ${summary.title}`}
          >
            <Avatar account={account} size={34} />
            <span className="min-w-0 flex flex-col">
              <span className="text-[18px] leading-[22px] font-bold truncate">{summary.title}</span>
              <span
                className={`mt-[3px] flex items-center gap-[6px] text-[14px] leading-[18px] truncate ${
                  summary.warn ? 'text-tt-icon-amber' : 'text-tt-drawer-muted'
                }`}
              >
                {summary.warn && <WarnDot />}
                <span className="truncate">{summary.subtitle}</span>
              </span>
            </span>
          </button>
          <button
            type="button"
            onClick={props.onSearch}
            aria-label="Search"
            title="Search"
            className="w-10 h-10 ml-1 flex items-center justify-center"
          >
            <Search className="w-[22px] h-[22px]" strokeWidth={1.9} />
          </button>
          <button
            type="button"
            onClick={props.onSettings}
            aria-label="Settings"
            title="Settings"
            className="w-10 h-10 flex items-center justify-center"
          >
            <HexGearIcon />
          </button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-3 pb-3">
          <div className="space-y-[1px]">
            {SMART_ROWS.filter((id) => smartLists[id]).map((id) => (
              <button key={id} type="button" className={rowCls(activeView === id)} onClick={() => props.onGo(id)}>
                <SmartListIcon id={id} />
                <span className="truncate">{SMART_LIST_LABELS[id]}</span>
                {count(counts[id])}
              </button>
            ))}
          </div>

          {(folders.length > 0 || userLists.length > 0) && (
            <>
              <div className="mx-4 my-2 h-px bg-tt-drawer-divider" />
              <div className="space-y-[1px]">
                {folders.map((folder) => {
                  const inFolder = userLists.filter((l) => l.folderId === folder.id);
                  const isCollapsed = !!collapsed[folder.id];
                  return (
                    <div key={folder.id}>
                      <button
                        type="button"
                        className={rowCls(false)}
                        onClick={() => setCollapsed((c) => ({ ...c, [folder.id]: !c[folder.id] }))}
                        aria-expanded={!isCollapsed}
                        {...longPress(() => props.onFolderMenu(folder))}
                      >
                        <FolderIcon className="w-[19px] h-[19px] shrink-0 text-tt-drawer-muted" strokeWidth={2} />
                        <span className="truncate min-w-0">{folder.name}</span>
                        <span className="ml-auto text-tt-drawer-muted">
                          {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                        </span>
                      </button>
                      {!isCollapsed && inFolder.map((l) => listRow(l, true))}
                    </div>
                  );
                })}
                {unfiled.map((l) => listRow(l))}
              </div>
            </>
          )}

          {showFilters && (
            <>
              <div className="mx-4 my-2 h-px bg-tt-drawer-divider" />
              <div className="px-4 pt-1 pb-1 text-[13px] font-semibold text-tt-drawer-muted">Filters</div>
              {filters.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={rowCls(activeView === `filter:${f.id}`)}
                  onClick={() => props.onGo(`filter:${f.id}`)}
                  {...longPress(() => props.onEditFilter(f))}
                >
                  <Filter className="w-[19px] h-[19px] shrink-0 text-tt-drawer-muted" strokeWidth={2} />
                  <span className="truncate">{f.name}</span>
                </button>
              ))}
            </>
          )}

          {showTags && (
            <>
              <div className="mx-4 my-2 h-px bg-tt-drawer-divider" />
              <div className="px-4 pt-1 pb-1 text-[13px] font-semibold text-tt-drawer-muted">Tags</div>
              {tags.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className={rowCls(props.selectedTag === tag)}
                  onClick={() => props.onSelectTag(props.selectedTag === tag ? null : tag)}
                >
                  <Tag className="w-[19px] h-[19px] shrink-0 text-tt-drawer-muted" strokeWidth={2} />
                  <span className="truncate">{tag}</span>
                </button>
              ))}
            </>
          )}
        </div>

        {/* Bottom bar: + Add | manage smart lists */}
        <div
          className="shrink-0 flex items-center pl-[27px] pr-[18px] h-[56px] box-content"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button
            type="button"
            onClick={props.onAdd}
            className="flex items-center gap-[14px] h-11 pr-3 text-[17px] font-bold"
            aria-label="Add list or folder"
          >
            <AddSquareIcon />
            Add
          </button>
          <button
            type="button"
            onClick={props.onManage}
            className="ml-auto w-10 h-10 flex items-center justify-center"
            aria-label="Manage smart lists"
            title="Manage smart lists"
          >
            <ManageListsIcon />
          </button>
        </div>
      </nav>
      <div className="flex-1 bg-tt-scrim" onClick={props.onClose} aria-hidden />
    </div>
  );
}
