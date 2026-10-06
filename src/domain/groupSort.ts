import type { Task, TaskList, TaskPriority } from '../types/task';
import { INBOX_LIST_ID, PRIORITY_ORDER } from '../types/task';
import type { GroupBy, SortBy } from '../prefs/prefs';
import { formatDate, isCompleted } from './recurrence';
import { sortTasksForDailyView } from './sorting';
import { groupTasksForListView } from './taskGroups';

export interface TaskSection {
  /** Stable id (used for collapse state); 'completed' is always the trailing group. */
  id: string;
  /** Empty label = render rows without a section header (Group by: None). */
  label: string;
  tasks: Task[];
  /** Optional color dot (list groups). */
  color?: string;
}

const pinFirst = (a: Task, b: Task) => (a.pinned ? 0 : 1) - (b.pinned ? 0 : 1);
const priRank = (p?: TaskPriority | null) => PRIORITY_ORDER[p ?? 'none'] ?? PRIORITY_ORDER.none;

/**
 * Sort tasks per Group & Sort › Sort by. Pinned tasks always float to the top.
 * - due: urgency → priority → deadline → title (the classic daily-view order)
 * - priority: high → none, then the due order
 * - title: A–Z (locale aware)
 * - created: newest first
 */
export function sortTasks(tasks: Task[], sortBy: SortBy, now: Date = new Date()): Task[] {
  const byDue = sortTasksForDailyView(tasks, now);
  if (sortBy === 'due') return byDue;
  const dueIndex = new Map(byDue.map((t, i) => [t.id, i]));
  const tie = (a: Task, b: Task) => (dueIndex.get(a.id) ?? 0) - (dueIndex.get(b.id) ?? 0);
  return [...tasks].sort((a, b) => {
    const pin = pinFirst(a, b);
    if (pin) return pin;
    if (sortBy === 'priority') return priRank(a.priority) - priRank(b.priority) || tie(a, b);
    if (sortBy === 'title')
      return a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || tie(a, b);
    return (b.createdAt ?? 0) - (a.createdAt ?? 0) || tie(a, b);
  });
}

export interface GroupSortOptions {
  groupBy: GroupBy;
  sortBy: SortBy;
  /** Append a Completed section for completed one-offs. */
  includeCompleted?: boolean;
  lists?: TaskList[];
  /** Color per list id, for list-group dots. */
  listColor?: (listId: string) => string | undefined;
  todayKey?: string;
  now?: Date;
}

const PRIORITY_SECTIONS: { id: TaskPriority; label: string }[] = [
  { id: 'high', label: 'High Priority' },
  { id: 'medium', label: 'Medium Priority' },
  { id: 'low', label: 'Low Priority' },
  { id: 'none', label: 'No Priority' },
];

/**
 * Group + sort for list views (Group & Sort sheet). Empty sections are omitted.
 * Completed one-offs never mix into open sections; they go in a trailing 'completed'
 * section when `includeCompleted` is set, newest completion first.
 */
export function groupAndSortTasks(tasks: Task[], opts: GroupSortOptions): TaskSection[] {
  const now = opts.now ?? new Date();
  const open = tasks.filter((t) => !isCompleted(t));
  const done = tasks
    .filter((t) => isCompleted(t))
    .sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
  const sections: TaskSection[] = [];
  const push = (s: TaskSection) => {
    if (s.tasks.length) sections.push({ ...s, tasks: sortTasks(s.tasks, opts.sortBy, now) });
  };

  switch (opts.groupBy) {
    case 'none':
      push({ id: 'all', label: '', tasks: open });
      break;
    case 'date': {
      const todayKey = opts.todayKey ?? (opts.now ? formatDate(opts.now) : undefined);
      for (const g of groupTasksForListView(open, { todayKey })) push(g);
      break;
    }
    case 'priority':
      for (const p of PRIORITY_SECTIONS) {
        push({ id: `pri:${p.id}`, label: p.label, tasks: open.filter((t) => (t.priority ?? 'none') === p.id) });
      }
      break;
    case 'list': {
      const lists = (opts.lists ?? []).filter((l) => !l.deletedAt);
      const ordered = [
        ...lists.filter((l) => l.id === INBOX_LIST_ID),
        ...lists.filter((l) => l.id !== INBOX_LIST_ID).sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      ];
      const known = new Set(ordered.map((l) => l.id));
      for (const l of ordered) {
        push({ id: `list:${l.id}`, label: l.name, tasks: open.filter((t) => t.listId === l.id), color: opts.listColor?.(l.id) });
      }
      push({ id: 'list:_other', label: 'Other', tasks: open.filter((t) => !known.has(t.listId)) });
      break;
    }
    case 'tag': {
      // A task appears under its first tag (TickTick behavior), tags A–Z, untagged last.
      const byTag = new Map<string, Task[]>();
      const untagged: Task[] = [];
      for (const t of open) {
        const tag = t.tags?.[0];
        if (!tag) untagged.push(t);
        else byTag.set(tag, [...(byTag.get(tag) ?? []), t]);
      }
      for (const tag of [...byTag.keys()].sort((a, b) => a.localeCompare(b))) {
        push({ id: `tag:${tag}`, label: `#${tag}`, tasks: byTag.get(tag)! });
      }
      push({ id: 'tag:_none', label: 'No Tags', tasks: untagged });
      break;
    }
  }

  if (opts.includeCompleted && done.length) {
    sections.push({ id: 'completed', label: 'Completed', tasks: done });
  }
  return sections;
}
