import { useEffect, useRef, useState } from 'react';
import {
  Calendar,
  Check,
  Flag,
  FolderInput,
  Maximize2,
  MoreHorizontal,
  Send,
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
  const todayStr = formatDate(new Date());

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
  const dateChipLabel = !dueAt ? 'No date' : dueAt === todayStr ? 'Today' : dueAt;

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
      className={`h-10 min-w-10 px-1.5 flex items-center justify-center rounded-lg ${
        active ? 'text-tt-blue bg-tt-blue-soft' : 'text-tt-secondary hover:bg-tt-hover'
      } ${extraClass}`}
    >
      {child}
    </button>
  );

  const shellClass = fullScreen
    ? 'fixed inset-0 z-[60] flex flex-col bg-tt-elevated'
    : 'fixed inset-x-0 bottom-0 z-[60] flex flex-col bg-tt-elevated rounded-t-[16px] shadow-[0_-4px_24px_var(--tt-shadow)]';

  return (
    <div className="fixed inset-0 z-[60]" data-testid="quick-add-sheet">
      <button type="button" className="absolute inset-0 bg-tt-scrim" aria-label="Dismiss" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Add task"
        className={shellClass}
        style={fullScreen ? undefined : { paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}
        onClick={(e) => e.stopPropagation()}
      >
        {!fullScreen && <div className="mx-auto mt-2 mb-1 w-9 h-1 rounded-full bg-tt-border" />}
        {fullScreen && (
          <div className="flex items-center h-14 px-2 border-b border-tt-border">
            <button type="button" onClick={() => setFullScreen(false)} aria-label="Exit full screen" className="w-10 h-10 flex items-center justify-center">
              <X className="w-5 h-5" />
            </button>
            <span className="flex-1 text-[17px] font-bold">New task</span>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => void submit(false)}
              className="px-3 py-1.5 text-[15px] font-semibold text-tt-blue disabled:opacity-40"
            >
              Done
            </button>
          </div>
        )}

        <div className={`px-4 ${fullScreen ? 'pt-4 flex-1' : 'pt-2'}`}>
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={onTitleKeyDown}
            enterKeyHint="done"
            autoComplete="off"
            placeholder="What would you like to do?"
            aria-label="Task title"
            className="w-full bg-transparent text-[17px] text-tt-text placeholder:text-tt-muted outline-none py-1.5"
          />
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Description"
            aria-label="Description"
            rows={fullScreen ? 8 : 1}
            className="w-full bg-transparent text-[15px] text-tt-text placeholder:text-tt-muted outline-none resize-none py-1 leading-snug"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-0.5 px-2 pt-1 pb-2">
          {toolBtn(
            'Date',
            panel === 'date' || !!dueAt,
            () => setPanel(panel === 'date' ? 'none' : 'date'),
            <span className="inline-flex items-center gap-1 px-1.5 text-[14px] font-medium text-tt-blue">
              <Calendar className="w-[18px] h-[18px]" strokeWidth={1.9} />
              {dateChipLabel}
            </span>,
            'min-w-0'
          )}
          {toolBtn('Priority', panel === 'priority' || priority !== 'none', () => setPanel(panel === 'priority' ? 'none' : 'priority'), (
            <Flag className="w-[20px] h-[20px]" strokeWidth={1.8} style={priority !== 'none' ? { color: PRI.find((p) => p.id === priority)?.color } : undefined} />
          ))}
          {toolBtn('Tags', panel === 'tags' || tags.length > 0, () => setPanel(panel === 'tags' ? 'none' : 'tags'), (
            <Tag className="w-[20px] h-[20px]" strokeWidth={1.8} />
          ))}
          {toolBtn('List', panel === 'list', () => setPanel(panel === 'list' ? 'none' : 'list'), (
            <FolderInput className="w-[20px] h-[20px]" strokeWidth={1.8} />
          ))}
          <div className="relative">
            {toolBtn('More', panel === 'more', () => setPanel(panel === 'more' ? 'none' : 'more'), (
              <MoreHorizontal className="w-[20px] h-[20px]" strokeWidth={1.8} />
            ))}
            {panel === 'more' && (
              <div
                role="menu"
                data-testid="quick-add-more"
                className="absolute bottom-[44px] left-1/2 -translate-x-1/2 w-[200px] rounded-[14px] bg-tt-menu py-2 shadow-[0_6px_28px_var(--tt-shadow)] z-10"
              >
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-3 h-[44px] px-4 text-[15px] text-tt-text hover:bg-tt-hover"
                  onClick={() => {
                    setFullScreen(true);
                    setPanel('none');
                  }}
                >
                  <Maximize2 className="w-[18px] h-[18px] text-tt-secondary" />
                  Full-Screen
                </button>
                <button
                  type="button"
                  role="menuitem"
                  className="w-full flex items-center gap-3 h-[44px] px-4 text-[15px] text-tt-text hover:bg-tt-hover"
                  onClick={() => {
                    setPanel('none');
                    onOpenSettings?.();
                  }}
                >
                  <Settings className="w-[18px] h-[18px] text-tt-secondary" />
                  Settings
                </button>
              </div>
            )}
          </div>
          <div className="flex-1" />
          <button
            type="button"
            aria-label="Add task"
            title="Add task"
            disabled={!canSubmit}
            onClick={() => void submit(true)}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors ${
              canSubmit ? 'bg-tt-blue text-white shadow-md shadow-tt-blue/25' : 'text-tt-muted'
            }`}
          >
            <Send className="w-[18px] h-[18px]" strokeWidth={2} />
          </button>
        </div>

        {/* Inline pickers */}
        {panel === 'date' && (
          <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-tt-border pt-2">
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
                className={`px-3 py-1.5 rounded-full text-[13px] font-medium ${
                  (value ? dueAt === value : !dueAt) ? 'bg-tt-blue text-white' : 'bg-tt-input text-tt-text'
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
              className="px-2 py-1.5 rounded-lg bg-tt-input text-[13px] outline-none"
            />
          </div>
        )}
        {panel === 'priority' && (
          <div className="px-3 pb-3 flex flex-wrap gap-2 border-t border-tt-border pt-2">
            {PRI.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setPriority(p.id);
                  setPanel('none');
                }}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[13px] font-medium border ${
                  priority === p.id ? 'border-current bg-tt-elevated' : 'border-transparent bg-tt-input text-tt-secondary'
                }`}
                style={priority === p.id ? { color: p.color } : undefined}
              >
                <Flag className="w-3.5 h-3.5" />
                {p.label}
              </button>
            ))}
          </div>
        )}
        {panel === 'tags' && (
          <div className="px-3 pb-3 border-t border-tt-border pt-2 space-y-2">
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTags((prev) => prev.filter((x) => x !== t))}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-tt-blue-soft text-tt-blue text-[12px] font-medium"
                >
                  #{t} <X className="w-3 h-3" />
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
                className="flex-1 px-3 py-2 rounded-xl bg-tt-input text-[14px] outline-none"
              />
              <button type="submit" className="px-3 rounded-xl bg-tt-blue text-white text-[13px] font-semibold">
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
                      className="px-2.5 py-1 rounded-full bg-tt-input text-[12px] text-tt-secondary"
                    >
                      #{t}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}
        {panel === 'list' && (
          <div className="max-h-48 overflow-y-auto border-t border-tt-border">
            {activeLists.map((l) => (
              <button
                key={l.id}
                type="button"
                onClick={() => {
                  setListId(l.id);
                  setPanel('none');
                }}
                className="w-full flex items-center gap-3 h-[44px] px-4 text-[15px] text-left hover:bg-tt-hover"
              >
                <span className="flex-1 truncate">{l.name}</span>
                {listId === l.id && <Check className="w-4 h-4 text-tt-blue" strokeWidth={2.4} />}
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
