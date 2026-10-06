import { useSyncExternalStore } from 'react';
import { INBOX_LIST_ID } from '../types/task';

/**
 * Device-local UI preferences (theme, tab bar, list display, date/time, defaults).
 * Stored as one JSON blob in localStorage; not synced to Drive.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type TimeFormat = '12h' | '24h';
/** 0 = Sunday, 1 = Monday, 6 = Saturday (Date#getDay numbering). */
export type WeekStart = 0 | 1 | 6;
export type TabId = 'tasks' | 'calendar' | 'board' | 'search' | 'settings';
export type GroupBy = 'none' | 'date' | 'list' | 'priority' | 'tag';
export type SortBy = 'due' | 'priority' | 'title' | 'created';
export type ViewMode = 'list' | 'board';
export type SmartListId =
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'inbox'
  | 'all'
  | 'completed'
  | 'tags'
  | 'filters';

export interface Prefs {
  theme: ThemePref;
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  /** HH:MM — reminder time for tasks that only have a due date (no time). */
  defaultReminderTime: string;
  /** Fallback list for new tasks created outside a specific list view. */
  defaultListId: string;
  /** Task rows show a notes / subtask preview line. */
  showDetails: boolean;
  /** List views hide the trailing Completed group. */
  hideCompleted: boolean;
  groupBy: GroupBy;
  sortBy: SortBy;
  viewMode: ViewMode;
  /** Mobile bottom tabs, in order. */
  tabs: TabId[];
  /** Which smart lists / sections the drawer + sidebar show. */
  smartLists: Record<SmartListId, boolean>;
}

export const ALL_TABS: TabId[] = ['tasks', 'calendar', 'board', 'search', 'settings'];
export const TAB_LABELS: Record<TabId, string> = {
  tasks: 'Tasks',
  calendar: 'Calendar',
  board: 'Board',
  search: 'Search',
  settings: 'Settings',
};
export const MIN_TABS = 2;
export const MAX_TABS = 5;

export const SMART_LIST_IDS: SmartListId[] = [
  'today',
  'tomorrow',
  'next7',
  'inbox',
  'all',
  'completed',
  'tags',
  'filters',
];
export const SMART_LIST_LABELS: Record<SmartListId, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  next7: 'Next 7 Days',
  inbox: 'Inbox',
  all: 'All Open',
  completed: 'Completed',
  tags: 'Tags',
  filters: 'Filters',
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  weekStart: 0,
  timeFormat: '12h',
  defaultReminderTime: '09:00',
  defaultListId: INBOX_LIST_ID,
  showDetails: false,
  hideCompleted: false,
  groupBy: 'date',
  sortBy: 'due',
  viewMode: 'list',
  tabs: ['tasks', 'calendar', 'settings'],
  smartLists: {
    today: true,
    inbox: true,
    tomorrow: false,
    next7: false,
    all: false,
    completed: false,
    tags: false,
    filters: true,
  },
};

export const PREFS_STORAGE_KEY = 'tempo_prefs_v1';

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

/** Valid, de-duplicated tab list that always contains Tasks and has 2–5 entries. */
export function normalizeTabs(tabs: unknown): TabId[] {
  if (!Array.isArray(tabs)) return [...DEFAULT_PREFS.tabs];
  const out: TabId[] = [];
  for (const t of tabs) {
    if (ALL_TABS.includes(t as TabId) && !out.includes(t as TabId)) out.push(t as TabId);
  }
  if (!out.includes('tasks')) out.unshift('tasks');
  if (out.length < MIN_TABS) {
    for (const t of DEFAULT_PREFS.tabs) if (!out.includes(t) && out.length < MIN_TABS) out.push(t);
  }
  return out.slice(0, MAX_TABS);
}

