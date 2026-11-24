import Dexie, { type Table } from 'dexie';
import type {
  RecurrenceRule,
  Task,
  TaskInput,
} from '../types/task';
import {
  addDays,
  combineDueAt,
  completionTimestampForDate,
  findRescheduledOrigin,
  formatDate,
  getDayBoundsMs,
  getDueDatePart,
  getLatestCompletionMs,
  getRecurrenceAnchor,
  getRuleActiveOnDate,
  getSkipOccurrenceDate,
  getWindowBounds,
  hasDueTime,
  isCompleted,
  isCompletedOnDate,
  isFixedRecurring,
  isSkippedOnDate,
  isWindowPeriodic,
  parseDate,
  sanitizeAnnualWindow,
  splitDueAt,
  taskOccursOnDate,
} from '../domain/recurrence';
import {
  buildSeriesMoveRule,
  buildUpdatedScheduleHistory,
} from '../domain/moveRecurring';
import { newId } from '../domain/id';
import { computeTopSortOrder } from '../domain/sorting';
import { recordDiagEvent } from '../domain/diagnostics';
import { TOMBSTONE_TTL_MS } from '../domain/merge';
import { MAX_HISTORY } from '../domain/syncPayload';
import type { NewTaskPosition } from '../prefs/prefs';
import { getGoogleAccount } from '../sync/googleAccount';
import { setTombstonesPrunedBefore } from '../sync/syncWatermark';
import { buildSampleData, isSampleId } from './sampleData';

export { buildSampleData, isSampleId, SAMPLE_ID_PREFIX } from './sampleData';

export class TempoDatabase extends Dexie {
  tasks!: Table<Task, string>;

  constructor() {
    super('TempoDatabase');

    this.version(1).stores({
      tasks: 'id, dueDate, updatedAt, deletedAt',
    });

    this.version(2)
      .stores({
        tasks: 'id, listId, dueAt, updatedAt, deletedAt, completedAt',
        lists: 'id, sortOrder, updatedAt, deletedAt',
      })
      .upgrade(async (tx) => {
        await tx.table('tasks').clear();
      });

    // v3: Folders (Phase 2)
    this.version(3).stores({
      tasks: 'id, listId, dueAt, updatedAt, deletedAt, completedAt',
      lists: 'id, folderId, sortOrder, updatedAt, deletedAt',
      folders: 'id, sortOrder, updatedAt, deletedAt',
    });

    // v4: Saved filters (Phase 4)
    this.version(4).stores({
      tasks: 'id, listId, dueAt, updatedAt, deletedAt, completedAt',
      lists: 'id, folderId, sortOrder, updatedAt, deletedAt',
      folders: 'id, sortOrder, updatedAt, deletedAt',
      savedFilters: 'id, updatedAt, deletedAt',
    });

    // v5: Drop savedFilters (Item 7)
    this.version(5).stores({
      savedFilters: null,
    });

    // v6: One-time soft-delete cleanup of legacy undated non-recurring tasks
    this.version(6)
      .stores({
        tasks: 'id, listId, dueAt, updatedAt, deletedAt, completedAt',
        lists: 'id, folderId, sortOrder, updatedAt, deletedAt',
        folders: 'id, sortOrder, updatedAt, deletedAt',
      })
      .upgrade(async (tx) => {
        const now = Date.now();
        await tx
          .table('tasks')
          .toCollection()
          .modify((t: Task) => {
            if (!t.dueAt && !t.recurrence && !t.deletedAt) {
              t.deletedAt = now;
              t.updatedAt = now;
            }
          });
      });

    // v7: Drop unused lists/folders and the legacy task listId field.
    this.version(7)
      .stores({
        tasks: 'id, dueAt, updatedAt, deletedAt, completedAt',
        lists: null,
        folders: null,
      })
      .upgrade(async (tx) => {
        await tx.table('tasks').toCollection().modify((task: Record<string, unknown>) => {
          delete task.listId;
        });
      });
  }
}

export const db = new TempoDatabase();

/** Open the local database. Never seeds tasks. */
export async function initDatabase(): Promise<void> {
  await db.open();
}

/** Settings → "Load sample tasks": (re)insert the demo data with fresh dates. */
export async function loadSampleTasks(nowDate: Date = new Date()): Promise<number> {
  const tasks = buildSampleData(nowDate);
  await db.tasks.bulkPut(tasks.map((t) => ({ ...t, deletedAt: null })));
  recordDiagEvent('load_sample', `tasks=${tasks.length}`);
  return tasks.length;
}

/**
 * Settings → "Clear sample tasks": soft-delete (tombstone) every demo task so the
 * removal also propagates through Drive sync.
 */
export async function clearSampleTasks(): Promise<number> {
  const now = Date.now();
  let removed = 0;
  await db.transaction('rw', db.tasks, async () => {
    const tasks = (await db.tasks.toArray()).filter((t) => isSampleId(t.id) && !t.deletedAt);
    removed = tasks.length;
    await db.tasks.bulkPut(tasks.map((t) => ({ ...t, deletedAt: now, updatedAt: now })));
  });
  recordDiagEvent('clear_sample', `removed=${removed}`);
  return removed;
}

export interface ClearAllDataPreview {
  openTasks: number;
  completedTasks: number;
  activeTasks: number;
}

export async function getClearAllDataPreview(): Promise<ClearAllDataPreview> {
  const allTasks = await db.tasks.toArray();
  let openTasks = 0;
  let completedTasks = 0;
  for (const t of allTasks) {
    if (t.deletedAt) continue;
    if (isCompleted(t)) completedTasks += 1;
    else openTasks += 1;
  }
  return {
    openTasks,
    completedTasks,
    activeTasks: openTasks + completedTasks,
  };
}

/**
 * Settings › Integrations & Import › Diagnostics & Repair → "Clear all current data":
 * soft-delete (tombstone) all tasks so the removal also propagates through Drive sync.
 */
export async function clearAllData(): Promise<number> {
  const now = Date.now();
  const markDeleted = <T extends { deletedAt?: number | null; updatedAt: number }>(items: T[]): T[] =>
    items.filter((x) => !x.deletedAt).map((x) => ({ ...x, deletedAt: now, updatedAt: now }));

  let removedTasks = 0;
  await db.transaction('rw', db.tasks, async () => {
    const tasks = markDeleted(await db.tasks.toArray());
    removedTasks = tasks.length;
    if (tasks.length) await db.tasks.bulkPut(tasks);
  });
  recordDiagEvent('clear_all_data', `removedTasks=${removedTasks}`);
  return removedTasks;
}

function normalizeRecurrenceForSave(
  rule: Task['recurrence'] | undefined
): Task['recurrence'] {
  if (!rule) return null;
  if (rule.type === 'annual_window') {
    if (!Array.isArray(rule.annualWindows) || rule.annualWindows.length === 0) return null;
    const years = Math.min(99, Math.max(1, Math.floor(rule.intervalValue || 1)));
    return {
      type: 'annual_window',
      intervalValue: years,
      intervalUnit: 'years',
      annualWindows: rule.annualWindows.slice(0, 12).map(sanitizeAnnualWindow),
      ...(rule.endOnDate !== undefined ? { endOnDate: rule.endOnDate } : {}),
    };
  }
  if (isWindowPeriodic({ recurrence: rule })) {
    const { min, max, unit } = getWindowBounds(rule);
    return {
      type: 'after_completion',
      intervalValue: min,
      maxIntervalValue: max,
      intervalUnit: unit,
      ...(rule.endOnDate !== undefined ? { endOnDate: rule.endOnDate } : {}),
    };
  }
  const fixed = { ...rule, type: 'fixed_interval' as const };
  delete fixed.maxIntervalValue;
  return fixed;
}

