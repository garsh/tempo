import { useSyncExternalStore } from 'react';

/**
 * Device-local UI preferences (theme, calendar week start, time format, display toggles).
 * Stored as one JSON blob in localStorage; not synced to Drive.
 */

export type ThemePref = 'system' | 'light' | 'dark';
export type TimeFormat = '12h' | '24h';
/** 0 = Sunday, 1 = Monday, 6 = Saturday (Date#getDay numbering). */
export type WeekStart = 0 | 1 | 6;
export type NewTaskPosition = 'bottom' | 'top';
export type Hemisphere = 'north' | 'south';

export interface Prefs {
  theme: ThemePref;
  weekStart: WeekStart;
  timeFormat: TimeFormat;
  /** Hemisphere used by seasonal date-window quick presets. */
  hemisphere: Hemisphere;
  /** Where newly created tasks are inserted in manually orderable lists. */
  newTaskPosition: NewTaskPosition;
  /** Task rows show a notes preview line. */
  showDetails: boolean;
  /** Calendar view hides the trailing Completed group. */
  hideCompleted: boolean;
  /** Calendar views show overdue tasks. */
  showOverdue: boolean;
}

export const DEFAULT_PREFS: Prefs = {
  theme: 'system',
  weekStart: 0,
  timeFormat: '12h',
  hemisphere: 'north',
  newTaskPosition: 'bottom',
  showDetails: false,
  hideCompleted: false,
  showOverdue: true,
};

export const PREFS_STORAGE_KEY = 'tempo_prefs_v1';

const oneOf = <T extends string | number>(v: unknown, allowed: readonly T[], fallback: T): T =>
  allowed.includes(v as T) ? (v as T) : fallback;

export function sanitizePrefs(raw: unknown): Prefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<Record<keyof Prefs, unknown>>;
  return {
    theme: oneOf(r.theme, ['system', 'light', 'dark'] as const, DEFAULT_PREFS.theme),
    weekStart: oneOf(r.weekStart, [0, 1, 6] as const, DEFAULT_PREFS.weekStart),
    timeFormat: oneOf(r.timeFormat, ['12h', '24h'] as const, DEFAULT_PREFS.timeFormat),
    hemisphere: oneOf(r.hemisphere, ['north', 'south'] as const, DEFAULT_PREFS.hemisphere),
    newTaskPosition: oneOf(r.newTaskPosition, ['bottom', 'top'] as const, DEFAULT_PREFS.newTaskPosition),
    showDetails: typeof r.showDetails === 'boolean' ? r.showDetails : DEFAULT_PREFS.showDetails,
    hideCompleted: typeof r.hideCompleted === 'boolean' ? r.hideCompleted : DEFAULT_PREFS.hideCompleted,
    showOverdue: typeof r.showOverdue === 'boolean' ? r.showOverdue : DEFAULT_PREFS.showOverdue,
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
