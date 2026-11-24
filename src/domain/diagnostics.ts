import type { Task, TaskList } from '../types/task';
import { isCompleted, isRecurring, isUndatedOneTime, isWindowPeriodic } from './recurrence';

export const BUILD_ID = typeof __APP_BUILD_ID__ === 'string' ? __APP_BUILD_ID__ : 'dev';
const DIAG_STORAGE_KEY = 'tempo_diag_log_v1';
const MAX_DIAG_EVENTS = 60;

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
    approximateTasks: number;
    undatedOneTimeTasks: number;
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
let memoryInitialized = false;
let diagnosticsInitialized = false;
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function parseEventsJson(raw: string | null): DiagEvent[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as DiagEvent[]) : [];
  } catch {
    return [];
  }
}

function ensureEventsLoaded(): void {
  if (memoryInitialized) return;
  memoryInitialized = true;
  try {
    if (typeof localStorage === 'undefined') return;
    const localRaw = localStorage.getItem(DIAG_STORAGE_KEY);
    let events = parseEventsJson(localRaw);
    if (!localRaw && inMemoryEvents.length > 0) {
      events = inMemoryEvents;
    }

    if (typeof sessionStorage !== 'undefined') {
      try {
        const sessionRaw = sessionStorage.getItem(DIAG_STORAGE_KEY);
        if (sessionRaw) {
          const sessionEvents = parseEventsJson(sessionRaw);
          if (sessionEvents.length > 0) {
            const seen = new Set(events.map((e) => `${e.at}|${e.type}|${e.detail}`));
            const merged = [...events];
            for (const e of sessionEvents) {
              const key = `${e.at}|${e.type}|${e.detail}`;
              if (!seen.has(key)) {
                seen.add(key);
                merged.push(e);
              }
            }
            merged.sort((a, b) => a.at.localeCompare(b.at));
            events = merged.slice(-MAX_DIAG_EVENTS);
            localStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(events));
          }
          sessionStorage.removeItem(DIAG_STORAGE_KEY);
        }
      } catch {
        /* ignore sessionStorage access errors */
      }
    }

    inMemoryEvents = events;
  } catch {
    /* ignore storage access errors */
  }
}

function flushStorageEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(DIAG_STORAGE_KEY, JSON.stringify(inMemoryEvents));
    }
  } catch {
    /* ignore storage quota / private mode */
  }
}

function scheduleStorageFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    flushStorageEvents();
  }, 1000);
}

export function recordDiagEvent(type: string, detail: string): void {
  ensureEventsLoaded();
  inMemoryEvents.push({
    at: new Date().toISOString(),
    type,
    detail: detail.slice(0, 400),
  });
  if (inMemoryEvents.length > MAX_DIAG_EVENTS) {
    inMemoryEvents.shift();
  }
  scheduleStorageFlush();
}

export function getDiagEvents(): DiagEvent[] {
  ensureEventsLoaded();
  return [...inMemoryEvents];
}

export function flushDiagnostics(): void {
  flushStorageEvents();
}

export function clearDiagEvents(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  inMemoryEvents = [];
  memoryInitialized = true;
  flushStorageEvents();
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(DIAG_STORAGE_KEY);
    }
  } catch {
    /* ignore storage access errors */
  }
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

  window.addEventListener('pagehide', flushStorageEvents);
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flushStorageEvents();
      }
    });
  }
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
  lists: TaskList[] = [],
  extra?: Record<string, unknown>
): DiagnosticsSummary {
  let activeTasks = 0;
  let openTasksCount = 0;
  let recurringTasks = 0;
  let approximateTasks = 0;
  let undatedOneTimeTasks = 0;
  let completedTasks = 0;
  let tombstonedTasks = 0;

  for (const t of tasks) {
    if (t.deletedAt) {
      tombstonedTasks += 1;
      continue;
    }
    activeTasks += 1;
    if (isRecurring(t)) recurringTasks += 1;
    if (isWindowPeriodic(t)) approximateTasks += 1;
    if (isUndatedOneTime(t) && !isCompleted(t)) undatedOneTimeTasks += 1;
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
      approximateTasks,
      undatedOneTimeTasks,
      completedTasks,
      tombstonedTasks,
      activeLists: lists.filter((l) => !l.deletedAt).length,
      duplicateOpenGroups: dup.groups,
      duplicateOpenExtraCount: dup.extraCount,
    },
    ...(extra ? { extra } : {}),
    recentEvents: getDiagEvents(),
  };
}