export interface SaveTaskOptions {
  /** Where to place a newly created task when `task.sortOrder` is not explicitly provided. Defaults to `'bottom'`. */
  newTaskPosition?: NewTaskPosition;
}

export async function saveTask(task: TaskInput, options?: SaveTaskOptions): Promise<Task> {
  const now = Date.now();

  if (task.id) {
    const taskId = task.id;
    return db.transaction('rw', db.tasks, async () => {
      const existing = await db.tasks.get(taskId);
      const prevDate = existing?.dueAt ? getDueDatePart(existing.dueAt) : null;
      const rawRecurrence =
        task.recurrence === undefined ? existing?.recurrence ?? null : task.recurrence;
      const recurrenceRule = normalizeRecurrenceForSave(rawRecurrence);
      const isWindow = isWindowPeriodic({ recurrence: recurrenceRule });

      const nextDue = isWindow
        ? null
        : task.dueAt !== undefined
          ? task.dueAt
          : existing?.dueAt ?? null;
      const nextDate = nextDue ? getDueDatePart(nextDue) : null;
      const dateChanged = task.dueAt !== undefined && prevDate !== nextDate;
      const existingStartDate = existing?.startDate ?? null;

      const prevIsFixed = !!existing && isFixedRecurring(existing);
      const nextIsFixed = !isWindow && !!recurrenceRule;
      let nextStartDate = nextIsFixed
        ? task.startDate !== undefined
          ? task.startDate
          : existingStartDate
        : null;
      if (nextIsFixed && !nextStartDate) {
        nextStartDate = getRecurrenceAnchor({
          startDate: undefined,
          dueAt: nextDue,
          createdAt: existing?.createdAt || now,
          completionHistory: existing?.completionHistory || [],
        });
      }

      const effectiveDateChanged =
        prevIsFixed && nextIsFixed
          ? task.startDate !== undefined && task.startDate !== existing.startDate
          : dateChanged;

      const nextRescheduled = nextIsFixed
        ? task.rescheduledDates !== undefined
          ? task.rescheduledDates
          : existing?.rescheduledDates
        : undefined;
      const nextScheduleHistory = nextIsFixed
        ? task.scheduleHistory !== undefined
          ? task.scheduleHistory
          : existing?.scheduleHistory
        : undefined;
      const nextRemovedSkipped = !isWindow
        ? task.removedSkippedDates !== undefined
          ? task.removedSkippedDates
          : existing?.removedSkippedDates
        : undefined;
      const nextSkippedDateUpdatedAt = !isWindow
        ? task.skippedDateUpdatedAt !== undefined
          ? task.skippedDateUpdatedAt
          : existing?.skippedDateUpdatedAt
        : undefined;

      const fullTask: Task = {
        ...(existing || {}),
        ...task,
        id: taskId,
        dueAt: nextDue,
        startDate: nextStartDate,
        sortOrder:
          task.sortOrder !== undefined
            ? task.sortOrder
            : effectiveDateChanged
              ? undefined
              : existing?.sortOrder,
        createdAt: existing?.createdAt || now,
        updatedAt: now,
        deletedAt: task.deletedAt !== undefined ? task.deletedAt : null,
        completionHistory:
          task.completionHistory !== undefined
            ? [...task.completionHistory].sort((a, b) => a - b)
            : existing?.completionHistory || [],
        ...(existing?.removedCompletions ? { removedCompletions: existing.removedCompletions } : {}),
        skippedDates: task.skippedDates !== undefined ? task.skippedDates : existing?.skippedDates || [],
        ...(nextRemovedSkipped && nextRemovedSkipped.length > 0
          ? { removedSkippedDates: nextRemovedSkipped }
          : { removedSkippedDates: undefined }),
        ...(nextSkippedDateUpdatedAt && Object.keys(nextSkippedDateUpdatedAt).length > 0
          ? { skippedDateUpdatedAt: nextSkippedDateUpdatedAt }
          : { skippedDateUpdatedAt: undefined }),
        ...(nextRescheduled && Object.keys(nextRescheduled).length > 0
          ? { rescheduledDates: nextRescheduled }
          : { rescheduledDates: undefined }),
        ...(nextScheduleHistory && nextScheduleHistory.length > 0
          ? { scheduleHistory: nextScheduleHistory }
          : { scheduleHistory: undefined }),
        completedAt: task.completedAt !== undefined ? task.completedAt : existing?.completedAt ?? null,
        recurrence: recurrenceRule,
        subtasks: task.subtasks !== undefined ? task.subtasks : existing?.subtasks,
      };
      await db.tasks.put(fullTask);
      return fullTask;
    });
  }

  const recurrenceRule = normalizeRecurrenceForSave(task.recurrence ?? null);
  const isWindow = isWindowPeriodic({ recurrence: recurrenceRule });
  let initialStartDate = isWindow ? null : task.startDate ?? null;
  if (!isWindow && recurrenceRule && !initialStartDate) {
    initialStartDate = task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now));
  }
  const fullTask: Task = {
    title: task.title,
    notes: task.notes,
    dueAt: isWindow ? null : task.dueAt ?? null,
    startDate: initialStartDate,
    priority: task.priority,
    pinned: task.pinned,
    tags: task.tags,
    subtasks: task.subtasks,
    recurrence: recurrenceRule,
    ...(task.sortOrder !== undefined ? { sortOrder: task.sortOrder } : {}),
    id: newId(),
    createdAt: now,
    updatedAt: now,
    completionHistory: task.completionHistory
      ? [...task.completionHistory].sort((a, b) => a - b)
      : [],
    skippedDates: isWindow ? [] : task.skippedDates || [],
    completedAt: null,
    deletedAt: null,
  };

  if (task.sortOrder === undefined && !isWindow && options?.newTaskPosition === 'top') {
    await db.transaction('rw', db.tasks, async () => {
      const existingTasks = await db.tasks.toArray();
      fullTask.sortOrder = computeTopSortOrder(existingTasks);
      await db.tasks.put(fullTask);
    });
    return fullTask;
  }

  await db.tasks.put(fullTask);
  return fullTask;
}

/**
 * Find a single moved task in `orderedIds` when all other ordered tasks remain strictly increasing
 * and no unordered (`null`) task precedes an ordered one. Returns `null` if a full rebalance is needed.
 */
export function findMidpointReorderUpdate(
  existing: (Task | undefined)[],
  orderedIds: string[],
): { task: Task; nextOrder: number } | null {
  if (orderedIds.length < 2 || existing.some((t) => !t)) return null;
  const tasks = existing as Task[];

  for (let candidateIdx = 0; candidateIdx < tasks.length; candidateIdx++) {
    let prevOrder = -Infinity;
    let seenNull = false;
    let validRest = true;
    for (let j = 0; j < tasks.length; j++) {
      if (j === candidateIdx) continue;
      const ord = tasks[j].sortOrder;
      if (ord == null) {
        seenNull = true;
        continue;
      }
      if (seenNull || ord <= prevOrder) {
        validRest = false;
        break;
      }
      prevOrder = ord;
    }
    if (!validRest) continue;

    // Candidate must be placed into an ordered position (not after an unordered tail)
    let hasNullBefore = false;
    for (let j = 0; j < candidateIdx; j++) {
      if (tasks[j].sortOrder == null) {
        hasNullBefore = true;
        break;
      }
    }
    if (hasNullBefore) continue;

    const leftOrder = candidateIdx > 0 ? tasks[candidateIdx - 1].sortOrder ?? null : null;
    let rightOrder: number | null = null;
    for (let j = candidateIdx + 1; j < tasks.length; j++) {
      if (tasks[j].sortOrder != null) {
        rightOrder = tasks[j].sortOrder!;
        break;
      }
    }

    let nextOrder: number | null = null;
    if (leftOrder != null && rightOrder != null) {
      if (rightOrder - leftOrder >= 2) {
        nextOrder = Math.floor((leftOrder + rightOrder) / 2);
      }
    } else if (leftOrder == null && rightOrder != null) {
      nextOrder = rightOrder - 1000;
    } else if (leftOrder != null && rightOrder == null) {
      nextOrder = leftOrder + 1000;
    }

    if (nextOrder != null) {
      const moved = tasks[candidateIdx];
      if (moved.sortOrder === nextOrder) return null;
      return { task: moved, nextOrder };
    }
  }
  return null;
}

