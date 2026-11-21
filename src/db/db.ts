import Dexie, { type Table } from 'dexie';
import type {
  Folder,
  FolderInput,
  Task,
  TaskInput,
  TaskList,
  TaskListInput,
} from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import {
  addDays,
  completionTimestampForDate,
  formatDate,
  getDueDatePart,
  getLatestCompletionMs,
  getRecurrenceAnchor,
  getSkipOccurrenceDate,
  getWindowBounds,
  isCompleted,
  isCompletedOnDate,
  isFixedRecurring,
  isWindowPeriodic,
  parseDate,
} from '../domain/recurrence';
import { newId } from '../domain/id';
import { recordDiagEvent } from '../domain/diagnostics';
import { getStoredClientId } from '../sync/googleAuth';
import { buildSampleData, isSampleId } from './sampleData';

export { buildSampleData, isSampleId, SAMPLE_ID_PREFIX } from './sampleData';

export class TempoDatabase extends Dexie {
  tasks!: Table<Task, string>;
  lists!: Table<TaskList, string>;
  folders!: Table<Folder, string>;

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
  }
}

export const db = new TempoDatabase();

export async function ensureInboxList(): Promise<TaskList> {
  const existing = await db.lists.get(INBOX_LIST_ID);
  if (existing && !existing.deletedAt) return existing;

  const now = Date.now();
  const inbox: TaskList = {
    id: INBOX_LIST_ID,
    name: 'Inbox',
    sortOrder: 0,
    folderId: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.lists.put(inbox);
  return inbox;
}

/** Make sure the built-in Inbox list exists. Never seeds tasks. */
export async function initDatabase(): Promise<void> {
  await ensureInboxList();
}

/** Settings → "Load sample tasks": (re)insert the demo data with fresh dates. */
export async function loadSampleTasks(nowDate: Date = new Date()): Promise<number> {
  await ensureInboxList();
  const { folders, lists, tasks } = buildSampleData(nowDate);
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    await db.folders.bulkPut(folders);
    await db.lists.bulkPut(lists);
    await db.tasks.bulkPut(tasks.map((t) => ({ ...t, deletedAt: null })));
  });
  recordDiagEvent('load_sample', `tasks=${tasks.length}`);
  return tasks.length;
}

/**
 * Settings → "Clear sample tasks": soft-delete (tombstone) every demo task, list and
 * folder so the removal also propagates through Drive sync.
 */
export async function clearSampleTasks(): Promise<number> {
  const now = Date.now();
  let removed = 0;
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    const tasks = (await db.tasks.toArray()).filter((t) => isSampleId(t.id) && !t.deletedAt);
    removed = tasks.length;
    await db.tasks.bulkPut(tasks.map((t) => ({ ...t, deletedAt: now, updatedAt: now })));
    const lists = (await db.lists.toArray()).filter((l) => isSampleId(l.id) && !l.deletedAt);
    await db.lists.bulkPut(lists.map((l) => ({ ...l, deletedAt: now, updatedAt: now })));
    const folders = (await db.folders.toArray()).filter((f) => isSampleId(f.id) && !f.deletedAt);
    await db.folders.bulkPut(folders.map((f) => ({ ...f, deletedAt: now, updatedAt: now })));
  });
  recordDiagEvent('clear_sample', `removed=${removed}`);
  return removed;
}

/**
 * Settings › Integrations & Import → "Clear all current data":
 * soft-delete (tombstone) all tasks, custom lists, folders, and saved filters
 * so the removal also propagates through Drive sync, keeping the built-in Inbox list.
 */
export async function clearAllData(): Promise<number> {
  const now = Date.now();
  const markDeleted = <T extends { deletedAt?: number | null; updatedAt: number }>(items: T[]): T[] =>
    items.filter((x) => !x.deletedAt).map((x) => ({ ...x, deletedAt: now, updatedAt: now }));

  let removedTasks = 0;
  await db.transaction('rw', db.folders, db.lists, db.tasks, async () => {
    const tasks = markDeleted(await db.tasks.toArray());
    removedTasks = tasks.length;
    if (tasks.length) await db.tasks.bulkPut(tasks);

    const lists = markDeleted((await db.lists.toArray()).filter((l) => l.id !== INBOX_LIST_ID));
    if (lists.length) await db.lists.bulkPut(lists);

    const folders = markDeleted(await db.folders.toArray());
    if (folders.length) await db.folders.bulkPut(folders);
  });
  await ensureInboxList();
  recordDiagEvent('clear_all_data', `removedTasks=${removedTasks}`);
  return removedTasks;
}

