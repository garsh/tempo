import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  recordDiagEvent,
  getDiagEvents,
  clearDiagEvents,
  buildDiagnosticsSummary,
  type DiagEvent,
} from '../diagnostics';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

/**
 * DiagnosticsBufferManager simulates the Phase 3 asynchronous batching architecture
 * for diagnostic events.
 */
export class DiagnosticsBufferManager {
  private inMemoryBuffer: DiagEvent[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly maxEvents: number;
  private readonly debounceMs: number;
  private readonly storageTarget?: { setItem: (k: string, v: string) => void };

  constructor(
    options: { maxEvents?: number; debounceMs?: number } = {},
    storageTarget?: { setItem: (k: string, v: string) => void }
  ) {
    this.maxEvents = options.maxEvents ?? 60;
    this.debounceMs = options.debounceMs ?? 300;
    this.storageTarget = storageTarget;
  }

  public record(type: string, detail: string, timestamp: string = new Date().toISOString()): void {
    const entry: DiagEvent = {
      at: timestamp,
      type,
      detail: detail.slice(0, 400),
    };

    this.inMemoryBuffer.push(entry);
    if (this.inMemoryBuffer.length > this.maxEvents) {
      this.inMemoryBuffer.shift();
    }

    this.scheduleFlush();
  }

  public getEvents(): DiagEvent[] {
    return [...this.inMemoryBuffer];
  }

  public clear(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    this.inMemoryBuffer = [];
    this.flushSync();
  }

  public flushSync(): void {
    if (this.flushTimer) {
      clearTimeout(this.flushTimer);
      this.flushTimer = null;
    }
    try {
      this.storageTarget?.setItem('tempo_diag_log_v1', JSON.stringify(this.inMemoryBuffer));
    } catch {
      // Storage errors (e.g. quota exceeded) are silently swallowed
    }
  }

  private scheduleFlush(): void {
    if (this.flushTimer) return; // Debounce: allow batching
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flushSync();
    }, this.debounceMs);
  }
}

describe('Diagnostics Logging & Event Buffering Architecture', () => {
  beforeEach(() => {
    clearDiagEvents();
  });

  describe('Existing Diagnostics System Contracts', () => {
    it('records events and retrieves them via getDiagEvents()', () => {
      recordDiagEvent('test_event', 'detail A');
      recordDiagEvent('test_event', 'detail B');

      const events = getDiagEvents();
      expect(events.length).toBeGreaterThanOrEqual(2);
      const lastTwo = events.slice(-2);
      expect(lastTwo[0].type).toBe('test_event');
      expect(lastTwo[0].detail).toBe('detail A');
      expect(lastTwo[1].detail).toBe('detail B');
    });

    it('truncates details longer than 400 characters', () => {
      const longDetail = 'X'.repeat(500);
      recordDiagEvent('long_event', longDetail);

      const events = getDiagEvents();
      const last = events[events.length - 1];
      expect(last.detail.length).toBe(400);
    });

    it('clears all diagnostic events cleanly', () => {
      recordDiagEvent('temp', 'to be cleared');
      expect(getDiagEvents().length).toBeGreaterThan(0);

      clearDiagEvents();
      expect(getDiagEvents()).toEqual([]);
    });

    it('buildDiagnosticsSummary includes recent events and task metrics', () => {
      recordDiagEvent('summary_check', 'event in summary');
      const sampleTasks: Task[] = [
        {
          id: '1',
          title: 'Active task',
          listId: INBOX_LIST_ID,
          createdAt: 1000,
          updatedAt: 1000,
          dueAt: '2026-11-17',
          subtasks: [],
          completionHistory: [],
          recurrence: null,
        },
        {
          id: '2',
          title: 'Completed task',
          listId: INBOX_LIST_ID,
          createdAt: 1000,
          updatedAt: 1000,
          dueAt: '2026-11-17',
          completedAt: 2000,
          subtasks: [],
          completionHistory: [],
          recurrence: null,
        },
      ];

      const summary = buildDiagnosticsSummary(sampleTasks);
      expect(summary.counts.totalDbTasks).toBe(2);
      expect(summary.counts.activeTasks).toBe(2);
      expect(summary.counts.openTasks).toBe(1);
      expect(summary.counts.completedTasks).toBe(1);
      expect(summary.recentEvents.some((e) => e.detail === 'event in summary')).toBe(true);
    });
  });

  describe('Asynchronous Diagnostics Buffer Manager (Phase 3 Specification)', () => {
    it('appends events in memory immediately without synchronous blocking', () => {
      const setItem = vi.fn();
      const manager = new DiagnosticsBufferManager({ debounceMs: 50 }, { setItem });

      manager.record('action_1', 'detail 1');
      manager.record('action_2', 'detail 2');

      const events = manager.getEvents();
      expect(events).toHaveLength(2);
      expect(events[0].type).toBe('action_1');
      expect(events[1].type).toBe('action_2');

      // Storage write has NOT happened synchronously (debounced)
      expect(setItem).not.toHaveBeenCalled();
    });

    it('maintains maximum bound of 60 events in FIFO order under high-volume burst', () => {
      const manager = new DiagnosticsBufferManager({ maxEvents: 60 });

      for (let i = 0; i < 100; i++) {
        manager.record('burst', `event #${i}`);
      }

      const events = manager.getEvents();
      expect(events).toHaveLength(60);
      expect(events[0].detail).toBe('event #40');
      expect(events[59].detail).toBe('event #99');
    });

    it('debounces multiple rapid recordings into a single batch write', async () => {
      const setItem = vi.fn();
      const manager = new DiagnosticsBufferManager({ debounceMs: 25 }, { setItem });

      manager.record('toggle', 'task 1');
      manager.record('toggle', 'task 2');
      manager.record('toggle', 'task 3');

      expect(setItem).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 35));

      expect(setItem).toHaveBeenCalledTimes(1);
      const writtenPayload = JSON.parse(setItem.mock.calls[0][1]);
      expect(writtenPayload).toHaveLength(3);
    });

    it('gracefully handles storage quota exceptions without throwing or dropping memory buffer', () => {
      const faultyStorage = {
        setItem: () => {
          throw new Error('QuotaExceededError: DOM Exception 22');
        },
      };

      const manager = new DiagnosticsBufferManager({ debounceMs: 10 }, faultyStorage);

      expect(() => {
        manager.record('toggle', 'task under quota');
        manager.flushSync();
      }).not.toThrow();

      // Buffer in memory remains intact
      expect(manager.getEvents()).toHaveLength(1);
      expect(manager.getEvents()[0].detail).toBe('task under quota');
    });
  });
});