/**
 * Persist a manual task ordering (e.g. after long-press drag-and-drop).
 * Uses midpoint single-task updates when possible and falls back to spaced rebalancing when gaps narrow.
 */
export async function reorderTasks(orderedIds: string[]): Promise<void> {
  if (orderedIds.length === 0) return;
  const now = Date.now();
  const updatedCount = await db.transaction('rw', db.tasks, async () => {
    const existing = await db.tasks.bulkGet(orderedIds);
    const alreadyStrictlyIncreasing =
      existing.length > 0 &&
      existing.every((t, idx) => {
        if (!t || t.sortOrder == null) return false;
        return idx === 0 || t.sortOrder > existing[idx - 1]!.sortOrder!;
      });
    if (alreadyStrictlyIncreasing) {
      return 0;
    }

    const single = findMidpointReorderUpdate(existing, orderedIds);
    if (single) {
      await db.tasks.put({
        ...single.task,
        sortOrder: single.nextOrder,
        updatedAt: now,
      });
      return 1;
    }

    const updates: Task[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const task = existing[i];
      if (!task) continue;
      const nextOrder = (i + 1) * 1000;
      if (task.sortOrder !== nextOrder) {
        updates.push({
          ...task,
          sortOrder: nextOrder,
          updatedAt: now,
        });
      }
    }
    if (updates.length > 0) {
      await db.tasks.bulkPut(updates);
    }
    return updates.length;
  });
  recordDiagEvent('reorder', `ids=${orderedIds.join(',')} updated=${updatedCount}`);
}

function resolveNonTombstonedTimestamp(
  baseTs: number,
  removed: readonly number[] | undefined,
  dateStr: string
): number {
  if (!removed || removed.length === 0) return baseTs;
  const [, dayEndMs] = getDayBoundsMs(dateStr);
  const removedSet = new Set(removed);
  let ts = baseTs;
  while (removedSet.has(ts) && ts + 1 < dayEndMs) {
    ts += 1;
  }
  return ts;
}

function recordSkippedDateUpdates(
  existing: Record<string, number> | undefined,
  dates: readonly string[],
  ts: number
): Record<string, number> | undefined {
  if (dates.length === 0) {
    return existing && Object.keys(existing).length > 0 ? existing : undefined;
  }
  const next: Record<string, number> = existing ? { ...existing } : {};
  for (const d of dates) {
    next[d] = ts;
  }
  const entries = Object.entries(next).sort(([a], [b]) => a.localeCompare(b));
  const capped = entries.length > MAX_HISTORY ? entries.slice(-MAX_HISTORY) : entries;
  return capped.length > 0 ? Object.fromEntries(capped) : undefined;
}

function changedSkipDates(
  prevSkipped: readonly string[] | undefined,
  nextSkipped: readonly string[]
): string[] {
  const prevSet = new Set(prevSkipped || []);
  const nextSet = new Set(nextSkipped);
  const changed: string[] = [];
  for (const d of prevSet) {
    if (!nextSet.has(d)) changed.push(d);
  }
  for (const d of nextSet) {
    if (!prevSet.has(d)) changed.push(d);
  }
  return changed;
}

function buildCompletionHistoryUpdate(
  task: Pick<Task, 'completionHistory' | 'removedCompletions'>,
  baseTs: number,
  dateStr: string,
  alreadyDone: boolean
): { completionHistory: number[]; removedCompletions?: number[] } {
  const safeTs = alreadyDone
    ? baseTs
    : resolveNonTombstonedTimestamp(baseTs, task.removedCompletions, dateStr);
  const completionHistory = alreadyDone
    ? [...(task.completionHistory || [])]
    : [...(task.completionHistory || []), safeTs].sort((a, b) => a - b);
  const removed = (task.removedCompletions || []).filter((r) => r !== safeTs);
  return {
    completionHistory,
    ...(removed.length > 0 ? { removedCompletions: removed } : { removedCompletions: undefined }),
  };
}

/**
 * Complete a task.
 * - Window periodic: logs completion in completionHistory while keeping dueAt and completedAt null.
 * - Fixed recurring: marks occurrence date completed in completionHistory; resets subtasks.
 * - One-off: sets completedAt; if undated, sets dueAt to the completion date so it converts into a completed calendar task.
 */
export async function completeTask(id: string, dateStr?: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) {
      recordDiagEvent('complete_missing', `id=${id} date=${dateStr ?? ''}`);
      return null;
    }

    const now = Date.now();
    let updated: Task;

    if (isWindowPeriodic(task) && task.recurrence) {
      const targetDateStr = dateStr || formatDate(new Date(now));
      const ts = completionTimestampForDate(targetDateStr, now);
      const alreadyDone = isCompletedOnDate(task, targetDateStr);
      const historyUpdate = buildCompletionHistoryUpdate(task, ts, targetDateStr, alreadyDone);

      updated = {
        ...task,
        startDate: null,
        dueAt: null,
        completedAt: null,
        ...historyUpdate,
        updatedAt: now,
      };
      recordDiagEvent(
        'complete_window',
        `id=${id} title=${task.title.slice(0, 30)} target=${targetDateStr} already=${alreadyDone} hist=${historyUpdate.completionHistory.length}`
      );
    } else if (isFixedRecurring(task) && task.recurrence) {
      const targetDateStr =
        dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
      const ts = completionTimestampForDate(targetDateStr, now);
      const alreadyDone = isCompletedOnDate(task, targetDateStr);
      const historyUpdate = buildCompletionHistoryUpdate(task, ts, targetDateStr, alreadyDone);

      // If this date was previously marked skipped, completing it removes it from skippedDates
      const hadSkipped = (task.skippedDates || []).includes(targetDateStr);
      const skipped = (task.skippedDates || []).filter((d) => d !== targetDateStr);
      const removedSkippedDates = hadSkipped
        ? mergeRemovedSkipped(task.removedSkippedDates, [targetDateStr])
        : task.removedSkippedDates;
      const skippedDateUpdatedAt = hadSkipped
        ? recordSkippedDateUpdates(task.skippedDateUpdatedAt, [targetDateStr], now)
        : task.skippedDateUpdatedAt;
      const startDate = task.startDate || getRecurrenceAnchor(task);

      updated = {
        ...task,
        startDate,
        dueAt: task.dueAt ?? targetDateStr,
        completedAt: null,
        ...historyUpdate,
        skippedDates: skipped,
        ...(removedSkippedDates && removedSkippedDates.length > 0
          ? { removedSkippedDates }
          : { removedSkippedDates: undefined }),
        ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
          ? { skippedDateUpdatedAt }
          : { skippedDateUpdatedAt: undefined }),
        updatedAt: now,
        // Reset check items for the next cycle
        subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: false })),
      };
      recordDiagEvent(
        'complete_recurring',
        `id=${id} title=${task.title.slice(0, 30)} target=${targetDateStr} already=${alreadyDone} hist=${historyUpdate.completionHistory.length}`
      );
    } else {
      const targetDateStr =
        dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
      const todayStr = formatDate(new Date(now));
      const safeNow = resolveNonTombstonedTimestamp(now, task.removedCompletions, todayStr);
      const prevHistory = task.completionHistory || [];
      const additions: number[] = [];
      if (dateStr) {
        const compTs = completionTimestampForDate(dateStr, safeNow);
        if (compTs !== safeNow && !isCompletedOnDate(task, dateStr)) {
          additions.push(resolveNonTombstonedTimestamp(compTs, task.removedCompletions, dateStr));
        }
      }
      if (!prevHistory.includes(safeNow)) {
        additions.push(safeNow);
      }
      const history =
        additions.length > 0 ? [...prevHistory, ...additions].sort((a, b) => a - b) : prevHistory;
      const addedSet = new Set(additions);
      const remainingRemoved = (task.removedCompletions || []).filter((r) => !addedSet.has(r));

      updated = {
        ...task,
        dueAt: task.dueAt ?? targetDateStr,
        completedAt: safeNow,
        completionHistory: history,
        ...(remainingRemoved.length > 0
          ? { removedCompletions: remainingRemoved }
          : { removedCompletions: undefined }),
        updatedAt: now,
      };
      recordDiagEvent(
        'complete_oneoff',
        `id=${id} title=${task.title.slice(0, 30)} due=${updated.dueAt ?? ''}`
      );
    }

    await db.tasks.put(updated);
    return updated;
  });
}

