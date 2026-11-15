import type { Task, TaskList } from '../types/task';
import { isCompleted, isRecurring } from './recurrence';

export const BUILD_ID = '2026-11-15-fix2';
const DIAG_STORAGE_KEY = 'tempo_diag_log_v1';
const MAX_DIAG_EVENTS = 40;

export interface DiagEvent {
  at: string;
  type: string;
  detail: string;
}

export interface DiagnosticsSummary {
  buildId: string;
  generatedAt: string;
  counts: {
    totalDbTasks: number;
    activeTasks: number;
    openTasks: number;
    recurringTasks: number;
    completedTasks: number;
    tombstonedTasks: number;
    activeLists: number;
    duplicateOpenGroups: number;
    duplicateOpenExtraCount: number;
  };
  extra?: Record<string, unknown>;
  recentEvents: DiagEvent[];
}

let inMemoryEvents: DiagEvent[] = [];
let diagnosticsInitialized = false;

function readStorageEvents(): DiagEvent[] {
  try {
    if (typeof sessionStorage === 'undefined') return inMemoryEvents;
    const raw = sessionStorage.getItem(DIAG_STORAGE_KEY);
    if (!raw) return inMemoryEvents;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagEvent[]) : inMemoryEvents;
  } catch {
    return inMemoryEvents;
  }
}

function writeStorageEvents(events: DiagEvent[]): void {
  inMemoryEvents = events;
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(events));
    }
  } catch {
    /* ignore storage quota / private mode */
  }
}

export function recordDiagEvent(type: string, detail: string): void {
  const prev = readStorageEvents();
  const next: DiagEvent[] = [
    ...prev,
    {
      at: new Date().toISOString(),
      type,
      detail: detail.slice(0, 400),
    },
  ].slice(-MAX_DIAG_EVENTS);
  writeStorageEvents(next);
}

export function getDiagEvents(): DiagEvent[] {
  return readStorageEvents();
}

export function clearDiagEvents(): void {
  writeStorageEvents([]);
}

export function initDiagnostics(): void {
  if (diagnosticsInitialized) return;
  diagnosticsInitialized = true;
  recordDiagEvent('app_init', `build=${BUILD_ID}`);
  if (typeof window === 'undefined') return;

  window.addEventListener('error', (event) => {
    const msg = event.message || String(event.error ?? 'Unknown error');
    recordDiagEvent('window_error', msg);
  });

  window.addEventListener('unhandledrejection', (event) => {
    const reason = event.reason;
    const msg = reason instanceof Error ? reason.message : String(reason ?? 'Unhandled rejection');
    recordDiagEvent('unhandled_rejection', msg);
  });
}

export function countDuplicateOpenTasks(tasks: Task[]): {
  groups: number;
  extraCount: number;
} {
  const counts = new Map<string, number>();
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t)) continue;
    const key = `${t.listId}::${t.title.trim().toLowerCase()}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let groups = 0;
  let extraCount = 0;
  for (const count of counts.values()) {
    if (count > 1) {
      groups += 1;
      extraCount += count - 1;
    }
  }
  return { groups, extraCount };
}

export function buildDiagnosticsSummary(
  tasks: Task[],
  lists: TaskList[],
  extra?: Record<string, unknown>
): DiagnosticsSummary {
  let activeTasks = 0;
  let openTasksCount = 0;
  let recurringTasks = 0;
  let completedTasks = 0;
  let tombstonedTasks = 0;

  for (const t of tasks) {
    if (t.deletedAt) {
      tombstonedTasks += 1;
      continue;
    }
    activeTasks += 1;
    if (isRecurring(t)) recurringTasks += 1;
    if (isCompleted(t)) completedTasks += 1;
    else openTasksCount += 1;
  }

  const dup = countDuplicateOpenTasks(tasks);

  return {
    buildId: BUILD_ID,
    generatedAt: new Date().toISOString(),
    counts: {
      totalDbTasks: tasks.length,
      activeTasks,
      openTasks: openTasksCount,
      recurringTasks,
      completedTasks,
      tombstonedTasks,
      activeLists: lists.filter((l) => !l.deletedAt).length,
      duplicateOpenGroups: dup.groups,
      duplicateOpenExtraCount: dup.extraCount,
    },
    ...(extra ? { extra } : {}),
    recentEvents: readStorageEvents(),
  };
}
