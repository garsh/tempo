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
    expect(p.showOverdue).toBe(true);
    expect(p.smartLists.today && p.smartLists.inbox).toBe(true);
    expect(p.smartLists.tomorrow || p.smartLists.next7 || p.smartLists.all || p.smartLists.completed).toBe(false);
  });

  it('round-trips through storage', () => {
    const next = {
      ...DEFAULT_PREFS,
      theme: 'dark' as const,
      showDetails: true,
      hideCompleted: true,
      groupBy: 'none' as const,
      sortBy: 'title' as const,
      weekStart: 1 as const,
      timeFormat: '24h' as const,
      defaultReminderTime: '08:30',
      defaultListId: 'work',
      smartLists: { ...DEFAULT_PREFS.smartLists, next7: true },
    };
    savePrefs(next, storage);
    expect(storage.map.has(PREFS_STORAGE_KEY)).toBe(true);
    expect(loadPrefs(storage)).toEqual(next);
  });

  it('survives corrupt JSON and drops invalid values', () => {
    storage.setItem(PREFS_STORAGE_KEY, '{not json');
    expect(loadPrefs(storage)).toEqual(DEFAULT_PREFS);
    const p = sanitizePrefs({
      theme: 'neon',
      weekStart: 3,
      timeFormat: '13h',
      defaultReminderTime: '9am',
      groupBy: 'color',
      sortBy: 'random',
      smartLists: { tomorrow: true, bogus: true, inbox: 'yes' },
    });
    expect(p.theme).toBe('system');
    expect(p.weekStart).toBe(0);
    expect(p.timeFormat).toBe('12h');
    expect(p.defaultReminderTime).toBe('09:00');
    expect(p.groupBy).toBe('date');
    expect(p.sortBy).toBe('due');
    expect(p.smartLists.tomorrow).toBe(true);
    expect(p.smartLists.inbox).toBe(true);
    expect('bogus' in p.smartLists).toBe(false);
  });
});
