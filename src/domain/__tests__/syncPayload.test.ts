import { describe, expect, it, vi } from 'vitest';
import {
  clampTimestamp,
  CLOCK_SKEW_MS,
  compactSyncData,
  MAX_HISTORY,
  MAX_SCHEDULE_HISTORY,
  MAX_SYNC_BYTES,
  MAX_SYNC_RECORDS,
  parseSyncPayload,
  readResponseTextCapped,
  SyncPayloadError,
  utf8ByteLength,
} from '../syncPayload';
import type { SyncData } from '../../types/task';

const now = 1_700_000_000_000;

function task(updatedAt: number, extra: Record<string, unknown> = {}) {
  return {
    id: 'task-1',
    title: 'Water fern',
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
        tasks: [task(10), { title: 'no id', updatedAt: 10 }, { id: 'ok-2', title: 'Second', createdAt: 1, updatedAt: 1 }],
      }),
      { now }
    );
    expect(parsed.tasks.map((t) => t.id)).toEqual(['task-1', 'ok-2']);
  });

  it('caps completion history at MAX_HISTORY entries', () => {
    const count = MAX_HISTORY + 35;
    const history = Array.from({ length: count }, (_, i) => i + 1);
    const parsed = parseSyncPayload(JSON.stringify({ tasks: [task(10, { completionHistory: history })] }), { now });
    expect(parsed.tasks[0]?.completionHistory).toHaveLength(MAX_HISTORY);
    expect(parsed.tasks[0]?.completionHistory[0]).toBe(36);
    expect(parsed.tasks[0]?.completionHistory.at(-1)).toBe(count);
  });

  it('rejects a non-array tasks field, missing tasks property, or invalid JSON', () => {
    expect(() => parseSyncPayload(JSON.stringify({ tasks: 'nope' }), { now })).toThrow(SyncPayloadError);
    for (const bad of [
      JSON.stringify({ tasks: 'nope' }),
      JSON.stringify({}),
      JSON.stringify({ error: 'proxy error' }),
    ]) {
      try {
        parseSyncPayload(bad, { now });
        expect.unreachable('should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(SyncPayloadError);
        expect((err as SyncPayloadError).code).toBe('tasks_not_array');
      }
    }

    try {
      parseSyncPayload('<html>captive portal</html>', { now });
      expect.unreachable('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(SyncPayloadError);
      expect((err as SyncPayloadError).code).toBe('invalid');
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

  it('keeps the newest MAX_SCHEDULE_HISTORY disjoint segments', () => {
    const extra = 5;
    const total = MAX_SCHEDULE_HISTORY + extra;
    const day = (index: number) => new Date(Date.UTC(2020, 0, 1) + index * 86_400_000).toISOString().slice(0, 10);
    const scheduleHistory = Array.from({ length: total }, (_, i) => ({
      startDate: day(i * 2),
      endDate: day(i * 2),
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
    }));
    const parsed = parseSyncPayload(
      JSON.stringify({
        tasks: [
          task(10, {
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
            scheduleHistory,
          }),
        ],
      }),
      { now }
    );
    const kept = parsed.tasks[0]?.scheduleHistory;
    expect(kept).toHaveLength(MAX_SCHEDULE_HISTORY);
    expect(kept?.[0]?.startDate).toBe(day(extra * 2));
    expect(kept?.at(-1)?.startDate).toBe(day((total - 1) * 2));
  });

  it('raises payload limits to 50 MB and 100,000 records', () => {
    expect(MAX_SYNC_BYTES).toBe(50 * 1024 * 1024);
    expect(MAX_SYNC_RECORDS).toBe(100_000);
  });

  it('matches TextEncoder byte length across ASCII, accented, CJK, emoji, and lone surrogates', () => {
    const encoder = new TextEncoder();
    const samples = [
      '',
      'hello world',
      'café résumé naïve',
      '日本語テスト漢字',
      '🌱✅🔥🚀',
      `mix-${'\uD83D'}-lone-high-${'\uDC00'}-lone-low-é-中-🌿`,
    ];
    for (const s of samples) {
      expect(utf8ByteLength(s)).toBe(encoder.encode(s).byteLength);
    }
  });

  it('accepts payloads larger than the old 5 MB limit', () => {
    const bigNote = 'a'.repeat(10_000);
    const tasks = Array.from({ length: 620 }, (_, i) => task(10, { id: `t-${i}`, notes: bigNote }));
    const raw = JSON.stringify({ tasks }, null, 2);
    expect(utf8ByteLength(raw)).toBeGreaterThan(5 * 1024 * 1024);

    const parsed = parseSyncPayload(raw, { now });
    expect(parsed.tasks).toHaveLength(620);
  });

  it('rejects arrays exceeding maxRecords instead of silently truncating', () => {
    const tooManyTasks = JSON.stringify({ tasks: [task(10), task(11, { id: 't2' }), task(12, { id: 't3' })] });
    expect(() => parseSyncPayload(tooManyTasks, { maxRecords: 2, now })).toThrow(SyncPayloadError);
    try {
      parseSyncPayload(tooManyTasks, { maxRecords: 2, now });
    } catch (err) {
      expect(err).toBeInstanceOf(SyncPayloadError);
      expect((err as SyncPayloadError).code).toBe('too_large');
      expect((err as SyncPayloadError).message).toMatch(/too many records/i);
    }

    const legacyListsAndFolders = JSON.stringify({
      tasks: [task(10)],
      lists: [
        { id: 'l1', name: 'A', createdAt: 1, updatedAt: 1 },
        { id: 'l2', name: 'B', createdAt: 1, updatedAt: 1 },
      ],
      folders: [{ id: 'f1', name: 'A', createdAt: 1, updatedAt: 1 }],
    });
    const ignored = parseSyncPayload(legacyListsAndFolders, { maxRecords: 2, now });
    expect(ignored.tasks).toHaveLength(1);
    expect(ignored).not.toHaveProperty('lists');
    expect(ignored).not.toHaveProperty('folders');

    const tooManyBare = JSON.stringify([task(10), task(11, { id: 't2' }), task(12, { id: 't3' })]);
    expect(() => parseSyncPayload(tooManyBare, { maxRecords: 2, now })).toThrow(/too many records/i);
  });

  it('includes formatted byte sizes in too_large error messages', () => {
    const body = JSON.stringify({ tasks: [task(10, { notes: 'x'.repeat(2_048) })] });
    expect(() => parseSyncPayload(body, { maxBytes: 512, now })).toThrow(
      /Backup is too large \(\d+\.\d KB, max 512 B\)\./
    );
  });

  it('compacts deleted tombstones while preserving ids and clamped timestamps', () => {
    const future = now + CLOCK_SKEW_MS + 60_000;
    const parsed = parseSyncPayload(
      JSON.stringify({
        tasks: [
          task(10, {
            id: 'del-task',
            title: 'Long deleted title',
            notes: 'Long deleted notes',
            completionHistory: [1, 2, 3],
            deletedAt: future,
          }),
        ],
        lists: [
          {
            id: 'del-list',
            name: 'Deleted List',
            folderId: 'f1',
            sortOrder: 4,
            createdAt: 5,
            updatedAt: 9,
            deletedAt: 50,
          },
        ],
        folders: [
          {
            id: 'del-folder',
            name: 'Deleted Folder',
            sortOrder: 2,
            createdAt: 5,
            updatedAt: 9,
            deletedAt: 60,
          },
        ],
      }),
      { now }
    );

    expect(parsed.tasks[0]).toEqual({
      id: 'del-task',
      title: '',
      completionHistory: [],
      createdAt: 10,
      updatedAt: 10,
      deletedAt: now,
    });
    expect(parsed).not.toHaveProperty('lists');
    expect(parsed).not.toHaveProperty('folders');
  });

  it('retains the newest MAX_HISTORY unique completions regardless of input order', () => {
    const count = 40_000;
    const oldestKept = count - MAX_HISTORY + 1;
    const ascending = Array.from({ length: count }, (_, i) => i + 1);
    const descending = [...ascending].reverse();
    const withDupes = [...ascending, ...ascending.slice(-100)];

    const parsedAsc = parseSyncPayload(
      JSON.stringify({ tasks: [task(10, { completionHistory: ascending })] }),
      { now }
    );
    expect(parsedAsc.tasks[0]?.completionHistory).toHaveLength(MAX_HISTORY);
    expect(parsedAsc.tasks[0]?.completionHistory[0]).toBe(oldestKept);
    expect(parsedAsc.tasks[0]?.completionHistory.at(-1)).toBe(count);

    const parsedDesc = parseSyncPayload(
      JSON.stringify({ tasks: [task(10, { completionHistory: descending })] }),
      { now }
    );
    expect(parsedDesc.tasks[0]?.completionHistory).toHaveLength(MAX_HISTORY);
    expect(parsedDesc.tasks[0]?.completionHistory[0]).toBe(oldestKept);
    expect(parsedDesc.tasks[0]?.completionHistory.at(-1)).toBe(count);

    const parsedDupes = parseSyncPayload(
      JSON.stringify({ tasks: [task(10, { completionHistory: withDupes })] }),
      { now }
    );
    expect(parsedDupes.tasks[0]?.completionHistory).toHaveLength(MAX_HISTORY);
    expect(parsedDupes.tasks[0]?.completionHistory[0]).toBe(oldestKept);
    expect(parsedDupes.tasks[0]?.completionHistory.at(-1)).toBe(count);
  });

  it('parses and clamps tombstonesPrunedBefore when valid and omits invalid values', () => {
    const future = now + CLOCK_SKEW_MS + 60_000;
    const valid = parseSyncPayload(
      JSON.stringify({ tasks: [], tombstonesPrunedBefore: now - 1000 }),
      { now }
    );
    expect(valid.tombstonesPrunedBefore).toBe(now - 1000);

    const clamped = parseSyncPayload(
      JSON.stringify({ tasks: [], tombstonesPrunedBefore: future }),
      { now }
    );
    expect(clamped.tombstonesPrunedBefore).toBe(now);

    const absent = parseSyncPayload(JSON.stringify({ tasks: [], tombstonesPrunedBefore: 0 }), { now });
    expect(absent.tombstonesPrunedBefore).toBeUndefined();
  });
});

describe('readResponseTextCapped', () => {
  it('rejects declared Content-Length over maxBytes', async () => {
    const res = new Response('{}', { headers: { 'content-length': '2048' } });
    await expect(readResponseTextCapped(res, 1024)).rejects.toThrow(
      'Backup is too large (2.0 KB, max 1.0 KB).'
    );
  });

  it('rejects oversized streaming responses without Content-Length and cancels reader', async () => {
    const cancelSpy = vi.fn(async () => undefined);
    const encoder = new TextEncoder();
    let pulls = 0;
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls += 1;
        controller.enqueue(encoder.encode('x'.repeat(600)));
        if (pulls >= 5) controller.close();
      },
      cancel: cancelSpy,
    });

    const res = new Response(stream);
    await expect(readResponseTextCapped(res, 1024)).rejects.toThrow(
      'Backup is too large (exceeds 1.0 KB limit).'
    );
    expect(cancelSpy).toHaveBeenCalledTimes(1);
  });

  it('correctly decodes multi-chunk UTF-8 streams with split multi-byte characters', async () => {
    const payload = 'Hello 🌍 café 日本語';
    const bytes = new TextEncoder().encode(payload);
    // Split right in the middle of the 4-byte emoji
    const splitAt = bytes.indexOf(0xf0) + 2;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, splitAt));
        controller.enqueue(bytes.slice(splitAt));
        controller.close();
      },
    });

    const res = new Response(stream);
    await expect(readResponseTextCapped(res, 1024)).resolves.toBe(payload);
  });
});

