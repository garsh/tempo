import { describe, it, expect } from 'vitest';
import { parseQuickCapture } from '../quickCapture';

describe('Quick capture NLP', () => {
  const now = new Date(2026, 9, 5, 10, 0, 0); // Mon Oct 5 2026

  it('parses tomorrow and tags', () => {
    const r = parseQuickCapture('Buy milk tomorrow #Errands', now);
    expect(r.title).toBe('Buy milk');
    expect(r.dueAt).toBe('2026-10-06');
    expect(r.tags).toEqual(['Errands']);
  });

  it('parses in N days and priority', () => {
    const r = parseQuickCapture('Pay rent in 3 days !high', now);
    expect(r.title).toBe('Pay rent');
    expect(r.dueAt).toBe('2026-10-08');
    expect(r.priority).toBe('high');
  });

  it('parses next friday and time', () => {
    const r = parseQuickCapture('Team sync next friday 3pm', now);
    expect(r.title).toBe('Team sync');
    expect(r.dueAt).toBe('2026-10-09T15:00');
  });

  it('parses bare weekday as this week', () => {
    const r = parseQuickCapture('Dentist wednesday', now);
    expect(r.dueAt).toBe('2026-10-07');
    expect(r.title).toBe('Dentist');
  });

  it('parses p1 priority', () => {
    const r = parseQuickCapture('Ship release p1 today', now);
    expect(r.priority).toBe('high');
    expect(r.dueAt).toBe('2026-10-05');
  });
});
