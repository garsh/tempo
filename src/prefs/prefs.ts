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
export type GroupBy = 'none' | 'date' | 'list' | 'priority' | 'tag';
export type SortBy = 'due' | 'priority' | 'title' | 'created';
export type ViewMode = 'list' | 'board';
export type SmartListId =
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'inbox'
  | 'all'
  | 'completed';

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
  /** Calendar views show overdue tasks. */
  showOverdue: boolean;
  groupBy: GroupBy;
  sortBy: SortBy;
  viewMode: ViewMode;
  /** Which smart lists / sections the drawer + sidebar show. */
  smartLists: Record<SmartListId, boolean>;
}

export const SMART_LIST_IDS: SmartListId[] = [
  'today',
  'tomorrow',
  'next7',
  'inbox',
  'all',
  'completed',
];
export const SMART_LIST_LABELS: Record<SmartListId, string> = {
  today: 'Today',
  tomorrow: 'Tomorrow',
  next7: 'Next 7 Days',
  inbox: 'Inbox',
  all: 'All Open',
  completed: 'Completed',
};

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  weekStart: 0,
  timeFormat: '12h',
  defaultReminderTime: '09:00',
  defaultListId: INBOX_LIST_ID,
  showDetails: false,
  hideCompleted: false,
  showOverdue: true,
  groupBy: 'date',
  sortBy: 'due',
  viewMode: 'list',
  smartLists: {
    today: true,
    inbox: true,
    tomorrow: false,
    next7: false,
    all: false,
    completed: false,
  },
};

export const PREFS_STORAGE_KEY = 'tempo_prefs_v1';

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

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
    showOverdue: typeof r.showOverdue === 'boolean' ? r.showOverdue : DEFAULT_PREFS.showOverdue,
    groupBy: oneOf(r.groupBy, ['none', 'date'] as const, DEFAULT_PREFS.groupBy),
    sortBy: oneOf(r.sortBy, ['due', 'title', 'created'] as const, DEFAULT_PREFS.sortBy),
    viewMode: oneOf(r.viewMode, ['list', 'board'] as const, DEFAULT_PREFS.viewMode),
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
