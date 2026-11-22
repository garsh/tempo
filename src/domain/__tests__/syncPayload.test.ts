import { describe, expect, it } from 'vitest';
import { clampTimestamp, CLOCK_SKEW_MS, parseSyncPayload, SyncPayloadError } from '../syncPayload';

const now = 1_700_000_000_000;

function task(updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Water fern',
    listId: 'inbox',
    createdAt: 10,
    updatedAt,
    completionHistory: [],
    ...extra,
  };
}

describe('parseSyncPayload', () => {
  it('leaves an in-range updatedAt unchanged', () => {
    const parsed = parseSyncPayload(JSON.stringify({ tasks: [task(10)] }), { now });
    expect(parsed.tasks[0]?.updatedAt).toBe(10);
    expect(parsed.tasks[0]?.title).toBe('Water fern');
  });

  it('rewrites a far-future updatedAt to now', () => {
    const future = now + CLOCK_SKEW_MS + 60_000;
    const parsed = parseSyncPayload(JSON.stringify({ tasks: [task(future)] }), { now });
    expect(parsed.tasks[0]?.updatedAt).toBe(now);
    expect(clampTimestamp(future, now)).toBe(now);
  });

  it('keeps a good row and drops a row with no id', () => {
    const parsed = parseSyncPayload(
      JSON.stringify({
        tasks: [task(10), { title: 'no id', updatedAt: 10 }, { id: 'ok-2', title: 'Second', listId: 'inbox', createdAt: 1, updatedAt: 1 }],
      }),
      { now }
    );
    expect(parsed.tasks.map((t) => t.id)).toEqual(['task-1', 'ok-2']);
  });

  it('caps completion history at 365 entries', () => {
    const history = Array.from({ length: 400 }, (_, i) => i + 1);
    const parsed = parseSyncPayload(JSON.stringify({ tasks: [task(10, { completionHistory: history })] }), { now });
    expect(parsed.tasks[0]?.completionHistory).toHaveLength(365);
    expect(parsed.tasks[0]?.completionHistory[0]).toBe(36);
    expect(parsed.tasks[0]?.completionHistory.at(-1)).toBe(400);
  });

  it('rejects a non-array tasks field', () => {
    expect(() => parseSyncPayload(JSON.stringify({ tasks: 'nope' }), { now })).toThrow(SyncPayloadError);
    try {
      parseSyncPayload(JSON.stringify({ tasks: 'nope' }), { now });
    } catch (err) {
      expect(err).toBeInstanceOf(SyncPayloadError);
      expect((err as SyncPayloadError).code).toBe('tasks_not_array');
    }
  });

  it('rejects a body over the byte cap before trusting it', () => {
    expect(() => parseSyncPayload('{"tasks":[]}', { maxBytes: 4, now })).toThrow(/too large/);
  });

  it('caps notes and does not copy a __proto__ key onto the task', () => {
    const body = JSON.stringify({ tasks: [task(10, { notes: 'x'.repeat(20_000) })] }).replace(
      '"notes":',
      '"__proto__":{"admin":true},"notes":'
    );
    const parsed = parseSyncPayload(body, { now });
    expect(parsed.tasks[0]?.notes).toHaveLength(10_000);
    expect(parsed.tasks[0]).not.toHaveProperty('admin');
  });

  it('sanitizes rescheduledDates, scheduleHistory, and removedSkippedDates on fixed recurring tasks', () => {
    const valid = task(10, {
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [0] },
      removedSkippedDates: ['2026-11-28', 'bad-date', '2026-11-28'],
      rescheduledDates: {
        '2026-11-21': '2026-11-22',
        '2026-11-14': '2026-11-14', // self-map dropped
        '2026-11-28': '2026-11-22', // duplicate target dropped
        bad: '2026-11-25',
      },
      scheduleHistory: [
        {
          startDate: '2026-11-01',
          endDate: '2026-11-20',
          recurrence: {
            type: 'fixed_interval',
            intervalValue: 1,
            intervalUnit: 'weeks',
            weekdays: [6],
            endOnDate: '2026-12-31',
          },
        },
        // Overlapping segment dropped
        {
          startDate: '2026-11-15',
          endDate: '2026-11-25',
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
        },
        // Invalid range dropped
        {
          startDate: '2026-11-10',
          endDate: '2026-11-01',
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
        },
      ],
    });
    const parsed = parseSyncPayload(JSON.stringify({ tasks: [valid] }), { now });
    const t = parsed.tasks[0]!;
    expect(t.removedSkippedDates).toEqual(['2026-11-28']);
    expect(t.rescheduledDates).toEqual({ '2026-11-21': '2026-11-22' });
    expect(t.scheduleHistory).toEqual([
      {
        startDate: '2026-11-01',
        endDate: '2026-11-20',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks', weekdays: [6] },
      },
    ]);
  });
});