describe('compactSyncData', () => {
  it('compacts tombstones and strips empty/null/default fields from active records', () => {
    const input: SyncData = {
      version: 4,
      exportedAt: 12345,
      tasks: [
        {
          id: 'active-empty',
          title: 'Active minimal',
          notes: '',
          dueAt: null,
          startDate: null,
          priority: 'none',
          pinned: false,
          tags: [],
          subtasks: [],
          recurrence: null,
          completedAt: null,
          completionHistory: [],
          removedCompletions: [],
          skippedDates: [],
          removedSkippedDates: [],
          rescheduledDates: {},
          scheduleHistory: [],
          deletedAt: null,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'active-rich',
          title: 'Active rich',
          notes: 'Keep me',
          dueAt: '2026-11-25',
          startDate: '2026-11-01',
          priority: 'high',
          pinned: true,
          tags: ['errand'],
          subtasks: [{ id: 's1', title: 'Sub', completed: false }],
          recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
          completedAt: 0,
          completionHistory: [100],
          removedCompletions: [50],
          skippedDates: ['2026-11-10'],
          removedSkippedDates: ['2026-11-03'],
          rescheduledDates: { '2026-11-17': '2026-11-18' },
          scheduleHistory: [
            {
              startDate: '2026-10-01',
              endDate: '2026-10-31',
              recurrence: { type: 'fixed_interval', intervalValue: 2, intervalUnit: 'weeks' },
            },
          ],
          sortOrder: 0,
          deletedAt: null,
          createdAt: 1,
          updatedAt: 2,
        },
        {
          id: 'deleted-task',
          title: 'Secret notes and huge history',
          notes: 'x'.repeat(500),
          subtasks: [{ id: 's1', title: 'Sub', completed: true }],
          completionHistory: [1, 2, 3],
          deletedAt: 999,
          createdAt: 1,
          updatedAt: 999,
        },
      ],
    };

    const compacted = compactSyncData(input);
    expect(compacted.tasks[0]).toEqual({
      id: 'active-empty',
      title: 'Active minimal',
      completionHistory: [],
      createdAt: 1,
      updatedAt: 2,
    });
    expect(compacted.tasks[1]).toEqual({
      id: 'active-rich',
      title: 'Active rich',
      notes: 'Keep me',
      dueAt: '2026-11-25',
      startDate: '2026-11-01',
      priority: 'high',
      pinned: true,
      tags: ['errand'],
      subtasks: [{ id: 's1', title: 'Sub', completed: false }],
      recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
      completedAt: 0,
      completionHistory: [100],
      removedCompletions: [50],
      skippedDates: ['2026-11-10'],
      removedSkippedDates: ['2026-11-03'],
      rescheduledDates: { '2026-11-17': '2026-11-18' },
      scheduleHistory: [
        {
          startDate: '2026-10-01',
          endDate: '2026-10-31',
          recurrence: { type: 'fixed_interval', intervalValue: 2, intervalUnit: 'weeks' },
        },
      ],
      sortOrder: 0,
      createdAt: 1,
      updatedAt: 2,
    });
    expect(compacted.tasks[2]).toEqual({
      id: 'deleted-task',
      title: '',
      completionHistory: [],
      createdAt: 1,
      updatedAt: 999,
      deletedAt: 999,
    });
    expect(compacted).not.toHaveProperty('lists');
    expect(compacted).not.toHaveProperty('folders');
    expect(compacted).not.toHaveProperty('tombstonesPrunedBefore');

    const withWatermark = compactSyncData({ ...input, tombstonesPrunedBefore: 987654 });
    expect(withWatermark.tombstonesPrunedBefore).toBe(987654);
  });

  it('sanitizes and compacts skippedDateUpdatedAt on fixed recurring tasks', () => {
    const parsed = parseSyncPayload(
      JSON.stringify({
        tasks: [
          task(10, {
            recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
            skippedDateUpdatedAt: {
              '2026-11-20': 1000,
              'bad-key': 2000,
              '2026-11-21': -5,
              '2026-11-22': now + CLOCK_SKEW_MS + 60_000,
            },
          }),
        ],
      }),
      { now }
    );
    expect(parsed.tasks[0]?.skippedDateUpdatedAt).toEqual({
      '2026-11-20': 1000,
      '2026-11-22': now,
    });
    const compacted = compactSyncData({
      version: 4,
      exportedAt: now,
      tasks: parsed.tasks,
    });
    expect(compacted.tasks[0]?.skippedDateUpdatedAt).toEqual({
      '2026-11-20': 1000,
      '2026-11-22': now,
    });
  });
});