/**
 * Skip a specific scheduled occurrence of a recurring task on `dateStr` (YYYY-MM-DD).
 * Item A & C: Records `dateStr` in `skippedDates` so that date is suppressed without wiping out
 * prior or intermediate days. Does NOT advance master dueAt if a future occurrence was skipped.
 */
export async function skipTaskOccurrence(id: string, dateStr: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) {
      recordDiagEvent('skip_missing', `id=${id} date=${dateStr}`);
      return null;
    }
    if (!isFixedRecurring(task)) {
      return null;
    }

    const now = Date.now();
    const origDate = findRescheduledOrigin(task, dateStr);
    const skipKey = origDate ?? dateStr;

    let nextRescheduled = task.rescheduledDates ? { ...task.rescheduledDates } : undefined;
    if (origDate && nextRescheduled) {
      delete nextRescheduled[origDate];
      if (Object.keys(nextRescheduled).length === 0) {
        nextRescheduled = undefined;
      }
    }

    const existingSkipped = task.skippedDates || [];
    const updatedSkipped = existingSkipped.includes(skipKey)
      ? existingSkipped
      : [...existingSkipped, skipKey];
    const updatedRemovedSkipped = removeFromSkippedTombstones(task.removedSkippedDates, [skipKey]);
    const skippedDateUpdatedAt = recordSkippedDateUpdates(
      task.skippedDateUpdatedAt,
      [skipKey],
      now
    );

    let updatedDueAt = task.dueAt;
    const masterDueDate = task.dueAt ? getDueDatePart(task.dueAt) : null;

    // Only advance task.dueAt if the date being skipped was the master task's current dueAt (or earlier)
    if (masterDueDate && dateStr <= masterDueDate) {
      const nextOccurrence = getSkipOccurrenceDate(
        { ...task, skippedDates: updatedSkipped, rescheduledDates: nextRescheduled },
        dateStr
      );
      if (nextOccurrence) {
        updatedDueAt = nextOccurrence;
      }
    }

    const startDate = task.startDate || getRecurrenceAnchor(task);

    const updated: Task = {
      ...task,
      startDate,
      dueAt: updatedDueAt,
      skippedDates: updatedSkipped,
      ...(updatedRemovedSkipped && updatedRemovedSkipped.length > 0
        ? { removedSkippedDates: updatedRemovedSkipped }
        : { removedSkippedDates: undefined }),
      ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
        ? { skippedDateUpdatedAt }
        : { skippedDateUpdatedAt: undefined }),
      ...(nextRescheduled ? { rescheduledDates: nextRescheduled } : { rescheduledDates: undefined }),
      updatedAt: now,
    };

    recordDiagEvent(
      'skip_occurrence',
      `id=${id} title=${task.title.slice(0, 30)} skipped=${skipKey} dueAt=${updated.dueAt ?? ''}`
    );

    await db.tasks.put(updated);
    return updated;
  });
}

/**
 * Unskip a previously skipped occurrence of a fixed-interval recurring task,
 * recording a removal tombstone and pulling `dueAt` back if earlier than current `dueAt`.
 */
export async function unskipTaskOccurrence(id: string, dateStr: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task || !isFixedRecurring(task)) {
      return null;
    }
    const existingSkipped = task.skippedDates || [];
    if (!existingSkipped.includes(dateStr)) {
      return task;
    }

    const now = Date.now();
    const updatedSkipped = existingSkipped.filter((d) => d !== dateStr);
    const updatedRemovedSkipped = mergeRemovedSkipped(task.removedSkippedDates, [dateStr]);
    const skippedDateUpdatedAt = recordSkippedDateUpdates(
      task.skippedDateUpdatedAt,
      [dateStr],
      now
    );

    let updatedDueAt = task.dueAt;
    if (task.dueAt) {
      const masterDate = getDueDatePart(task.dueAt);
      if (dateStr < masterDate && !isCompletedOnDate(task, dateStr)) {
        const time = hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;
        updatedDueAt = combineDueAt(dateStr, time);
      }
    }

    const updated: Task = {
      ...task,
      dueAt: updatedDueAt,
      ...(updatedSkipped.length > 0
        ? { skippedDates: updatedSkipped }
        : { skippedDates: undefined }),
      ...(updatedRemovedSkipped && updatedRemovedSkipped.length > 0
        ? { removedSkippedDates: updatedRemovedSkipped }
        : { removedSkippedDates: undefined }),
      ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
        ? { skippedDateUpdatedAt }
        : { skippedDateUpdatedAt: undefined }),
      updatedAt: now,
    };

    recordDiagEvent(
      'unskip_occurrence',
      `id=${id} title=${task.title.slice(0, 30)} unskipped=${dateStr} dueAt=${updated.dueAt ?? ''}`
    );

    await db.tasks.put(updated);
    return updated;
  });
}

function mergeRemovedTimestamps(existing: number[] | undefined, removed: number[]): number[] | undefined {
  if (removed.length === 0) return existing;
  const merged = Array.from(new Set([...(existing || []), ...removed])).sort((a, b) => a - b);
  return merged.length > 0 ? merged : undefined;
}

function mergeRemovedSkipped(existing: string[] | undefined, added: string[]): string[] | undefined {
  if (added.length === 0) return existing && existing.length > 0 ? existing : undefined;
  const merged = Array.from(new Set([...(existing || []), ...added])).sort();
  return merged.length > 0 ? merged : undefined;
}

function removeFromSkippedTombstones(
  existing: string[] | undefined,
  activeSkips: string[]
): string[] | undefined {
  if (!existing || existing.length === 0) return undefined;
  const activeSet = new Set(activeSkips);
  const filtered = existing.filter((d) => !activeSet.has(d));
  return filtered.length > 0 ? filtered : undefined;
}

