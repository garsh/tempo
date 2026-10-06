import { describe, it, expect } from 'vitest';
import { buildSampleData, isSampleId, SAMPLE_ID_PREFIX } from '../sampleData';
import { filterToday } from '../../domain/smartLists';

describe('buildSampleData', () => {
  const now = new Date(2026, 9, 6, 9, 0);
  const data = buildSampleData(now);

  it('prefixes every task, list and folder id so samples can be cleared', () => {
    const ids = [...data.tasks, ...data.lists, ...data.folders].map((x) => x.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith(SAMPLE_ID_PREFIX))).toBe(true);
    expect(ids.every(isSampleId)).toBe(true);
    expect(isSampleId('task-123')).toBe(false);
  });

  it('dates sample tasks relative to the given day', () => {
    const today = filterToday(data.tasks, now).map((t) => t.id);
    expect(today).toContain('demo-3');
    expect(data.tasks.find((t) => t.id === 'demo-3')!.dueAt).toBe('2026-10-06T17:30');
  });

  it('references only sample lists or the Inbox', () => {
    const listIds = new Set([...data.lists.map((l) => l.id), 'inbox']);
    expect(data.tasks.every((t) => listIds.has(t.listId))).toBe(true);
  });
});
