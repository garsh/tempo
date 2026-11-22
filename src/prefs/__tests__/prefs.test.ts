import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  loadPrefs,
  sanitizePrefs,
  savePrefs,
} from '../prefs';

function memoryStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe('prefs persistence', () => {
  let storage: ReturnType<typeof memoryStorage>;
  beforeEach(() => {
    storage = memoryStorage();
  });

  it('returns defaults on a fresh profile', () => {
    const p = loadPrefs(storage);
    expect(p).toEqual(DEFAULT_PREFS);
    expect(p.theme).toBe('system');
    expect(p.newTaskPosition).toBe('bottom');
    expect(p.showOverdue).toBe(true);
    expect(p.hideCompleted).toBe(false);
    expect(p.showDetails).toBe(false);
  });

  it('round-trips through storage', () => {
    const next = {
      ...DEFAULT_PREFS,
      theme: 'dark' as const,
      newTaskPosition: 'top' as const,
      showDetails: true,
      hideCompleted: true,
      showOverdue: false,
      weekStart: 1 as const,
      timeFormat: '24h' as const,
    };
    savePrefs(next, storage);
    expect(storage.map.has(PREFS_STORAGE_KEY)).toBe(true);
    expect(loadPrefs(storage)).toEqual(next);
  });

  it('survives corrupt JSON, drops invalid values, and ignores legacy keys', () => {
    storage.setItem(PREFS_STORAGE_KEY, '{not json');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({
      theme: 'neon',
      weekStart: 3,
      timeFormat: '13h',
      newTaskPosition: 'middle',
      showOverdue: 'yes',
      defaultReminderTime: '08:30',
      defaultListId: 'work',
      groupBy: 'none',
      sortBy: 'title',
      viewMode: 'board',
      smartLists: { tomorrow: true, bogus: true, inbox: 'yes' },
    });
    expect(p).toEqual(DEFAULT_PREFS);
    expect('smartLists' in p).toBe(false);
    expect('groupBy' in p).toBe(false);
    expect('sortBy' in p).toBe(false);
    expect('viewMode' in p).toBe(false);
    expect('defaultReminderTime' in p).toBe(false);
    expect('defaultListId' in p).toBe(false);
  });
});