/** Toggle a tab on/off, respecting the Tasks-required and 2..5 rules. */
export function toggleTab(tabs: TabId[], id: TabId): TabId[] {
  if (tabs.includes(id)) {
    if (id === 'tasks' || tabs.length <= MIN_TABS) return tabs;
    return tabs.filter((t) => t !== id);
  }
  if (tabs.length >= MAX_TABS) return tabs;
  return [...tabs, id];
}

/** Move a tab one slot left (-1) or right (+1). */
export function moveTab(tabs: TabId[], id: TabId, delta: -1 | 1): TabId[] {
  const i = tabs.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= tabs.length) return tabs;
  const next = [...tabs];
  [next[i], next[j]] = [next[j], next[i]];
  return next;
}

export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Prefs, unknown>>;
  const smartRaw = (r.smartLists && typeof r.smartLists === 'object' ? r.smartLists : {}) as Record<
    string,
    unknown
  >;
  const smartLists = { ...DEFAULT_PREFS.smartLists };
  for (const id of SMART_LIST_IDS) {
    if (typeof smartRaw[id] === 'boolean') smartLists[id] = smartRaw[id] as boolean;
  }
  const time = typeof r.defaultReminderTime === 'string' && /^\d{2}:\d{2}$/.test(r.defaultReminderTime)
    ? r.defaultReminderTime
    : DEFAULT_PREFS.defaultReminderTime;
  return {
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, DEFAULT_PREFS.theme),
    weekStart: oneOf(r.weekStart, [0, 1, 6] as const, DEFAULT_PREFS.weekStart),
    timeFormat: oneOf(r.timeFormat, ['12h', '24h'] as const, DEFAULT_PREFS.timeFormat),
    defaultReminderTime: time,
    defaultListId:
      typeof r.defaultListId === 'string' && r.defaultListId ? r.defaultListId : DEFAULT_PREFS.defaultListId,
    showDetails: typeof r.showDetails === 'boolean' ? r.showDetails : DEFAULT_PREFS.showDetails,
    hideCompleted: typeof r.hideCompleted === 'boolean' ? r.hideCompleted : DEFAULT_PREFS.hideCompleted,
    groupBy: oneOf(r.groupBy, ['none', 'date', 'list', 'priority', 'tag'] as const, DEFAULT_PREFS.groupBy),
    sortBy: oneOf(r.sortBy, ['due', 'priority', 'title', 'created'] as const, DEFAULT_PREFS.sortBy),
    viewMode: oneOf(r.viewMode, ['list', 'board'] as const, DEFAULT_PREFS.viewMode),
    tabs: r.tabs === undefined ? [...DEFAULT_PREFS.tabs] : normalizeTabs(r.tabs),
    smartLists,
  };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

function defaultStorage(): StorageLike | null {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
}

export function loadPrefs(storage: StorageLike | null = defaultStorage()): Prefs {
  if (!storage) return sanitizePrefs({});
  try {
    const raw = storage.getItem(PREFS_STORAGE_KEY);
    return sanitizePrefs(raw ? JSON.parse(raw) : {});
  } catch {
    return sanitizePrefs({});
  }
}

export function savePrefs(prefs: Prefs, storage: StorageLike | null = defaultStorage()): void {
  try {
    storage?.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* storage full / private mode */
  }
}

let current: Prefs | null = null;
const listeners = new Set<() => void>();

export function getPrefs(): Prefs {
  if (!current) current = loadPrefs();
  return current;
}

export function updatePrefs(patch: Partial<Prefs>): Prefs {
  const next = sanitizePrefs({ ...getPrefs(), ...patch });
  current = next;
  savePrefs(next);
  listeners.forEach((l) => l());
  return next;
}

export function subscribePrefs(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test helper: forget the in-memory copy so the next read hits storage. */
export function resetPrefsCache(): void {
  current = null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== PREFS_STORAGE_KEY) return;
    current = null;
    listeners.forEach((l) => l());
  });
}

export function usePrefs(): [Prefs, (patch: Partial<Prefs>) => Prefs] {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefs, getPrefs);
  return [prefs, updatePrefs];
}
