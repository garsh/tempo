import { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Flag,
  FolderInput,
  Maximize2,
  MoreHorizontal,
  Plus,
  Settings,
  Tag,
  X,
} from 'lucide-react';
import type { TaskInput, TaskList, TaskPriority } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { formatDate } from '../domain/recurrence';
import { dueAtForSelectedDay } from '../domain/calendarUi';
import { buildQuickAddTask, resetAfterQuickAdd, titleEnterShouldSubmit } from '../domain/quickAdd';

const PRI: { id: TaskPriority; label: string; color: string }[] = [
  { id: 'high', label: 'High', color: '#E03131' },
  { id: 'medium', label: 'Medium', color: '#FAA80C' },
  { id: 'low', label: 'Low', color: '#4772FA' },
  { id: 'none', label: 'None', color: '#C7C7CC' },
];

export interface QuickAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called for each submitted task. Sheet stays open and clears the title. */
  onSave: (task: TaskInput) => void | Promise<void>;
  lists: TaskList[];
  defaultListId?: string;
  /** Pre-filled due date (YYYY-MM-DD). Calendar FAB passes the selected day. */
  defaultDueAt?: string | null;
  initialTitle?: string;
  availableTags?: string[];
  onOpenSettings?: () => void;
}

/**
 * TickTick-style quick add: title + description, toolbar with date chip / priority /
 * tags / list / … more / paper-plane submit. Enter (enterKeyHint=done) on the title
 * submits and keeps the sheet open for the next task — closest web stand-in for
 * TickTick's keyboard checkmark key.
 */