function capRescheduledDates(map: Record<string, string>): Record<string, string> | undefined {
  const entries = Object.entries(map)
    .filter(([k, v]) => k !== v)
    .sort(([a], [b]) => a.localeCompare(b));
  if (entries.length === 0) return undefined;
  const capped = entries.length > MAX_HISTORY ? entries.slice(-MAX_HISTORY) : entries;
  return Object.fromEntries(capped);
}

export interface MoveRecurringResult {
  task: Task;
  previousTask: Task;
}

/**
 * Move only a single occurrence of a fixed-interval recurring task from `fromDate` to `toDate`
 * while preserving the rest of the series (Decision A2 + Decision D1).
 */
export async function moveRecurringOccurrenceOnly(params: {
  id: string;
  fromDate: string;
  toDate: string;
  title?: string;
  notes?: string;
  today?: Date;
}): Promise<MoveRecurringResult | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(params.id);
    if (!task || !isFixedRecurring(task) || !task.recurrence) {
      return null;
    }

    const previousTask: Task = structuredClone(task);
    const now = Date.now();
    const nextTitle = params.title !== undefined ? params.title : task.title;
    const nextNotes = params.notes !== undefined ? params.notes : task.notes;
    const origDate = findRescheduledOrigin(task, params.fromDate) ?? params.fromDate;
    const startDate = task.startDate || getRecurrenceAnchor(task);

    const nextRescheduled: Record<string, string> = { ...(task.rescheduledDates || {}) };
    let nextSkipped = [...(task.skippedDates || [])];
    const addedTombstones: string[] = [];

    const unskip = (dateStr: string) => {
      if (nextSkipped.includes(dateStr)) {
        nextSkipped = nextSkipped.filter((d) => d !== dateStr);
        addedTombstones.push(dateStr);
      }
    };

    if (isCompletedOnDate(task, params.fromDate)) {
      const todayStr = formatDate(params.today ?? new Date(now));
      if (params.toDate > todayStr) {
        return null;
      }

      const [dayStartMs, dayEndMs] = getDayBoundsMs(params.fromDate);
      const removedFromDay: number[] = [];
      const filteredHistory = (task.completionHistory || []).filter((ts) => {
        if (ts >= dayStartMs && ts < dayEndMs) {
          removedFromDay.push(ts);
          return false;
        }
        return true;
      });

      const alreadyCompletedTarget = isCompletedOnDate(
        { ...task, completionHistory: filteredHistory },
        params.toDate
      );
      const combinedRemoved = mergeRemovedTimestamps(task.removedCompletions, removedFromDay);
      const baseToTs = completionTimestampForDate(params.toDate, now);
      const toTs = alreadyCompletedTarget
        ? baseToTs
        : resolveNonTombstonedTimestamp(baseToTs, combinedRemoved, params.toDate);
      const nextHistory = alreadyCompletedTarget
        ? filteredHistory
        : [...filteredHistory, toTs].sort((a, b) => a - b);

      const nextRemovedCompletions = combinedRemoved?.filter((ts) => ts !== toTs);

      const hasCollisionOnTarget =
        taskOccursOnDate(task, params.toDate) &&
        !isSkippedOnDate(task, params.toDate) &&
        !isCompletedOnDate(task, params.toDate);

      if (params.toDate === origDate) {
        delete nextRescheduled[origDate];
        unskip(origDate);
      } else if (hasCollisionOnTarget) {
        delete nextRescheduled[origDate];
        if (!nextSkipped.includes(origDate)) {
          nextSkipped.push(origDate);
        }
      } else {
        nextRescheduled[origDate] = params.toDate;
        unskip(origDate);
        unskip(params.toDate);
      }

      const cappedRescheduled = capRescheduledDates(nextRescheduled);
      const nextRemovedSkipped = removeFromSkippedTombstones(
        mergeRemovedSkipped(task.removedSkippedDates, addedTombstones),
        nextSkipped
      );
      const skippedDateUpdatedAt = recordSkippedDateUpdates(
        task.skippedDateUpdatedAt,
        changedSkipDates(task.skippedDates, nextSkipped),
        now
      );

      const updated: Task = {
        ...task,
        title: nextTitle,
        notes: nextNotes,
        startDate,
        completionHistory: nextHistory,
        ...(nextRemovedCompletions && nextRemovedCompletions.length > 0
          ? { removedCompletions: nextRemovedCompletions }
          : { removedCompletions: undefined }),
        skippedDates: nextSkipped,
        ...(nextRemovedSkipped && nextRemovedSkipped.length > 0
          ? { removedSkippedDates: nextRemovedSkipped }
          : { removedSkippedDates: undefined }),
        ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
          ? { skippedDateUpdatedAt }
          : { skippedDateUpdatedAt: undefined }),
        ...(cappedRescheduled ? { rescheduledDates: cappedRescheduled } : { rescheduledDates: undefined }),
        updatedAt: now,
      };

      await db.tasks.put(updated);
      recordDiagEvent(
        'move_completion',
        `id=${task.id} from=${params.fromDate} to=${params.toDate}`
      );
      return { task: updated, previousTask };
    }

    const hasCollision =
      taskOccursOnDate(task, params.toDate) &&
      !isSkippedOnDate(task, params.toDate) &&
      !isCompletedOnDate(task, params.toDate);

    if (params.toDate === origDate) {
      delete nextRescheduled[origDate];
      unskip(origDate);
    } else if (hasCollision) {
      delete nextRescheduled[origDate];
      if (!nextSkipped.includes(origDate)) {
        nextSkipped.push(origDate);
      }
    } else {
      nextRescheduled[origDate] = params.toDate;
      unskip(origDate);
      unskip(params.toDate);
    }

    const cappedRescheduled = capRescheduledDates(nextRescheduled);
    const nextRemovedSkipped = removeFromSkippedTombstones(
      mergeRemovedSkipped(task.removedSkippedDates, addedTombstones),
      nextSkipped
    );
    const skippedDateUpdatedAt = recordSkippedDateUpdates(
      task.skippedDateUpdatedAt,
      changedSkipDates(task.skippedDates, nextSkipped),
      now
    );

    const updated: Task = {
      ...task,
      title: nextTitle,
      notes: nextNotes,
      startDate,
      skippedDates: nextSkipped,
      ...(nextRemovedSkipped && nextRemovedSkipped.length > 0
        ? { removedSkippedDates: nextRemovedSkipped }
        : { removedSkippedDates: undefined }),
      ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
        ? { skippedDateUpdatedAt }
        : { skippedDateUpdatedAt: undefined }),
      ...(cappedRescheduled ? { rescheduledDates: cappedRescheduled } : { rescheduledDates: undefined }),
      updatedAt: now,
    };

    await db.tasks.put(updated);
    recordDiagEvent(
      'move_occurrence',
      `id=${task.id} from=${params.fromDate} to=${params.toDate} orig=${origDate}`
    );
    return { task: updated, previousTask };
  });
}

/**
 * Move the recurring task's schedule forward/backward to `toDate` while preserving all historical
 * occurrences on their original dates via `scheduleHistory` (Decision B3-Single-Task + Decision C1).
 */
