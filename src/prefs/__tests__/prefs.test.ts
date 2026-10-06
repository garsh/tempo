import { describe, it, expect, beforeEach } from 'vitest';
import {
  DEFAULT_PREFS,
  PREFS_STORAGE_KEY,
  loadPrefs,
  moveTab,
  normalizeTabs,
  sanitizePrefs,
  savePrefs,
  toggleTab,
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
    expect(p.tabs).toEqual(['tasks', 'calendar', 'settings']);
    expect(p.smartLists.today && p.smartLists.inbox).toBe(true);
    expect(p.smartLists.tomorrow || p.smartLists.next7 || p.smartLists.all || p.smartLists.completed).toBe(false);
  });

  it('round-trips through storage', () => {
    const next = {
      ...DEFAULT_PREFS,
      theme: 'dark' as const,
      showDetails: true,
      hideCompleted: true,
      groupBy: 'priority' as const,
      sortBy: 'title' as const,
      weekStart: 1 as const,
      timeFormat: '24h' as const,
      defaultReminderTime: '08:30',
      defaultListId: 'work',
      tabs: ['tasks', 'board', 'search'] as const,
      smartLists: { ...DEFAULT_PREFS.smartLists, next7: true },
    };
    savePrefs({ ...next, tabs: [...next.tabs] }, storage);
    expect(storage.map.has(PREFS_STORAGE_KEY)).toBe(true);
    expect(loadPrefs(storage)).toEqual({ ...next, tabs: [...next.tabs] });
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

describe('tab bar config', () => {
  it('normalizes: unique, valid, Tasks required, 2..5 tabs', () => {
    expect(normalizeTabs(['calendar', 'calendar', 'nope', 'settings'])).toEqual(['tasks', 'calendar', 'settings']);
    expect(normalizeTabs([])).toEqual(['tasks', 'calendar']);
    expect(normalizeTabs('x')).toEqual(DEFAULT_PREFS.tabs);
    expect(normalizeTabs(['tasks', 'calendar', 'board', 'search', 'settings', 'tasks'])).toHaveLength(5);
  });

  it('toggles within limits and never removes Tasks', () => {
    expect(toggleTab(['tasks', 'calendar', 'settings'], 'board')).toEqual(['tasks', 'calendar', 'settings', 'board']);
    expect(toggleTab(['tasks', 'calendar', 'settings'], 'calendar')).toEqual(['tasks', 'settings']);
    expect(toggleTab(['tasks', 'settings'], 'settings')).toEqual(['tasks', 'settings']);
    expect(toggleTab(['tasks', 'calendar', 'settings'], 'tasks')).toEqual(['tasks', 'calendar', 'settings']);
    const full = ['tasks', 'calendar', 'board', 'search', 'settings'] as const;
    expect(toggleTab([...full], 'board')).toHaveLength(4);
  });

  it('reorders tabs', () => {
    expect(moveTab(['tasks', 'calendar', 'settings'], 'settings', -1)).toEqual(['tasks', 'settings', 'calendar']);
    expect(moveTab(['tasks', 'calendar'], 'tasks', -1)).toEqual(['tasks', 'calendar']);
  });
});
