import { describe, it, expect } from 'vitest';
import { dueAtMovedToToday, planDaySuggestions } from '../planDay';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

function task(partial: Partial<Task> & Pick<Task, 'id' | 'title'>): Task {
  return {
    listId: INBOX_LIST_ID,
    createdAt: 1,
    updatedAt: 1,
    completionHistory: [],
    recurrence: null,
    ...partial,
  };
}

const NOW = new Date(2026, 9, 6, 9, 0); // Tue Oct 6 2026, 09:00 local

describe('planDaySuggestions', () => {
  it('buckets overdue, upcoming (1–7 days) and undated open tasks; skips today/far/done/deleted', () => {
    const s = planDaySuggestions(
      [
        task({ id: 'old', title: 'Old', dueAt: '2026-10-01' }),
        task({ id: 'today', title: 'Today', dueAt: '2026-10-06' }),
        task({ id: 'tom', title: 'Tomorrow', dueAt: '2026-10-07T10:00' }),
        task({ id: 'wk', title: 'In a week', dueAt: '2026-10-13' }),
        task({ id: 'far', title: 'Far', dueAt: '2026-11-30' }),
        task({ id: 'nd1', title: 'Undated A', createdAt: 10 }),
        task({ id: 'nd2', title: 'Undated B', createdAt: 20 }),
        task({ id: 'done', title: 'Done', dueAt: '2026-10-02', completedAt: 5, completionHistory: [5] }),
        task({ id: 'gone', title: 'Gone', dueAt: '2026-10-02', deletedAt: 5 }),
      ],
      NOW
    );
    expect(s.overdue.map((t) => t.id)).toEqual(['old']);
    expect(s.upcoming.map((t) => t.id).sort()).toEqual(['tom', 'wk']);
    expect(s.noDate.map((t) => t.id)).toEqual(['nd2', 'nd1']);
  });

  it('limits undated suggestions', () => {
    const many = Array.from({ length: 9 }, (_, i) => task({ id: `n${i}`, title: `n${i}`, createdAt: i }));
    expect(planDaySuggestions(many, NOW, { noDateLimit: 3 }).noDate).toHaveLength(3);
  });

  it('returns empty buckets for a fresh install', () => {
    expect(planDaySuggestions([], NOW)).toEqual({ overdue: [], upcoming: [], noDate: [] });
  });
});

describe('dueAtMovedToToday', () => {
  it('keeps the time of day when present', () => {
    expect(dueAtMovedToToday('2026-10-01T17:30', NOW)).toBe('2026-10-06T17:30');
  });
  it('uses a date-only due for date-only or undated tasks', () => {
    expect(dueAtMovedToToday('2026-10-09', NOW)).toBe('2026-10-06');
    expect(dueAtMovedToToday(null, NOW)).toBe('2026-10-06');
  });
});
