import { describe, expect, it, vi } from 'vitest';
import { INBOX_LIST_ID, type Task } from '../../types/task';
import * as recurrence from '../recurrence';
import {
  createNextOccurrenceCache,
  extractNotesSnippet,
  normalizeSearchText,
  searchTasks,
  splitHighlightSegments,
  tokenizeSearchQuery,
} from '../search';

function makeTask(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: 1000,
    updatedAt: 1000,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

describe('domain/search', () => {
  const now = new Date(2026, 10, 19, 10, 0, 0); // 2026-11-19

  it('normalizes case and diacritics and tokenizes whitespace', () => {
    expect(normalizeSearchText('  Café Crème  ')).toBe('  cafe creme  ');
    expect(tokenizeSearchQuery('   ')).toEqual([]);
    expect(tokenizeSearchQuery('  Café   air  ')).toEqual(['cafe', 'air']);
  });

  it('returns empty results for empty or whitespace-only queries', () => {
    const tasks = [makeTask({ id: '1', title: 'Buy milk' })];
    expect(searchTasks(tasks, '', now)).toEqual({
      query: '',
      tokens: [],
      active: [],
      completed: [],
    });
    expect(searchTasks(tasks, '   \t\n ', now)).toEqual({
      query: '   \t\n ',
      tokens: [],
      active: [],
      completed: [],
    });
  });

  it('matches multi-token AND queries out of order across title and notes with diacritic folding', () => {
    const tasks = [
      makeTask({
        id: '1',
        title: 'Replace furnace air filter',
        notes: 'Check basement closet for spare',
      }),
      makeTask({
        id: '2',
        title: 'Café meetup',
        notes: 'Bring notes for Brad',
      }),
      makeTask({
        id: '3',
        title: 'Furnace inspection',
        notes: 'Call HVAC tech',
      }),
    ];

    const res1 = searchTasks(tasks, 'filter furnace', now);
    expect(res1.active.map((r) => r.id)).toEqual(['1']);

    const res2 = searchTasks(tasks, 'basement furnace', now);
    expect(res2.active.map((r) => r.id)).toEqual(['1']);

    const res3 = searchTasks(tasks, 'cafe brad', now);
    expect(res3.active.map((r) => r.id)).toEqual(['2']);
  });

  it('excludes soft-deleted tasks, hidden schema fields, and recurrence labels', () => {
    const tasks = [
      makeTask({
        id: 'deleted',
        title: 'Water plants',
        deletedAt: 2000,
      }),
      makeTask({
        id: 'hidden-fields',
        title: 'Clean garage',
        listId: 'special-work-list',
        priority: 'high',
        pinned: true,
        tags: ['urgent-tag'],
        subtasks: [{ id: 's1', title: 'sweep floor', completed: false }],
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'months',
        },
        dueAt: '2026-11-20',
      }),
    ];

    expect(searchTasks(tasks, 'plants', now).active).toEqual([]);
    expect(searchTasks(tasks, 'special-work-list', now).active).toEqual([]);
    expect(searchTasks(tasks, 'urgent-tag', now).active).toEqual([]);
    expect(searchTasks(tasks, 'sweep', now).active).toEqual([]);
    expect(searchTasks(tasks, 'monthly', now).active).toEqual([]);
    expect(searchTasks(tasks, 'high', now).active).toEqual([]);
  });

  it('branches before getNextUncompletedOccurrenceDate for undated, completed, active recurring, and ended recurring tasks', () => {
    const openUndated = makeTask({
      id: 'undated-open',
      title: 'Budget undated note',
      dueAt: null,
    });
    const completedDated = makeTask({
      id: 'oneoff-done',
      title: 'Budget October',
      dueAt: '2026-10-15',
      completedAt: 5000,
    });
    const completedUndated = makeTask({
      id: 'oneoff-done-undated',
      title: 'Budget old brainstorm',
      dueAt: null,
      completedAt: 4000,
    });
    const activeRecurring = makeTask({
      id: 'rec-active',
      title: 'Budget weekly check',
      startDate: '2026-11-12',
      dueAt: '2026-11-12',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
      },
      completionHistory: [new Date(2026, 10, 12, 9, 0, 0).getTime()],
    });
    const endedRecurringWithHistory = makeTask({
      id: 'rec-ended-hist',
      title: 'Budget seasonal series',
      startDate: '2026-10-01',
      dueAt: '2026-10-01',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        endAfterCount: 1,
      },
      completionHistory: [new Date(2026, 10, 1, 14, 0, 0).getTime()],
      updatedAt: 9000,
    });
    const endedRecurringNoHistory = makeTask({
      id: 'rec-ended-empty',
      title: 'Budget expired before start',
      startDate: '2026-10-01',
      dueAt: '2026-10-01',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'days',
        endOnDate: '2026-09-30',
      },
      completionHistory: [],
      updatedAt: 3000,
    });

    const result = searchTasks(
      [
        openUndated,
        completedDated,
        completedUndated,
        activeRecurring,
        endedRecurringWithHistory,
        endedRecurringNoHistory,
      ],
      'budget',
      now
    );

    expect(result.active.map((r) => ({ id: r.id, dueAt: r.task.dueAt, jump: r.jumpDateStr, completable: r.completable }))).toEqual([
      { id: 'rec-active', dueAt: '2026-11-19', jump: '2026-11-19', completable: true },
      { id: 'undated-open', dueAt: null, jump: null, completable: true },
    ]);

    expect(
      result.completed.map((r) => ({
        id: r.id,
        jump: r.jumpDateStr,
        completable: r.completable,
        completedAt: r.task.completedAt,
      }))
    ).toEqual([
      {
        id: 'rec-ended-hist',
        jump: '2026-11-01',
        completable: false,
        completedAt: new Date(2026, 10, 1, 14, 0, 0).getTime(),
      },
      { id: 'oneoff-done', jump: '2026-10-15', completable: true, completedAt: 5000 },
      { id: 'oneoff-done-undated', jump: null, completable: true, completedAt: 4000 },
      { id: 'rec-ended-empty', jump: null, completable: false, completedAt: 3000 },
    ]);
  });

  it('ranks prefix/exact title matches first, ignores sortOrder, and orders active by due date and completed by completedAt desc', () => {
    const tasks = [
      makeTask({ id: 'later', title: 'Plan tax filing', dueAt: '2026-11-25', sortOrder: 1 }),
      makeTask({ id: 'overdue', title: 'Check tax receipts', dueAt: '2026-11-10', sortOrder: 999 }),
      makeTask({ id: 'today', title: 'Pay tax estimate', dueAt: '2026-11-19', sortOrder: 500 }),
      makeTask({ id: 'undated', title: 'Review tax folder', dueAt: null, sortOrder: 2 }),
      makeTask({ id: 'prefix', title: 'Tax prep', dueAt: '2026-12-01', sortOrder: 300 }),
      makeTask({ id: 'exact', title: 'Tax', dueAt: '2026-12-15', sortOrder: 400 }),
      makeTask({ id: 'done-old', title: 'Old tax', completedAt: 1000 }),
      makeTask({ id: 'done-new', title: 'Recent tax', completedAt: 5000 }),
      makeTask({ id: 'done-prefix', title: 'Tax 2025', completedAt: 500 }),
    ];

    const res = searchTasks(tasks, 'tax', now);
    expect(res.active.map((r) => r.id)).toEqual([
      'prefix',
      'exact',
      'overdue',
      'today',
      'later',
      'undated',
    ]);
    expect(res.completed.map((r) => r.id)).toEqual(['done-prefix', 'done-new', 'done-old']);
  });

  it('splits highlight segments across diacritics and overlapping tokens', () => {
    expect(splitHighlightSegments('Visit Café\u0301 & cafe', ['cafe'])).toEqual([
      { text: 'Visit ', highlighted: false },
      { text: 'Café\u0301', highlighted: true },
      { text: ' & ', highlighted: false },
      { text: 'cafe', highlighted: true },
    ]);

    expect(splitHighlightSegments('Visit Café & cafe', ['cafe'])).toEqual([
      { text: 'Visit ', highlighted: false },
      { text: 'Café', highlighted: true },
      { text: ' & ', highlighted: false },
      { text: 'cafe', highlighted: true },
    ]);

    expect(splitHighlightSegments('Cafe\u0301 latte', ['cafe'])).toEqual([
      { text: 'Cafe\u0301', highlighted: true },
      { text: ' latte', highlighted: false },
    ]);

    expect(splitHighlightSegments('abcdef', ['abc', 'bcd'])).toEqual([
      { text: 'abcd', highlighted: true },
      { text: 'ef', highlighted: false },
    ]);
  });

  it('windows long notes around the matched token so truncate will not hide the match', () => {
    const longLine =
      'Introductory notes with lots of background details before getting to the important part: buy furnace filter model MERV 11 at the hardware store tomorrow afternoon.';
    const snippet = extractNotesSnippet(longLine, ['merv'], 70);
    expect(snippet).toBeDefined();
    expect(snippet!).toContain('MERV');
    expect(snippet!.startsWith('…')).toBe(true);
    expect(snippet!.length).toBeLessThanOrEqual(75);
  });

  it('prefers notes lines containing tokens not present in the task title', () => {
    const task = makeTask({
      id: 'n1',
      title: 'Furnace check',
      notes: 'Furnace model: Goodman GM9S\nAction: replace air filter monthly',
    });
    const res = searchTasks([task], 'furnace filter', now);
    expect(res.active[0]?.notesSnippet).toBe('Action: replace air filter monthly');
  });

  it('caches getNextUncompletedOccurrenceDate across keystrokes and invalidates on mutation or date change', () => {
    const spy = vi.spyOn(recurrence, 'getNextUncompletedOccurrenceDate');
    const cache = createNextOccurrenceCache();
    const recTask = makeTask({
      id: 'rec-cache',
      title: 'Water garden',
      startDate: '2026-11-19',
      dueAt: '2026-11-19',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 2,
        intervalUnit: 'days',
      },
      updatedAt: 1000,
    });

    searchTasks([recTask], 'w', now, cache);
    searchTasks([recTask], 'wa', now, cache);
    searchTasks([recTask], 'wat', now, cache);
    expect(spy).toHaveBeenCalledTimes(1);

    // Mutating updatedAt invalidates the entry
    searchTasks([{ ...recTask, updatedAt: 2000 }], 'wat', now, cache);
    expect(spy).toHaveBeenCalledTimes(2);

    // Day rollover clears the cache
    const nextDay = new Date(2026, 10, 20, 9, 0, 0);
    searchTasks([{ ...recTask, updatedAt: 2000 }], 'wat', nextDay, cache);
    expect(spy).toHaveBeenCalledTimes(3);

    spy.mockRestore();
  });

  it('keeps a 10-year recurring task completed today in active search results (Item I)', () => {
    const passport = makeTask({
      id: 'rec-10y',
      title: 'Renew passport',
      startDate: '2026-11-19',
      dueAt: '2036-11-19',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 10,
        intervalUnit: 'years',
      },
      completionHistory: [new Date(2026, 10, 19, 9, 0, 0).getTime()],
    });

    const result = searchTasks([passport], 'passport', now);
    expect(result.active).toHaveLength(1);
    expect(result.completed).toHaveLength(0);
    expect(result.active[0]?.id).toBe('rec-10y');
    expect(result.active[0]?.jumpDateStr).toBe('2036-11-19');
  });
});