export function QuickAddSheet({
  isOpen,
  onClose,
  onSave,
  lists,
  defaultListId = INBOX_LIST_ID,
  defaultDueAt = null,
  initialTitle = '',
  availableTags = [],
  onOpenSettings,
}: QuickAddSheetProps) {
  const titleRef = useRef<HTMLInputElement>(null);
  const [title, setTitle] = useState(initialTitle);
  const [notes, setNotes] = useState('');
  const [dueAt, setDueAt] = useState<string | null>(null);
  const [priority, setPriority] = useState<TaskPriority>('none');
  const [listId, setListId] = useState(defaultListId);
  const [tags, setTags] = useState<string[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [panel, setPanel] = useState<'none' | 'date' | 'priority' | 'tags' | 'list' | 'more'>('none');
  const [fullScreen, setFullScreen] = useState(false);
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [visualViewportHeight, setVisualViewportHeight] = useState<number | null>(null);
  const todayStr = formatDate(new Date());

  useEffect(() => {
    if (!isOpen || typeof window === 'undefined') return;
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => {
      const inset = Math.max(0, Math.round(window.innerHeight - (vv.height + vv.offsetTop)));
      setKeyboardInset(inset);
      setVisualViewportHeight(Math.round(vv.height));
    };

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();

    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
      setKeyboardInset(0);
      setVisualViewportHeight(null);
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setNotes('');
    setDueAt(dueAtForSelectedDay(defaultDueAt, todayStr));
    setPriority('none');
    setListId(defaultListId);
    setTags([]);
    setTagDraft('');
    setPanel('none');
    setFullScreen(false);
    const t = window.setTimeout(() => titleRef.current?.focus(), 50);
    return () => clearTimeout(t);
    // Reset only when the sheet opens / defaults change for a new open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, defaultListId, defaultDueAt, initialTitle]);

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);
  const canSubmit = title.trim().length > 0;
  const datePart = dueAt ? dueAt.slice(0, 10) : '';
  const dateChipLabel = !dueAt
    ? 'No date'
    : datePart === todayStr
      ? 'Today'
      : (() => {
          const tmrw = new Date();
          tmrw.setDate(tmrw.getDate() + 1);
          if (datePart === formatDate(tmrw)) return 'Tomorrow';
          const [y, m, d] = datePart.split('-').map(Number);
          const dt = new Date(y, m - 1, d);
          return dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
        })();

  const submit = async (keepOpen: boolean) => {
    const task = buildQuickAddTask({ title, notes, dueAt, priority, listId, tags });
    if (!task) return;
    await onSave(task);
    if (keepOpen) {
      const next = resetAfterQuickAdd({ title, notes, dueAt, priority, listId, tags });
      setTitle(next.title);
      setNotes(next.notes);
      setPanel('none');
      requestAnimationFrame(() => titleRef.current?.focus());
    } else {
      onClose();
    }
  };

  const onTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!titleEnterShouldSubmit(e.key, 'title')) return;
    // No newlines in the title; Enter / IME "Done" submits (TickTick checkmark).
    e.preventDefault();
    void submit(true);
  };

  const toolBtn = (
    label: string,
    active: boolean,
    onClick: () => void,
    child: React.ReactNode,
    extraClass = ''
  ) => (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={active}
      onClick={onClick}
      className={`h-11 min-w-11 px-2 flex items-center justify-center rounded-xl transition-colors ${
        active
          ? 'text-tt-blue bg-tt-blue-soft dark:bg-tt-blue/20 dark:text-blue-300'
          : 'text-tt-text/80 hover:text-tt-text hover:bg-tt-hover'
      } ${extraClass}`}
    >
      {child}
    </button>
  );

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[60] flex flex-col bg-white dark:bg-[#252528] overflow-y-auto'
    : 'fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-white dark:bg-[#252528] rounded-t-[20px] border-t border-tt-border/80 dark:border-white/10 shadow-[0_-8px_32px_rgba(0,0,0,0.18)] dark:shadow-[0_-8px_32px_rgba(0,0,0,0.45)] overflow-y-auto';

  const dialogStyle: React.CSSProperties = fullScreen
    ? {
        bottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined,
      }
    : {
        bottom: keyboardInset > 0 ? `${keyboardInset}px` : undefined,
        paddingBottom: keyboardInset > 0 ? '8px' : 'max(8px, env(safe-area-inset-bottom))',
        maxHeight: visualViewportHeight ? `${visualViewportHeight}px` : undefined,
      };

  return (
    <div className="fixed inset-0 z-[60]" data-testid="quick-add-sheet">
      <button type="button" className="absolute inset-0 bg-black/30 dark:bg-black/45 backdrop-blur-[2px]" aria-label="Dismiss" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add task"
        className={shellClass}
        style={dialogStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {!fullScreen && <div className="mx-auto mt-2.5 mb-1.5 w-10 h-1 rounded-full bg-tt-border dark:bg-white/20" />}
        {fullScreen && (
          <div className="flex items-center h-14 px-2 border-b border-tt-border">
            <button type="button" onClick={() => setFullScreen(false)} aria-label="Exit full screen" className="w-10 h-10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
            <span className="flex-1 text-[18px] font-bold">New task</span>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit(false)}
              className="px-3 py-1.5 text-[16px] font-semibold text-tt-blue disabled:opacity-40"
            >
              Done
            </button>
          </div>
        )}

        <div className={`px-4 sm:px-5 ${fullScreen ? 'pt-4 flex-1' : 'pt-2'}`}>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            enterKeyHint="done"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            placeholder="What would you like to do?"
            aria-label="Task title"
            className="w-full bg-transparent text-[20px] sm:text-[22px] font-semibold text-tt-text placeholder:text-tt-muted/70 outline-none py-2"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            autoComplete="off"
            autoCorrect="off"
            data-form-type="other"
            data-1p-ignore="true"
            data-lpignore="true"
            placeholder="Description"
            aria-label="Description"
            rows={fullScreen ? 8 : 1}
            className="w-full bg-transparent text-[16px] sm:text-[17px] text-tt-text placeholder:text-tt-muted/60 outline-none resize-none py-1.5 leading-relaxed"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-3 pt-1 pb-3">
          {toolBtn(
            'Date',
            panel === 'date' || !!dueAt,
            () => setPanel(panel === 'date' ? 'none' : 'date'),
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[16px] sm:text-[17px] font-semibold text-tt-blue dark:text-blue-300">
              <Calendar className="w-5 h-5" strokeWidth={2.1} />
              <span>{dateChipLabel}</span>
            </span>,
            'min-w-0'
          )}
          {toolBtn('Priority', panel === 'priority' || priority !== 'none', () => setPanel(panel === 'priority' ? 'none' : 'priority'), (
            <Flag className="w-[21px] h-[21px]" strokeWidth={2} style={priority !== 'none' ? { color: PRI.find((p) => p.id === priority)?.color } : undefined} />
          ))}
          {toolBtn('Tags', panel === 'tags' || tags.length > 0, () => setPanel(panel === 'tags' ? 'none' : 'tags'), (
            <Tag className="w-[21px] h-[21px]" strokeWidth={2} />
          ))}
          {toolBtn('List', panel === 'list', () => setPanel(panel === 'list' ? 'none' : 'list'), (
            <FolderInput className="w-[21px] h-[21px]" strokeWidth={2} />
          ))}
          <div className="relative">
            {toolBtn('More', panel === 'more', () => setPanel(panel === 'more' ? 'none' : 'more'), (
              <MoreHorizontal className="w-[21px] h-[21px]" strokeWidth={2} />
            ))}
            {panel === 'more' && (
              <div
                role="menu"
                data-testid="quick-add-more"
                className="absolute bottom-[48px] left-1/2 -translate-x-1/2 w-[210px] rounded-[16px] bg-white dark:bg-[#2c2c30] border border-tt-border/80 dark:border-white/10 py-2 shadow-[0_8px_30px_rgba(0,0,0,0.2)] z-10"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-3 h-[46px] px-4 text-[16px] text-tt-text hover:bg-tt-hover"
                  onClick={() => {
                    setFullScreen(true);
                    setPanel('none');
                  }}
                >
                  <Maximize2 className="w-5 h-5 text-tt-secondary" />
                  Full-Screen
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-3 h-[46px] px-4 text-[16px] text-tt-text hover:bg-tt-hover"
                  onClick={() => {
                    setPanel('none');
                    onOpenSettings?.();
                  }}
                >
                  <Settings className="w-5 h-5 text-tt-secondary" />
                  Settings
                </button>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Create task"
            title="Create task"
            disabled={!canSubmit}
            onClick={() => void submit(false)}
            className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl text-[16px] font-bold tracking-wide transition-all ${
              canSubmit
                ? 'bg-blue-600 hover:bg-blue-700 active:scale-95 text-white shadow-md shadow-blue-600/30 cursor-pointer'
                : 'bg-zinc-200 dark:bg-zinc-700 text-zinc-700 dark:text-zinc-200 border border-zinc-300 dark:border-zinc-600 cursor-not-allowed'
            }`}
          >
            <Plus className="w-5 h-5 shrink-0" strokeWidth={3} />
            <span className="leading-none">Create</span>
          </button>
        </div>

        {/* Inline pickers */}
        {panel === 'date' && (
          <div className="px-4 pb-3.5 flex flex-wrap items-center gap-2.5 border-t border-tt-border/80 dark:border-white/10 pt-3">
            {[
              ['Today', todayStr],
              ['Tomorrow', (() => { const d = new Date(); d.setDate(d.getDate() + 1); return formatDate(d); })()],
              ['No date', ''],
            ].map(([label, value]) => (
              <button
                key={label}
                type="button"
                onClick={() => {
                  setDueAt(value || null);
                  setPanel('none');
                }}
                className={`px-4 py-2 rounded-xl text-[15px] sm:text-[16px] font-semibold transition-colors ${
                  (value ? dueAt === value : !dueAt)
                    ? 'bg-tt-blue text-white shadow-sm'
                    : 'bg-tt-input dark:bg-white/10 text-tt-text hover:bg-tt-hover'
                }`}
              >
                {label}
              </button>
            ))}
            <input
              type="date"
              aria-label="Pick a date"
              value={dueAt && /^\d{4}-\d{2}-\d{2}$/.test(dueAt) ? dueAt : ''}
              onChange={(e) => {
                if (e.target.value) {
                  setDueAt(e.target.value);
                  setPanel('none');
                }
              }}
              className="px-3.5 py-2 rounded-xl bg-tt-input dark:bg-white/10 text-[15px] sm:text-[16px] font-medium text-tt-text outline-none border border-tt-border/80 dark:border-white/10"
            />
          </div>
        )}
        {panel === 'priority' && (
          <div className="px-4 pb-3.5 flex flex-wrap gap-2.5 border-t border-tt-border/80 dark:border-white/10 pt-3">
            {PRI.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPriority(p.id);
                  setPanel('none');
                }}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-[15px] font-semibold border transition-colors ${
                  priority === p.id
                    ? 'border-current bg-tt-blue-soft/50 dark:bg-white/15'
                    : 'border-transparent bg-tt-input dark:bg-white/10 text-tt-text/80 hover:bg-tt-hover'
                }`}
                style={priority === p.id ? { color: p.color } : undefined}
              >
                <Flag className="w-4 h-4" />
                {p.label}
              </button>
            ))}
          </div>
        )}
        {panel === 'tags' && (
          <div className="px-4 pb-3.5 border-t border-tt-border/80 dark:border-white/10 pt-3 space-y-2.5">
            <div className="flex flex-wrap gap-2">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-tt-blue-soft dark:bg-tt-blue/20 text-tt-blue dark:text-blue-300 text-[14px] font-medium"
                >
                  #{t} <X className="w-3.5 h-3.5" />
                </button>
              ))}
            </div>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const t = tagDraft.trim().replace(/^#/, '');
                if (!t) return;
                setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                setTagDraft('');
              }}
            >
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add tag"
                aria-label="Add tag"
                className="flex-1 px-3.5 py-2 rounded-xl bg-tt-input dark:bg-white/10 text-[15px] text-tt-text outline-none border border-tt-border/80 dark:border-white/10"
              />
              <button type="submit" className="px-4 rounded-xl bg-tt-blue text-white text-[15px] font-semibold">
                Add
              </button>
            </form>
            {availableTags.filter((t) => !tags.includes(t)).length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {availableTags
                  .filter((t) => !tags.includes(t))
                  .slice(0, 12)
                  .map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setTags((prev) => [...prev, t])}
                      className="px-3 py-1 rounded-full bg-tt-input dark:bg-white/10 text-[13px] text-tt-text/80 hover:bg-tt-hover"
                    >
                      #{t}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
        {panel === 'list' && (
          <div className="max-h-48 overflow-y-auto border-t border-tt-border/80 dark:border-white/10">
            {activeLists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setListId(l.id);
                  setPanel('none');
                }}
                className="w-full flex items-center gap-3 h-[48px] px-4 text-[16px] text-left hover:bg-tt-hover"
              >
                <span className="flex-1 truncate">{l.name}</span>
                {listId === l.id && <Check className="w-5 h-5 text-tt-blue" strokeWidth={2.4} />}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** Back-compat alias — App and share-target still import QuickCaptureModal. */
export { QuickAddSheet as QuickCaptureModal };
