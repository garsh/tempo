import {
  useCallback,
  useDeferredValue,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import { ArrowLeft, Search, X } from 'lucide-react';
import type { Task } from '../../types/task';
import {
  createNextOccurrenceCache,
  searchTasks,
  type SearchResultItem,
} from '../../domain/search';
import { TaskCard } from '../TaskCard';
import { TaskGroupHeader } from '../shell/TaskGroupHeader';

const NOOP_COMPLETE = () => {};

export interface TaskSearchViewProps {
  tasks: Task[];
  query: string;
  onQueryChange: (nextQuery: string) => void;
  onClose: () => void;
  showDetails: boolean;
  embedded?: boolean;
  selectedTaskId?: string | null;
  onJumpToDate: (dateStr: string, expandCompleted: boolean) => void;
  onComplete: (id: string, dateStr?: string) => void;
  onUncomplete: (id: string, dateStr?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onRequestChangeDate: (task: Task, anchorRect?: DOMRect) => void;
  onRequestLogDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestSkipOccurrence: (task: Task) => void;
  onRequestDelete: (task: Task) => void;
  inputRef?: RefObject<HTMLInputElement | null>;
}

/**
 * In-place task search view replacing the calendar header and day list while open.
 * Esc is intentionally left to App's single global Escape handler.
 */
export function TaskSearchView({
  tasks,
  query,
  onQueryChange,
  onClose,
  showDetails,
  embedded = false,
  selectedTaskId = null,
  onJumpToDate,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
  onRequestChangeDate,
  onRequestLogDate,
  onRequestSkipOccurrence,
  onRequestDelete,
  inputRef,
}: TaskSearchViewProps) {
  const inputId = useId();
  const localInputRef = useRef<HTMLInputElement | null>(null);
  const resolvedInputRef = inputRef ?? localInputRef;
  const rowRefs = useRef(new Map<string, HTMLDivElement>());

  const [completedCollapsed, setCompletedCollapsed] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [liveAnnouncement, setLiveAnnouncement] = useState('');

  const deferredQuery = useDeferredValue(query);
  const cacheRef = useRef(createNextOccurrenceCache());

  useEffect(() => {
    resolvedInputRef.current?.focus({ preventScroll: true });
  }, [resolvedInputRef]);

  const results = useMemo(
    () => searchTasks(tasks, deferredQuery, new Date(), cacheRef.current),
    [tasks, deferredQuery]
  );

  const visibleItems = useMemo(
    () =>
      completedCollapsed
        ? results.active
        : [...results.active, ...results.completed],
    [results.active, results.completed, completedCollapsed]
  );

  useEffect(() => {
    setActiveIndex(-1);
  }, [deferredQuery]);

  const effectiveActiveIndex =
    visibleItems.length === 0
      ? -1
      : activeIndex >= visibleItems.length
        ? visibleItems.length - 1
        : activeIndex;

  useEffect(() => {
    if (effectiveActiveIndex < 0) return;
    const item = visibleItems[effectiveActiveIndex];
    if (!item) return;
    const rowKey = `${item.status}:${item.id}:${item.task.dueAt ?? ''}`;
    rowRefs.current.get(rowKey)?.scrollIntoView?.({ block: 'nearest' });
  }, [effectiveActiveIndex, visibleItems]);

  useEffect(() => {
    const trimmed = deferredQuery.trim();
    if (!trimmed) {
      setLiveAnnouncement('');
      return;
    }
    const total = results.active.length + results.completed.length;
    const timer = window.setTimeout(() => {
      if (total === 0) {
        setLiveAnnouncement(`No tasks matching "${trimmed}"`);
      } else {
        setLiveAnnouncement(`${total} ${total === 1 ? 'task' : 'tasks'} found`);
      }
    }, 350);
    return () => window.clearTimeout(timer);
  }, [deferredQuery, results.active.length, results.completed.length]);

  const activateItem = useCallback(
    (item: SearchResultItem) => {
      if (item.jumpDateStr) {
        onJumpToDate(item.jumpDateStr, item.status === 'completed');
      } else {
        onEdit(item.task);
      }
    },
    [onJumpToDate, onEdit]
  );

  const handleInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      if (visibleItems.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) =>
        prev < 0 || prev >= visibleItems.length - 1 ? 0 : prev + 1
      );
      return;
    }

    if (e.key === 'ArrowUp') {
      if (visibleItems.length === 0) return;
      e.preventDefault();
      setActiveIndex((prev) =>
        prev <= 0 ? visibleItems.length - 1 : prev - 1
      );
      return;
    }

    if (e.key === 'Enter') {
      if (e.nativeEvent.isComposing || e.keyCode === 229) {
        return;
      }
      if (visibleItems.length === 0) return;
      e.preventDefault();
      const targetIndex = effectiveActiveIndex >= 0 ? effectiveActiveIndex : 0;
      const item = visibleItems[targetIndex];
      if (item) activateItem(item);
    }
  };

  const registerRowRef = useCallback(
    (rowKey: string) => (el: HTMLDivElement | null) => {
      if (el) rowRefs.current.set(rowKey, el);
      else rowRefs.current.delete(rowKey);
    },
    []
  );

  const trimmedDeferred = deferredQuery.trim();
  const hasQuery = query.trim().length > 0;
  const totalMatches = results.active.length + results.completed.length;

  const renderRow = (item: SearchResultItem, flatIndex: number) => {
    const rowKey = `${item.status}:${item.id}:${item.task.dueAt ?? ''}`;
    const isCompletedItem = item.status === 'completed';

    return (
      <TaskCard
        key={rowKey}
        task={item.task}
        selected={flatIndex === effectiveActiveIndex || (selectedTaskId != null && selectedTaskId === item.id)}
        showDetails={showDetails}
        notesSnippet={item.notesSnippet}
        highlightTokens={results.tokens}
        reorderEnabled={false}
        rowRef={registerRowRef(rowKey)}
        onSelect={() => activateItem(item)}
        onEdit={item.jumpDateStr ? undefined : onEdit}
        onComplete={item.completable ? onComplete : NOOP_COMPLETE}
        onUncomplete={item.completable ? onUncomplete : undefined}
        onRequestChangeDate={onRequestChangeDate}
        onRequestLogDate={onRequestLogDate}
        onRequestSkipOccurrence={isCompletedItem ? undefined : onRequestSkipOccurrence}
        onRequestDelete={onRequestDelete}
        onDelete={onDelete}
      />
    );
  };

  return (
    <>
      <header className="shrink-0 flex items-center gap-1 sm:gap-2 h-14 sm:h-16 compact-landscape:h-12 desktop:h-14 px-2.5 sm:px-5 bg-tt-bg desktop:bg-tt-surface border-b border-tt-border text-tt-text z-20">
        <div className="max-w-3xl mx-auto w-full flex items-center gap-2 min-w-0">
          <search className="flex-1 flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close search"
              title="Close search"
              className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </button>

            <label htmlFor={inputId} className="sr-only">
              Search tasks
            </label>
            <div className="flex-1 flex items-center gap-2 min-w-0 h-10 compact-landscape:h-9 px-3 rounded-xl bg-tt-input">
              <Search className="w-4 h-4 shrink-0 text-tt-muted" aria-hidden="true" />
              <input
                ref={resolvedInputRef}
                id={inputId}
                data-testid="search-tasks-input"
                type="search"
                value={query}
                onChange={(e) => onQueryChange(e.target.value)}
                onKeyDown={handleInputKeyDown}
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck={false}
                placeholder="Search tasks…"
                className="flex-1 min-w-0 bg-transparent text-[16px] desktop:text-[15px] text-tt-text placeholder:text-tt-muted focus:outline-none [&::-webkit-search-cancel-button]:hidden"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    onQueryChange('');
                    resolvedInputRef.current?.focus({ preventScroll: true });
                  }}
                  aria-label="Clear search"
                  title="Clear search"
                  className="shrink-0 w-7 h-7 flex items-center justify-center rounded-full text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" strokeWidth={2} />
                </button>
              )}
            </div>
          </search>
          {embedded && (
            <span className="hidden desktop:inline-flex items-center gap-1.5 text-[11px] text-tt-muted shrink-0 select-none">
              <kbd className="px-1.5 py-0.5 rounded bg-tt-sidebar border border-tt-border font-mono">↑↓</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-tt-sidebar border border-tt-border font-mono">↵</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-tt-sidebar border border-tt-border font-mono">Esc</kbd>
            </span>
          )}
        </div>
      </header>

      <div className="sr-only" role="status" aria-live="polite" data-testid="search-status">
        {liveAnnouncement}
      </div>

      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg desktop:bg-tt-surface">
          <div className="flex-1 overflow-y-auto overscroll-y-contain tt-scroll-stable min-h-0 px-3 sm:px-5 pt-2 pb-20 desktop:pb-6">
            <div className="max-w-3xl mx-auto w-full space-y-2" data-testid="search-results">
              {!hasQuery && !trimmedDeferred ? (
                <p className="text-sm text-tt-muted px-4 py-10 text-center">
                  Search by title or notes
                </p>
              ) : trimmedDeferred && totalMatches === 0 ? (
                <p className="text-sm text-tt-muted px-4 py-10 text-center">
                  No tasks matching &ldquo;{trimmedDeferred}&rdquo;
                </p>
              ) : (
                <>
                  {results.active.length > 0 && (
                    <div>
                      <div className="px-3 sm:px-4 py-2 flex items-center gap-1.5 bg-tt-bg desktop:bg-tt-surface">
                        <span className="text-[20px] desktop:text-[16px] font-bold text-tt-text">Tasks</span>
                        <span className="text-[13px] text-tt-muted tabular-nums">
                          {results.active.length}
                        </span>
                      </div>
                      {results.active.map((item, idx) => renderRow(item, idx))}
                    </div>
                  )}

                  {results.completed.length > 0 && (
                    <div>
                      <TaskGroupHeader
                        label="Completed"
                        count={results.completed.length}
                        collapsed={completedCollapsed}
                        onToggle={() => setCompletedCollapsed((prev) => !prev)}
                        sticky={false}
                      />
                      {!completedCollapsed &&
                        results.completed.map((item, idx) =>
                          renderRow(item, results.active.length + idx)
                        )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