function normalizeRecurrenceForSave(
  rule: Task['recurrence'] | undefined
): Task['recurrence'] {
  if (!rule) return null;
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

export async function saveTask(task: TaskInput): Promise<Task> {
  const now = Date.now();
  let fullTask: Task;

  if (task.id) {
    const existing = await db.tasks.get(task.id);
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
    let nextStartDate = isWindow
      ? null
      : task.startDate !== undefined
        ? task.startDate
        : existingStartDate;
    if (!isWindow && recurrenceRule && !nextStartDate) {
      nextStartDate = getRecurrenceAnchor({
        startDate: undefined,
        dueAt: nextDue,
        createdAt: existing?.createdAt || now,
        completionHistory: existing?.completionHistory || [],
      });
    }

    fullTask = {
      ...(existing || {}),
      ...task,
      id: task.id,
      listId: task.listId || existing?.listId || INBOX_LIST_ID,
      dueAt: nextDue,
      startDate: nextStartDate,
      sortOrder:
        task.sortOrder !== undefined
          ? task.sortOrder
          : dateChanged
            ? undefined
            : existing?.sortOrder,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      completionHistory:
        task.completionHistory !== undefined
          ? [...task.completionHistory].sort((a, b) => a - b)
          : existing?.completionHistory || [],
      ...(existing?.removedCompletions ? { removedCompletions: existing.removedCompletions } : {}),
      skippedDates: task.skippedDates !== undefined ? task.skippedDates : existing?.skippedDates || [],
      completedAt: task.completedAt !== undefined ? task.completedAt : existing?.completedAt ?? null,
      recurrence: recurrenceRule,
      subtasks: task.subtasks !== undefined ? task.subtasks : existing?.subtasks,
    };
  } else {
    const recurrenceRule = normalizeRecurrenceForSave(task.recurrence ?? null);
    const isWindow = isWindowPeriodic({ recurrence: recurrenceRule });
    let initialStartDate = isWindow ? null : task.startDate ?? null;
    if (!isWindow && recurrenceRule && !initialStartDate) {
      initialStartDate = task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now));
    }
    fullTask = {
      title: task.title,
      notes: task.notes,
      listId: task.listId || INBOX_LIST_ID,
      dueAt: isWindow ? null : task.dueAt ?? null,
      startDate: initialStartDate,
      priority: task.priority,
      pinned: task.pinned,
      tags: task.tags,
      subtasks: task.subtasks,
      recurrence: recurrenceRule,
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

/**
 * Complete a task.
 * - Window periodic: logs completion in completionHistory while keeping dueAt and completedAt null.
 * - Fixed recurring: marks occurrence date completed in completionHistory; resets subtasks.
 * - One-off: sets completedAt; if undated, sets dueAt to the completion date so it converts into a completed calendar task.
 */
export async function completeTask(id: string, dateStr?: string): Promise<Task | null> {
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
    const history = alreadyDone
      ? [...(task.completionHistory || [])]
      : [...(task.completionHistory || []), ts].sort((a, b) => a - b);
    const removed = (task.removedCompletions || []).filter((r) => r !== ts);

    updated = {
      ...task,
      startDate: null,
      dueAt: null,
      completedAt: null,
      completionHistory: history,
      ...(removed.length > 0 ? { removedCompletions: removed } : { removedCompletions: undefined }),
      updatedAt: now,
    };
    recordDiagEvent(
      'complete_window',
      `id=${id} title=${task.title.slice(0, 30)} target=${targetDateStr} already=${alreadyDone} hist=${history.length}`
    );
  } else if (isFixedRecurring(task) && task.recurrence) {
    const targetDateStr =
      dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
    const ts = completionTimestampForDate(targetDateStr, now);
    const alreadyDone = isCompletedOnDate(task, targetDateStr);
    const history = alreadyDone
      ? [...(task.completionHistory || [])]
      : [...(task.completionHistory || []), ts];

    // If this date was previously marked skipped, completing it removes it from skippedDates
    const skipped = (task.skippedDates || []).filter((d) => d !== targetDateStr);
    const startDate = task.startDate || getRecurrenceAnchor(task);

    updated = {
      ...task,
      startDate,
      dueAt: task.dueAt ?? targetDateStr,
      completedAt: null,
      completionHistory: history,
      skippedDates: skipped,
      updatedAt: now,
      // Reset check items for the next cycle
      subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: false })),
    };
    recordDiagEvent(
      'complete_recurring',
      `id=${id} title=${task.title.slice(0, 30)} target=${targetDateStr} already=${alreadyDone} hist=${history.length}`
    );
  } else {
    const targetDateStr =
      dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
    const compTs = dateStr ? completionTimestampForDate(dateStr, now) : now;
    const prevHistory = task.completionHistory || [];
    const history = prevHistory.includes(now)
      ? prevHistory
      : dateStr && compTs !== now && !prevHistory.includes(compTs)
        ? [...prevHistory, compTs, now]
        : [...prevHistory, now];
    updated = {
      ...task,
      dueAt: task.dueAt ?? targetDateStr,
      completedAt: now,
      completionHistory: history,
      updatedAt: now,
    };
    recordDiagEvent(
      'complete_oneoff',
      `id=${id} title=${task.title.slice(0, 30)} due=${updated.dueAt ?? ''}`
    );
  }

  await db.tasks.put(updated);
  return updated;
}