export async function moveRecurringSeries(params: {
  id: string;
  fromDate: string;
  toDate: string;
  title?: string;
  notes?: string;
  explicitRecurrence?: RecurrenceRule;
}): Promise<MoveRecurringResult | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(params.id);
    if (!task || !isFixedRecurring(task) || !task.recurrence) {
      return null;
    }

    const previousTask: Task = structuredClone(task);
    const now = Date.now();
    const nextTitle = params.title !== undefined ? params.title : task.title;
    const nextNotes = params.notes !== undefined ? params.notes : task.notes;

    const origFromDate = findRescheduledOrigin(task, params.fromDate) ?? params.fromDate;
    const cutoffDate = params.toDate < origFromDate ? params.toDate : origFromDate;
    const segmentEnd = formatDate(addDays(parseDate(cutoffDate), -1));

    const baseRuleForMove = getRuleActiveOnDate(task, origFromDate) ?? task.recurrence;
    const rawNextRule = params.explicitRecurrence
      ? normalizeRecurrenceForSave(params.explicitRecurrence)!
      : buildSeriesMoveRule(
          baseRuleForMove,
          origFromDate,
          params.toDate,
          task.recurrence.endOnDate,
          task.recurrence.endAfterCount
        ).nextRule;

    const nextScheduleHistory = buildUpdatedScheduleHistory(task, segmentEnd);

    const keptRescheduledMap: Record<string, string> = {};
    for (const [orig, target] of Object.entries(task.rescheduledDates || {})) {
      if (orig <= segmentEnd) {
        keptRescheduledMap[orig] = target;
      }
    }
    const keptRescheduled = capRescheduledDates(keptRescheduledMap);

    const nextSkipped: string[] = [];
    const prunedSkipped: string[] = [];
    for (const d of task.skippedDates || []) {
      if (d <= segmentEnd) {
        nextSkipped.push(d);
      } else {
        prunedSkipped.push(d);
      }
    }
    const nextRemovedSkipped = removeFromSkippedTombstones(
      mergeRemovedSkipped(task.removedSkippedDates, prunedSkipped),
      nextSkipped
    );
    const skippedDateUpdatedAt = recordSkippedDateUpdates(
      task.skippedDateUpdatedAt,
      changedSkipDates(task.skippedDates, nextSkipped),
      now
    );

    const existingTime = task.dueAt && hasDueTime(task.dueAt) ? splitDueAt(task.dueAt).time : null;
    const nextDueAt = combineDueAt(params.toDate, existingTime);

    const updated: Task = {
      ...task,
      title: nextTitle,
      notes: nextNotes,
      startDate: params.toDate,
      dueAt: nextDueAt,
      recurrence: rawNextRule,
      ...(nextScheduleHistory.length > 0
        ? { scheduleHistory: nextScheduleHistory }
        : { scheduleHistory: undefined }),
      ...(keptRescheduled ? { rescheduledDates: keptRescheduled } : { rescheduledDates: undefined }),
      skippedDates: nextSkipped,
      ...(nextRemovedSkipped && nextRemovedSkipped.length > 0
        ? { removedSkippedDates: nextRemovedSkipped }
        : { removedSkippedDates: undefined }),
      ...(skippedDateUpdatedAt && Object.keys(skippedDateUpdatedAt).length > 0
        ? { skippedDateUpdatedAt }
        : { skippedDateUpdatedAt: undefined }),
      sortOrder: undefined,
      updatedAt: now,
    };

    await db.tasks.put(updated);
    recordDiagEvent(
      'move_series',
      `id=${task.id} from=${params.fromDate} to=${params.toDate} segments=${nextScheduleHistory.length}`
    );
    return { task: updated, previousTask };
  });
}

/**
 * Restore a prior task snapshot (for Undo), updating CRDT tombstones so undone completions/skips
 * do not resurrect on Google Drive sync.
 */
export async function restoreTaskSnapshot(
  previousTask: Task,
  currentTask?: Task
): Promise<Task> {
  return db.transaction('rw', db.tasks, async () => {
    const live = await db.tasks.get(previousTask.id);
    const now = Date.now();
    const prevHistory = previousTask.completionHistory || [];
    const prevHistorySet = new Set(prevHistory);
    const currentSources = [live, currentTask].filter((t): t is Task => Boolean(t));

    const addedCompletions: number[] = [];
    let knownRemoved = previousTask.removedCompletions;
    for (const src of currentSources) {
      for (const ts of src.completionHistory || []) {
        if (!prevHistorySet.has(ts)) addedCompletions.push(ts);
      }
      if (src.removedCompletions?.length) {
        knownRemoved = mergeRemovedTimestamps(knownRemoved, src.removedCompletions);
      }
    }
    const allKnownRemoved = mergeRemovedTimestamps(knownRemoved, addedCompletions);

    const restoredHistory = prevHistory
      .map((ts) => {
        if (!allKnownRemoved || !allKnownRemoved.includes(ts)) return ts;
        return resolveNonTombstonedTimestamp(ts, allKnownRemoved, formatDate(new Date(ts)));
      })
      .sort((a, b) => a - b);
    const restoredSet = new Set(restoredHistory);
    const mergedRemovedCompletions = allKnownRemoved?.filter((ts) => !restoredSet.has(ts));

    const prevSkippedSet = new Set(previousTask.skippedDates || []);
    const addedSkipped: string[] = [];
    for (const src of currentSources) {
      for (const d of src.skippedDates || []) {
        if (!prevSkippedSet.has(d)) addedSkipped.push(d);
      }
    }
    const mergedRemovedSkipped = removeFromSkippedTombstones(
      mergeRemovedSkipped(previousTask.removedSkippedDates, addedSkipped),
      previousTask.skippedDates || []
    );

    const currentSkippedRef = live?.skippedDates ?? currentTask?.skippedDates;
    const flippedSkipped = changedSkipDates(currentSkippedRef, previousTask.skippedDates || []);
    let mergedSkippedUpdatedAt = previousTask.skippedDateUpdatedAt
      ? { ...previousTask.skippedDateUpdatedAt }
      : undefined;
    for (const src of [currentTask, live]) {
      if (src?.skippedDateUpdatedAt) {
        for (const [k, v] of Object.entries(src.skippedDateUpdatedAt)) {
          if (!mergedSkippedUpdatedAt) mergedSkippedUpdatedAt = {};
          if (!mergedSkippedUpdatedAt[k] || v > mergedSkippedUpdatedAt[k]) {
            mergedSkippedUpdatedAt[k] = v;
          }
        }
      }
    }
    mergedSkippedUpdatedAt = recordSkippedDateUpdates(mergedSkippedUpdatedAt, flippedSkipped, now);

    const restored: Task = {
      ...previousTask,
      deletedAt: previousTask.deletedAt ?? null,
      completionHistory: restoredHistory,
      ...(mergedRemovedCompletions && mergedRemovedCompletions.length > 0
        ? { removedCompletions: mergedRemovedCompletions }
        : { removedCompletions: undefined }),
      ...(mergedRemovedSkipped && mergedRemovedSkipped.length > 0
        ? { removedSkippedDates: mergedRemovedSkipped }
        : { removedSkippedDates: undefined }),
      ...(mergedSkippedUpdatedAt && Object.keys(mergedSkippedUpdatedAt).length > 0
        ? { skippedDateUpdatedAt: mergedSkippedUpdatedAt }
        : { skippedDateUpdatedAt: undefined }),
      updatedAt: Math.max(now, (live?.updatedAt ?? 0) + 1),
    };
    await db.tasks.put(restored);
    recordDiagEvent('restore_snapshot', `id=${restored.id}`);
    return restored;
  });
}

export async function undoCompleteUndatedTask(id: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return null;

    const now = Date.now();
    const compDate = task.completedAt ? formatDate(new Date(task.completedAt)) : null;
    const prevHistory = task.completionHistory || [];
    const removed: number[] = [];
    const history = prevHistory.filter((ts) => {
      const match =
        ts === task.completedAt || (compDate != null && formatDate(new Date(ts)) === compDate);
      if (match) removed.push(ts);
      return !match;
    });
    const removedCompletions = mergeRemovedTimestamps(task.removedCompletions, removed);

    const updated: Task = {
      ...task,
      dueAt: null,
      completedAt: null,
      completionHistory: history,
      ...(removedCompletions ? { removedCompletions } : { removedCompletions: undefined }),
      updatedAt: now,
    };
    await db.tasks.put(updated);
    return updated;
  });
}

