import { useEffect, useState } from 'react';
import type {
  DueFilterBucket,
  FilterCriteria,
  SavedFilter,
  TaskList,
  TaskPriority,
} from '../types/task';
import { X, Filter } from 'lucide-react';

interface SavedFilterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (filter: { id?: string; name: string; match: 'and' | 'or'; criteria: FilterCriteria }) => void;
  lists: TaskList[];
  availableTags: string[];
  initial?: SavedFilter | null;
}

const DUE_OPTIONS: { id: DueFilterBucket; label: string }[] = [
  { id: 'overdue', label: 'Overdue' },
  { id: 'today', label: 'Today' },
  { id: 'tomorrow', label: 'Tomorrow' },
  { id: 'next7', label: 'Next 7 days' },
  { id: 'later', label: 'Later' },
  { id: 'none', label: 'No due' },
];

const PRIORITY_OPTIONS: TaskPriority[] = ['high', 'medium', 'low', 'none'];

function toggleIn<T>(arr: T[], value: T): T[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

export function SavedFilterModal({
  isOpen,
  onClose,
  onSave,
  lists,
  availableTags,
  initial,
}: SavedFilterModalProps) {
  const [name, setName] = useState('');
  const [match, setMatch] = useState<'and' | 'or'>('and');
  const [tags, setTags] = useState<string[]>([]);
  const [priorities, setPriorities] = useState<TaskPriority[]>([]);
  const [dueBuckets, setDueBuckets] = useState<DueFilterBucket[]>([]);
  const [listIds, setListIds] = useState<string[]>([]);
  const [query, setQuery] = useState('');
  const [pinnedOnly, setPinnedOnly] = useState(false);
  const [tagDraft, setTagDraft] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (initial) {
      setName(initial.name);
      setMatch(initial.match);
      setTags(initial.criteria.tags || []);
      setPriorities(initial.criteria.priorities || []);
      setDueBuckets(initial.criteria.dueBuckets || []);
      setListIds(initial.criteria.listIds || []);
      setQuery(initial.criteria.query || '');
      setPinnedOnly(!!initial.criteria.pinnedOnly);
    } else {
      setName('');
      setMatch('and');
      setTags([]);
      setPriorities([]);
      setDueBuckets([]);
      setListIds([]);
      setQuery('');
      setPinnedOnly(false);
    }
    setTagDraft('');
  }, [isOpen, initial]);

  if (!isOpen) return null;

  const activeLists = lists.filter((l) => !l.deletedAt);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const criteria: FilterCriteria = {
      tags: tags.length ? tags : undefined,
      priorities: priorities.length ? priorities : undefined,
      dueBuckets: dueBuckets.length ? dueBuckets : undefined,
      listIds: listIds.length ? listIds : undefined,
      query: query.trim() || undefined,
      pinnedOnly: pinnedOnly || undefined,
    };
    onSave({
      id: initial?.id,
      name: name.trim(),
      match,
      criteria,
    });
    onClose();
  };

  const chip = (active: boolean) =>
    `px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
      active
        ? 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40'
        : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:text-tt-text/80'
    }`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-white border border-tt-border rounded-3xl shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-3 border-b border-tt-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-tt-blue">
              <Filter className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold text-tt-text">
              {initial ? 'Edit saved filter' : 'New saved filter'}
            </h2>
          </div>
          <button type="button" onClick={onClose} className="p-1.5 text-tt-secondary hover:text-tt-text">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1">
              Name
            </label>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. High priority work"
              className="w-full px-3 py-2 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-sm text-tt-text focus:outline-none focus:border-tt-blue"
            />
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1.5">
              Match mode
            </label>
            <div className="grid grid-cols-2 gap-2">
              {(['and', 'or'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMatch(m)}
                  className={`px-3 py-2 rounded-xl border text-xs font-semibold uppercase ${
                    match === m
                      ? 'bg-indigo-950/40 border-indigo-500 text-indigo-200'
                      : 'bg-tt-sidebar/40 border-tt-border text-tt-secondary'
                  }`}
                >
                  {m}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-tt-muted mt-1">
              AND = every selected criterion; OR = any selected criterion.
            </p>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1.5">
              Priorities
            </label>
            <div className="flex flex-wrap gap-1.5">
              {PRIORITY_OPTIONS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className={chip(priorities.includes(p))}
                  onClick={() => setPriorities((prev) => toggleIn(prev, p))}
                >
                  {p}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1.5">
              Due
            </label>
            <div className="flex flex-wrap gap-1.5">
              {DUE_OPTIONS.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  className={chip(dueBuckets.includes(d.id))}
                  onClick={() => setDueBuckets((prev) => toggleIn(prev, d.id))}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1.5">
              Lists
            </label>
            <div className="flex flex-wrap gap-1.5">
              {activeLists.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  className={chip(listIds.includes(l.id))}
                  onClick={() => setListIds((prev) => toggleIn(prev, l.id))}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {availableTags.map((t) => (
                <button
                  key={t}
                  type="button"
                  className={chip(tags.includes(t))}
                  onClick={() => setTags((prev) => toggleIn(prev, t))}
                >
                  #{t}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <input
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                placeholder="Add tag"
                className="flex-1 px-3 py-1.5 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-xs text-tt-text focus:outline-none focus:border-tt-blue"
              />
              <button
                type="button"
                onClick={() => {
                  const t = tagDraft.trim();
                  if (!t) return;
                  setTags((prev) => (prev.includes(t) ? prev : [...prev, t]));
                  setTagDraft('');
                }}
                className="px-3 py-1.5 bg-tt-sidebar text-xs rounded-xl text-tt-text"
              >
                Add
              </button>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-semibold uppercase tracking-wider text-tt-muted mb-1">
              Text query
            </label>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Title / notes contains…"
              className="w-full px-3 py-2 bg-tt-sidebar/70 border border-tt-border/80 rounded-xl text-sm text-tt-text focus:outline-none focus:border-tt-blue"
            />
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-tt-secondary cursor-pointer">
            <input
              type="checkbox"
              checked={pinnedOnly}
              onChange={(e) => setPinnedOnly(e.target.checked)}
              className="rounded border-slate-600"
            />
            Pinned only
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t border-tt-border">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-tt-secondary">
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-tt-blue hover:bg-tt-blue-hover text-white text-sm font-semibold"
            >
              Save filter
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