/**
 * Skip a specific scheduled occurrence of a recurring task on `dateStr` (YYYY-MM-DD).
 * Item A & C: Records `dateStr` in `skippedDates` so that date is suppressed without wiping out
 * prior or intermediate days. Does NOT advance master dueAt if a future occurrence was skipped.
 */
export async function skipTaskOccurrence(id: string, dateStr: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) {
    recordDiagEvent('skip_missing', `id=${id} date=${dateStr}`);
    return null;
  }
  if (!isFixedRecurring(task)) {
    return null;
  }

  const now = Date.now();
  const existingSkipped = task.skippedDates || [];
  const updatedSkipped = existingSkipped.includes(dateStr)
    ? existingSkipped
    : [...existingSkipped, dateStr];

  let updatedDueAt = task.dueAt;
  const masterDueDate = task.dueAt ? getDueDatePart(task.dueAt) : null;

  // Only advance task.dueAt if the date being skipped was the master task's current dueAt (or earlier)
  if (masterDueDate && dateStr <= masterDueDate) {
    const nextOccurrence = getSkipOccurrenceDate(
      { ...task, skippedDates: updatedSkipped },
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
    updatedAt: now,
  };

  recordDiagEvent(
    'skip_occurrence',
    `id=${id} title=${task.title.slice(0, 30)} skipped=${dateStr} dueAt=${updated.dueAt ?? ''}`
  );

  await db.tasks.put(updated);
  return updated;
}

/**
 * Remove a skipped occurrence for `dateStr` (YYYY-MM-DD), restoring it to active recurrence.
 */
export async function unskipTaskOccurrence(id: string, dateStr: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const skipped = (task.skippedDates || []).filter((d) => d !== dateStr);

  const updated: Task = {
    ...task,
    skippedDates: skipped,
    updatedAt: now,
  };

  recordDiagEvent(
    'unskip_occurrence',
    `id=${id} title=${task.title.slice(0, 30)} unskipped=${dateStr}`
  );

  await db.tasks.put(updated);
  return updated;
}

function mergeRemovedTimestamps(existing: number[] | undefined, removed: number[]): number[] | undefined {
  if (removed.length === 0) return existing;
  const merged = Array.from(new Set([...(existing || []), ...removed])).sort((a, b) => a - b);
  return merged.length > 0 ? merged : undefined;
}