export async function uncompleteTask(id: string, dateStr?: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return null;

    const now = Date.now();
    let history = task.completionHistory || [];
    const removed: number[] = [];
    let targetDateStr: string | undefined = dateStr;

    if (!isWindowPeriodic(task) && !isFixedRecurring(task)) {
      removed.push(...history);
      history = [];
    } else {
      if (isWindowPeriodic(task)) {
        targetDateStr = dateStr || formatDate(new Date(now));
      } else if (isFixedRecurring(task) && task.recurrence) {
        targetDateStr =
          dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
      }

      if (targetDateStr) {
        const [dayStartMs, dayEndMs] = getDayBoundsMs(targetDateStr);
        history = history.filter((ts) => {
          if (ts >= dayStartMs && ts < dayEndMs) {
            removed.push(ts);
            return false;
          }
          return true;
        });
      }
    }

    const todayStr = formatDate(new Date(now));
    let nextRecurrence = task.recurrence;
    if (
      isFixedRecurring(task) &&
      task.recurrence?.endOnDate &&
      targetDateStr &&
      targetDateStr < todayStr &&
      task.recurrence.endOnDate === targetDateStr
    ) {
      const latestMs = getLatestCompletionMs({ completionHistory: history });
      const fallbackBeforeStart = formatDate(addDays(parseDate(getRecurrenceAnchor(task)), -1));
      nextRecurrence = {
        ...task.recurrence,
        endOnDate: latestMs != null ? formatDate(new Date(latestMs)) : fallbackBeforeStart,
      };
    }

    const removedCompletions = mergeRemovedTimestamps(task.removedCompletions, removed);

    const updated: Task = {
      ...task,
      ...(nextRecurrence !== undefined ? { recurrence: nextRecurrence } : {}),
      completedAt: null,
      completionHistory: history,
      ...(removedCompletions ? { removedCompletions } : { removedCompletions: undefined }),
      updatedAt: now,
    };
    recordDiagEvent(
      'uncomplete',
      `id=${id} title=${task.title.slice(0, 30)} date=${dateStr ?? ''}`
    );
    await db.tasks.put(updated);
    return updated;
  });
}

export async function logTaskCompletion(id: string, dateStr: string): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return null;

    const now = Date.now();
    const ts = completionTimestampForDate(dateStr, now);
    const alreadyDone = isCompletedOnDate(task, dateStr);
    const historyUpdate = buildCompletionHistoryUpdate(task, ts, dateStr, alreadyDone);

    const updated: Task = {
      ...task,
      ...(isWindowPeriodic(task) ? { dueAt: null, startDate: null } : {}),
      ...historyUpdate,
      updatedAt: now,
    };
    await db.tasks.put(updated);
    return updated;
  });
}

export async function removeTaskCompletion(id: string, timestamp: number): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return null;

    const now = Date.now();
    const history = (task.completionHistory || []).filter((ts) => ts !== timestamp);
    const removedCompletions = mergeRemovedTimestamps(task.removedCompletions, [timestamp]);

    const updated: Task = {
      ...task,
      completionHistory: history,
      ...(removedCompletions ? { removedCompletions } : {}),
      updatedAt: now,
    };
    await db.tasks.put(updated);
    return updated;
  });
}

export async function stopRecurringTask(
  id: string
): Promise<{ task: Task; previousEndOnDate: string | null } | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task || !task.recurrence) return null;

    const now = Date.now();
    const previousEndOnDate = task.recurrence.endOnDate ?? null;
    const latestMs = getLatestCompletionMs(task);
    const stopDate =
      latestMs != null ? formatDate(new Date(latestMs)) : formatDate(addDays(new Date(now), -1));

    const updated: Task = {
      ...task,
      recurrence: {
        ...task.recurrence,
        endOnDate: stopDate,
      },
      updatedAt: now,
    };
    await db.tasks.put(updated);
    recordDiagEvent('stop_recurring', `id=${id} endOnDate=${stopDate}`);
    return { task: updated, previousEndOnDate };
  });
}

export async function setTaskEndOnDate(
  id: string,
  endOnDate: string | null
): Promise<Task | null> {
  return db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task || !task.recurrence) return null;

    const now = Date.now();
    const updated: Task = {
      ...task,
      recurrence: {
        ...task.recurrence,
        endOnDate,
      },
      updatedAt: now,
    };
    await db.tasks.put(updated);
    return updated;
  });
}

export async function softDeleteTask(id: string): Promise<void> {
  await db.transaction('rw', db.tasks, async () => {
    const task = await db.tasks.get(id);
    if (!task) return;

    const now = Date.now();
    await db.tasks.put({
      ...task,
      deletedAt: now,
      updatedAt: now,
    });
    recordDiagEvent('delete_task', `id=${id} title=${task.title.slice(0, 30)}`);
  });
}

function isGoogleSyncActive(): boolean {
  return Boolean(getGoogleAccount());
}

/**
 * Identify historical completed tasks created by bulk TickTick CSV imports (which share an
 * identical import `updatedAt` across multiple non-recurring completed rows whose `completedAt`
 * predates the import timestamp by > 1s).
 */
export function findImportedCompletedTaskIds(tasks: ReadonlyArray<Task>): string[] {
  const byUpdatedAt = new Map<number, Task[]>();
  for (const t of tasks) {
    if (
      t.deletedAt ||
      t.recurrence ||
      typeof t.completedAt !== 'number' ||
      t.sortOrder !== undefined ||
      isSampleId(t.id)
    ) {
      continue;
    }
    const bucket = byUpdatedAt.get(t.updatedAt);
    if (bucket) bucket.push(t);
    else byUpdatedAt.set(t.updatedAt, [t]);
  }

  const ids: string[] = [];
  for (const [updatedAt, bucket] of byUpdatedAt) {
    if (bucket.length < 2) continue;
    let olderCount = 0;
    for (const t of bucket) {
      if (t.completedAt! < updatedAt - 1000) {
        olderCount++;
        if (olderCount >= 2) break;
      }
    }
    if (olderCount < 2) continue;
    for (const t of bucket) {
      if (t.completedAt! <= updatedAt) {
        ids.push(t.id);
      }
    }
  }
  return ids;
}

function hasActiveRecurrence(task: Task): boolean {
  return Boolean(task.recurrence);
}

function comparePrimaryTask(a: Task, b: Task): number {
  const rank = (t: Task): number => {
    const open = !isCompleted(t);
    const rec = hasActiveRecurrence(t);
    if (open && rec) return 5;
    if (open) return 4;
    if (rec) return 3;
    if (t.dueAt) return 2;
    return 1;
  };
  const rDiff = rank(b) - rank(a);
  if (rDiff !== 0) return rDiff;
  const hDiff = (b.completionHistory?.length ?? 0) - (a.completionHistory?.length ?? 0);
  if (hDiff !== 0) return hDiff;
  return b.updatedAt - a.updatedAt;
}

