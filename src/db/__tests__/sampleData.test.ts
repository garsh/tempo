import { describe, it, expect } from 'vitest';
import { buildSampleData, isSampleId, SAMPLE_ID_PREFIX } from '../sampleData';
import { formatDate } from '../../domain/recurrence';

describe('buildSampleData', () => {
  const now = new Date(2026, 9, 6, 9, 0);
  const tasks = buildSampleData(now);

  it('prefixes every sample task id so samples can be cleared', () => {
    const ids = tasks.map((task) => task.id);
    expect(ids.length).toBeGreaterThan(0);
    expect(ids.every((id) => id.startsWith(SAMPLE_ID_PREFIX))).toBe(true);
    expect(ids.every(isSampleId)).toBe(true);
    expect(isSampleId('task-123')).toBe(false);
  });

  it('dates sample tasks relative to the given day', () => {
    const todayStr = formatDate(now);
    const demo3 = tasks.find((t) => t.id === 'demo-3');
    expect(demo3?.dueAt?.startsWith(todayStr)).toBe(true);
    expect(demo3?.dueAt).toBe('2026-10-06');
  });
});