export async function undoCompleteUndatedTask(id: string): Promise<Task | null> {
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
}

export async function uncompleteTask(id: string, dateStr?: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  let history = task.completionHistory || [];
  const removed: number[] = [];
  let targetDateStr: string | undefined = dateStr;

  if (isWindowPeriodic(task)) {
    targetDateStr = dateStr || formatDate(new Date(now));
    history = history.filter((ts) => {
      if (formatDate(new Date(ts)) === targetDateStr) {
        removed.push(ts);
        return false;
      }
      return true;
    });
  } else if (isFixedRecurring(task) && task.recurrence) {
    targetDateStr =
      dateStr || (task.dueAt ? getDueDatePart(task.dueAt) : formatDate(new Date(now)));
    history = history.filter((ts) => {
      if (formatDate(new Date(ts)) === targetDateStr) {
        removed.push(ts);
        return false;
      }
      return true;
    });
  } else if (dateStr) {
    history = history.filter((ts) => {
      if (formatDate(new Date(ts)) === dateStr) {
        removed.push(ts);
        return false;
      }
      return true;
    });
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
}

export async function logTaskCompletion(id: string, dateStr: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const ts = completionTimestampForDate(dateStr, now);
  const alreadyDone = isCompletedOnDate(task, dateStr);
  const history = alreadyDone
    ? [...(task.completionHistory || [])]
    : [...(task.completionHistory || []), ts].sort((a, b) => a - b);
  const removed = (task.removedCompletions || []).filter((r) => r !== ts);

  const updated: Task = {
    ...task,
    ...(isWindowPeriodic(task) ? { dueAt: null, startDate: null } : {}),
    completionHistory: history,
    ...(removed.length > 0 ? { removedCompletions: removed } : { removedCompletions: undefined }),
    updatedAt: now,
  };
  await db.tasks.put(updated);
  return updated;
}

export async function removeTaskCompletion(id: string, timestamp: number): Promise<Task | null> {
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
}

export async function stopRecurringTask(
  id: string
): Promise<{ task: Task; previousEndOnDate: string | null } | null> {
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
}

export async function setTaskEndOnDate(
  id: string,
  endOnDate: string | null
): Promise<Task | null> {
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
}

export async function softDeleteTask(id: string): Promise<void> {
  const task = await db.tasks.get(id);
  if (!task) return;

  const now = Date.now();
  await db.tasks.put({
    ...task,
    deletedAt: now,
    updatedAt: now,
  });
  recordDiagEvent('delete_task', `id=${id} title=${task.title.slice(0, 30)}`);
}

export async function restoreTask(id: string): Promise<void> {
  const task = await db.tasks.get(id);
  if (!task) return;

  const now = Date.now();
  await db.tasks.put({
    ...task,
    deletedAt: null,
    updatedAt: now,
  });
}

export async function saveList(list: TaskListInput): Promise<TaskList> {
  const now = Date.now();

  if (list.id === INBOX_LIST_ID) {
    return ensureInboxList();
  }

  if (list.id) {
    const existing = await db.lists.get(list.id);
    const full: TaskList = {
      ...(existing || {}),
      ...list,
      id: list.id,
      name: list.name,
      folderId: list.folderId !== undefined ? list.folderId : existing?.folderId ?? null,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: existing?.deletedAt ?? null,
    };
    await db.lists.put(full);
    return full;
  }

  const full: TaskList = {
    id: newId(),
    name: list.name,
    folderId: list.folderId ?? null,
    sortOrder: list.sortOrder ?? Date.now(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.lists.put(full);
  return full;
}

export async function softDeleteList(id: string): Promise<void> {
  if (id === INBOX_LIST_ID) return;

  const list = await db.lists.get(id);
  if (!list) return;

  const now = Date.now();
  await db.transaction('rw', db.lists, db.tasks, async () => {
    await db.lists.put({
      ...list,
      deletedAt: now,
      updatedAt: now,
    });

    const tasksInList = await db.tasks.where('listId').equals(id).toArray();
    for (const task of tasksInList) {
      if (task.deletedAt) continue;
      await db.tasks.put({
        ...task,
        listId: INBOX_LIST_ID,
        updatedAt: now,
      });
    }
  });
}

export async function saveFolder(folder: FolderInput): Promise<Folder> {
  const now = Date.now();

  if (folder.id) {
    const existing = await db.folders.get(folder.id);
    const full: Folder = {
      ...(existing || {}),
      ...folder,
      id: folder.id,
      name: folder.name,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: existing?.deletedAt ?? null,
    };
    await db.folders.put(full);
    return full;
  }

  const full: Folder = {
    id: newId(),
    name: folder.name,
    sortOrder: folder.sortOrder ?? Date.now(),
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.folders.put(full);
  return full;
}

/**
 * Soft-delete a folder. Lists in it become unfoldered (folderId = null).
 */
export async function softDeleteFolder(id: string): Promise<void> {
  const folder = await db.folders.get(id);
  if (!folder) return;

  const now = Date.now();
  await db.transaction('rw', db.folders, db.lists, async () => {
    await db.folders.put({
      ...folder,
      deletedAt: now,
      updatedAt: now,
    });

    const listsInFolder = await db.lists.where('folderId').equals(id).toArray();
    for (const list of listsInFolder) {
      if (list.deletedAt) continue;
      await db.lists.put({
        ...list,
        folderId: null,
        updatedAt: now,
      });
    }
  });
}

function hasGoogleSyncConfigured(): boolean {
  if (typeof localStorage === 'undefined') return false;
  try {
    return Boolean(getStoredClientId());
  } catch {
    return false;
  }
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
    .slice(-365);
  const keeper: Task = {
    ...primary,
    completionHistory: mergedHistory,
    updatedAt: now,
  };
  return { keeper, dropped: rest };
}

/**
 * Merges duplicate lists/tasks left behind by earlier TickTick imports and purges
 * soft-delete tombstones when Google Drive sync is not configured.
 */
export async function repairAndDeduplicateDatabase(): Promise<{
  mergedLists: number;
  deduplicatedTasks: number;
  purgedTombstones: number;
}> {
  const syncConfigured = hasGoogleSyncConfigured();
  const now = Date.now();

  const result = await db.transaction(
    'rw',
    [db.tasks, db.lists, db.folders],
    async () => {
      const [allLists, allTasks, allFolders] = await Promise.all([
        db.lists.toArray(),
        db.tasks.toArray(),
        db.folders.toArray(),
      ]);

      // 1. Merge duplicate active lists sharing the same case-insensitive name.
      const listById = new Map(allLists.map((l) => [l.id, { ...l }]));
      const listIdRemap = new Map<string, string>();
      const listsByName = new Map<string, typeof allLists>();
      for (const l of allLists) {
        if (l.deletedAt) continue;
        const key = l.name.trim().toLowerCase();
        const bucket = listsByName.get(key) ?? [];
        bucket.push(l);
        listsByName.set(key, bucket);
      }

      let mergedLists = 0;
      const dirtyListIds = new Set<string>();
      for (const bucket of listsByName.values()) {
        if (bucket.length <= 1) continue;
        bucket.sort((a, b) => {
          if (a.id === 'inbox') return -1;
          if (b.id === 'inbox') return 1;
          return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
        });
        const keep = bucket[0];
        for (let i = 1; i < bucket.length; i++) {
          const dup = bucket[i];
          listIdRemap.set(dup.id, keep.id);
          const target = listById.get(dup.id);
          if (target) {
            target.deletedAt = now;
            target.updatedAt = now;
            dirtyListIds.add(dup.id);
            mergedLists++;
          }
        }
      }

      const taskMap = new Map(allTasks.map((t) => [t.id, { ...t }]));
      const dirtyTaskIds = new Set<string>();
      for (const task of taskMap.values()) {
        const mappedListId = listIdRemap.get(task.listId);
        if (mappedListId && mappedListId !== task.listId) {
          task.listId = mappedListId;
          task.updatedAt = now;
          dirtyTaskIds.add(task.id);
        }
      }

      // 2a. Deduplicate active tasks sharing (listId, titleLower, createdAt).
      const byExactKey = new Map<string, Task[]>();
      for (const task of taskMap.values()) {
        if (task.deletedAt) continue;
        const key = `${task.listId}\0${task.title.trim().toLowerCase()}\0${task.createdAt}`;
        const bucket = byExactKey.get(key) ?? [];
        bucket.push(task);
        byExactKey.set(key, bucket);
      }

      let deduplicatedTasks = 0;
      for (const bucket of byExactKey.values()) {
        if (bucket.length <= 1) continue;
        const { keeper, dropped } = mergeTaskGroup(bucket, now);
        taskMap.set(keeper.id, keeper);
        dirtyTaskIds.add(keeper.id);
        for (const dup of dropped) {
          taskMap.set(dup.id, { ...dup, deletedAt: now, updatedAt: now });
          dirtyTaskIds.add(dup.id);
          deduplicatedTasks++;
        }
      }

      // 2b. Collapse duplicate open tasks sharing (listId, titleLower) when any is recurring.
      const openByTitleKey = new Map<string, Task[]>();
      for (const task of taskMap.values()) {
        if (task.deletedAt || isCompleted(task)) continue;
        const key = `${task.listId}\0${task.title.trim().toLowerCase()}`;
        const bucket = openByTitleKey.get(key) ?? [];
        bucket.push(task);
        openByTitleKey.set(key, bucket);
      }

      for (const bucket of openByTitleKey.values()) {
        if (bucket.length <= 1 || !bucket.some(hasActiveRecurrence)) continue;
        const { keeper, dropped } = mergeTaskGroup(bucket, now);
        taskMap.set(keeper.id, keeper);
        dirtyTaskIds.add(keeper.id);
        for (const dup of dropped) {
          taskMap.set(dup.id, { ...dup, deletedAt: now, updatedAt: now });
          dirtyTaskIds.add(dup.id);
          deduplicatedTasks++;
        }
      }

      let purgedTombstones = 0;
      const hasAnyActiveTask = Array.from(taskMap.values()).some((t) => !t.deletedAt);
      if (!syncConfigured && hasAnyActiveTask) {
        const deletedTaskIds = Array.from(taskMap.values())
          .filter((t) => !!t.deletedAt)
          .map((t) => t.id);
        const deletedListIds = Array.from(listById.values())
          .filter((l) => !!l.deletedAt)
          .map((l) => l.id);
        const deletedFolderIds = allFolders.filter((f) => !!f.deletedAt).map((f) => f.id);

        const deletedTaskIdSet = new Set(deletedTaskIds);
        const tasksToPut = Array.from(dirtyTaskIds)
          .filter((id) => !deletedTaskIdSet.has(id))
          .map((id) => taskMap.get(id)!)
          .filter(Boolean);
        if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
        if (deletedTaskIds.length) await db.tasks.bulkDelete(deletedTaskIds);
        if (deletedListIds.length) await db.lists.bulkDelete(deletedListIds);
        if (deletedFolderIds.length) await db.folders.bulkDelete(deletedFolderIds);

        purgedTombstones =
          deletedTaskIds.length +
          deletedListIds.length +
          deletedFolderIds.length;
      } else {
        const tasksToPut = Array.from(dirtyTaskIds)
          .map((id) => taskMap.get(id)!)
          .filter(Boolean);
        const listsToPut = Array.from(dirtyListIds)
          .map((id) => listById.get(id)!)
          .filter(Boolean);
        if (tasksToPut.length) await db.tasks.bulkPut(tasksToPut);
        if (listsToPut.length) await db.lists.bulkPut(listsToPut);
      }

      return { mergedLists, deduplicatedTasks, purgedTombstones };
    },
  );

  recordDiagEvent(
    'db_repair',
    `mergedLists=${result.mergedLists} deduplicatedTasks=${result.deduplicatedTasks} purgedTombstones=${result.purgedTombstones} sync=${syncConfigured}`,
  );
  return result;
}