function mergeTaskGroup(group: Task[], now: number): { keeper: Task; dropped: Task[] } {
  const sorted = [...group].sort(comparePrimaryTask);
  const [primary, ...rest] = sorted;
  const historySet = new Set<number>(primary.completionHistory ?? []);
  if (typeof primary.completedAt === 'number') historySet.add(primary.completedAt);

  for (const dup of rest) {
    if (typeof dup.completedAt === 'number') historySet.add(dup.completedAt);
    for (const ts of dup.completionHistory ?? []) historySet.add(ts);
  }

  const mergedHistory = Array.from(historySet)
    .sort((a, b) => a - b)
    .slice(-MAX_HISTORY);
  const keeper: Task = {
    ...primary,
    completionHistory: mergedHistory,
    updatedAt: now,
  };
  return { keeper, dropped: rest };
}

/**
 * Merges duplicate tasks left behind by earlier imports and purges
 * soft-delete tombstones (all when signed out, or expired >30d tombstones when Drive sync is active).
 */
export async function repairAndDeduplicateDatabase(): Promise<{
  deduplicatedTasks: number;
  purgedTombstones: number;
}> {
  const syncActive = isGoogleSyncActive();
  const now = Date.now();
  const expiredCutoff = now - TOMBSTONE_TTL_MS;

  const result = await db.transaction('rw', db.tasks, async () => {
    const allTasks = await db.tasks.toArray();
    const taskMap = new Map(allTasks.map((t) => [t.id, { ...t }]));
    const dirtyTaskIds = new Set<string>();

    // Deduplicate active tasks sharing (titleLower, createdAt).
    const byExactKey = new Map<string, Task[]>();
    for (const task of taskMap.values()) {
      if (task.deletedAt) continue;
      const key = `${task.title.trim().toLowerCase()}\0${task.createdAt}`;
      const bucket = byExactKey.get(key) ?? [];
      bucket.push(task);
      byExactKey.set(key, bucket);
    }

    let deduplicatedTasks = 0;
    const collapseBucket = (bucket: Task[]) => {
      const { keeper, dropped } = mergeTaskGroup(bucket, now);
      taskMap.set(keeper.id, keeper);
      dirtyTaskIds.add(keeper.id);
      for (const dup of dropped) {
        taskMap.set(dup.id, { ...dup, deletedAt: now, updatedAt: now });
        dirtyTaskIds.add(dup.id);
        deduplicatedTasks++;
      }
    };

    for (const bucket of byExactKey.values()) {
      if (bucket.length <= 1) continue;
      collapseBucket(bucket);
    }

    // Collapse duplicate open tasks sharing a title when any is recurring.
    const openByTitleKey = new Map<string, Task[]>();
    for (const task of taskMap.values()) {
      if (task.deletedAt || isCompleted(task)) continue;
      const key = task.title.trim().toLowerCase();
      const bucket = openByTitleKey.get(key) ?? [];
      bucket.push(task);
      openByTitleKey.set(key, bucket);
    }

    for (const bucket of openByTitleKey.values()) {
      if (bucket.length <= 1 || !bucket.some(hasActiveRecurrence)) continue;
      collapseBucket(bucket);
    }

    let purgedTombstones = 0;
    const hasAnyActiveTask = Array.from(taskMap.values()).some((t) => !t.deletedAt);
    if (hasAnyActiveTask) {
      if (syncActive) {
        const isExpired = (item: { deletedAt?: number | null }) =>
          Boolean(item.deletedAt) && item.deletedAt! <= expiredCutoff;
        purgedTombstones = Array.from(taskMap.values()).filter(isExpired).length;

        const tasksToPut = Array.from(dirtyTaskIds)
          .map((id) => taskMap.get(id)!)
          .filter(Boolean);
        if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
      } else {
        const shouldPurgeTombstone = (item: { deletedAt?: number | null }) => Boolean(item.deletedAt);

        const deletedTaskIds = Array.from(taskMap.values())
          .filter(shouldPurgeTombstone)
          .map((t) => t.id);
        const deletedTaskIdSet = new Set(deletedTaskIds);
        const tasksToPut = Array.from(dirtyTaskIds)
          .filter((id) => !deletedTaskIdSet.has(id))
          .map((id) => taskMap.get(id)!)
          .filter(Boolean);

        if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
        if (deletedTaskIds.length) await db.tasks.bulkDelete(deletedTaskIds);
        purgedTombstones = deletedTaskIds.length;
      }
    } else {
      const tasksToPut = Array.from(dirtyTaskIds)
        .map((id) => taskMap.get(id)!)
        .filter(Boolean);
      if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
    }

    return { deduplicatedTasks, purgedTombstones };
  });

  if (syncActive && result.purgedTombstones > 0) {
    setTombstonesPrunedBefore(expiredCutoff);
  }

  recordDiagEvent(
    'db_repair',
    `deduplicatedTasks=${result.deduplicatedTasks} purgedTombstones=${result.purgedTombstones} sync=${syncActive}`,
  );
  return result;
}

export interface StorageCleanupPreview {
  importedCompletedTasks: number;
  tombstonedTasks: number;
  activeRemainingTasks: number;
}

export interface StorageCleanupResult {
  removedImportedCompleted: number;
  purgedTasks: number;
  needsSync: boolean;
}

export async function getStorageCleanupPreview(): Promise<StorageCleanupPreview> {
  const allTasks = await db.tasks.toArray();
  const importedIds = findImportedCompletedTaskIds(allTasks);
  let activeTasks = 0;
  let tombstonedTasks = 0;
  for (const t of allTasks) {
    if (t.deletedAt) tombstonedTasks++;
    else activeTasks++;
  }
  return {
    importedCompletedTasks: importedIds.length,
    tombstonedTasks,
    activeRemainingTasks: Math.max(0, activeTasks - importedIds.length),
  };
}

/**
 * Remove TickTick-imported completed tasks and deleted task tombstones.
 * When signed in to Google Drive, stages tombstones and advances the prune watermark so the next
 * Drive sync deletes them remotely before removing them locally.
 */
export async function cleanupImportedAndTombstones(): Promise<StorageCleanupResult> {
  const syncActive = isGoogleSyncActive();
  const now = Date.now();

  const result = await db.transaction('rw', db.tasks, async () => {
    const allTasks = await db.tasks.toArray();

    const importedIdList = findImportedCompletedTaskIds(allTasks);
    const importedIdSet = new Set(importedIdList);
    const tombstonedTaskIds = allTasks.filter((t) => Boolean(t.deletedAt)).map((t) => t.id);

    const total = importedIdList.length + tombstonedTaskIds.length;
    if (total === 0) {
      return {
        removedImportedCompleted: 0,
        purgedTasks: 0,
        needsSync: false,
      };
    }

    if (!syncActive) {
      const taskIdsToDelete = [...importedIdList, ...tombstonedTaskIds];
      if (taskIdsToDelete.length) await db.tasks.bulkDelete(taskIdsToDelete);
      return {
        removedImportedCompleted: importedIdList.length,
        purgedTasks: tombstonedTaskIds.length,
        needsSync: false,
      };
    }

    const softDeletedImported = allTasks
      .filter((t) => importedIdSet.has(t.id))
      .map((t) => ({ ...t, deletedAt: now, updatedAt: now }));
    if (softDeletedImported.length > 0) {
      await db.tasks.bulkPut(softDeletedImported);
    }

    return {
      removedImportedCompleted: softDeletedImported.length,
      purgedTasks: tombstonedTaskIds.length,
      needsSync: true,
    };
  });

  if (result.removedImportedCompleted > 0 || result.purgedTasks > 0) {
    setTombstonesPrunedBefore(now);
  }

  recordDiagEvent(
    'storage_cleanup',
    `imported=${result.removedImportedCompleted} tasks=${result.purgedTasks} needsSync=${result.needsSync}`,
  );
  return result;
}
