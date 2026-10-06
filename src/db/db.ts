import Dexie, { type Table } from 'dexie';
import type {
  Folder,
  FolderInput,
  SavedFilter,
  SavedFilterInput,
  Subtask,
  Task,
  TaskInput,
  TaskList,
  TaskListInput,
} from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { calculateNextDueDate, isRecurring } from '../domain/recurrence';
import { planBatch, type BatchOp } from '../domain/batch';
import { clearFiredForTask } from '../domain/notifications';
import { buildSampleData, isSampleId } from './sampleData';

export { buildSampleData, isSampleId, SAMPLE_ID_PREFIX } from './sampleData';

export class TempoDatabase extends Dexie {
  tasks!: Table<Task, string>;
  lists!: Table<TaskList, string>;
  folders!: Table<Folder, string>;
  savedFilters!: Table<SavedFilter, string>;

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
  return removed;
}

export async function saveTask(task: TaskInput): Promise<Task> {
  const now = Date.now();
  let fullTask: Task;

  if (task.id) {
    const existing = await db.tasks.get(task.id);
    fullTask = {
      ...(existing || {}),
      ...task,
      id: task.id,
      listId: task.listId || existing?.listId || INBOX_LIST_ID,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      completionHistory: existing?.completionHistory || [],
      completedAt: task.completedAt !== undefined ? task.completedAt : existing?.completedAt ?? null,
      recurrence: task.recurrence === undefined ? existing?.recurrence ?? null : task.recurrence,
      subtasks: task.subtasks !== undefined ? task.subtasks : existing?.subtasks,
    };
  } else {
    fullTask = {
      title: task.title,
      notes: task.notes,
      listId: task.listId || INBOX_LIST_ID,
      dueAt: task.dueAt ?? null,
      priority: task.priority,
      pinned: task.pinned,
      tags: task.tags,
      subtasks: task.subtasks,
      recurrence: task.recurrence ?? null,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      completedAt: null,
      deletedAt: null,
    };
  }

  await db.tasks.put(fullTask);
  return fullTask;
}

/**
 * Complete a task.
 * - Recurring: rolls dueAt forward (or finalizes if end rule hit); resets subtasks.
 * - One-off: sets completedAt.
 */
export async function completeTask(id: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const history = [...(task.completionHistory || []), now];

  let updated: Task;
  if (isRecurring(task) && task.recurrence) {
    const nextDue = calculateNextDueDate(
      {
        recurrence: task.recurrence,
        dueAt: task.dueAt,
        completionHistory: task.completionHistory,
      },
      new Date(now)
    );

    if (nextDue === null) {
      // Recurrence ended — treat as finished
      updated = {
        ...task,
        recurrence: null,
        completedAt: now,
        completionHistory: history,
        updatedAt: now,
        subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: true })),
      };
    } else {
      updated = {
        ...task,
        dueAt: nextDue,
        completedAt: null,
        completionHistory: history,
        updatedAt: now,
        // Reset check items for the next cycle
        subtasks: (task.subtasks || []).map((s) => ({ ...s, completed: false })),
      };
    }
  } else {
    updated = {
      ...task,
      completedAt: now,
      completionHistory: history,
      updatedAt: now,
    };
  }

    clearFiredForTask(id);
  await db.tasks.put(updated);
  return updated;
}

export async function uncompleteTask(id: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const updated: Task = {
    ...task,
    completedAt: null,
    updatedAt: now,
  };
  await db.tasks.put(updated);
  return updated;
}

export async function togglePinTask(id: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;
  const now = Date.now();
  const updated: Task = {
    ...task,
    pinned: !task.pinned,
    updatedAt: now,
  };
  await db.tasks.put(updated);
  return updated;
}

export async function toggleSubtask(
  taskId: string,
  subtaskId: string
): Promise<Task | null> {
  const task = await db.tasks.get(taskId);
  if (!task) return null;
  const now = Date.now();
  const subtasks = (task.subtasks || []).map((s) =>
    s.id === subtaskId ? { ...s, completed: !s.completed } : s
  );
  const updated: Task = { ...task, subtasks, updatedAt: now };
  await db.tasks.put(updated);
  return updated;
}

export async function setTaskSubtasks(
  taskId: string,
  subtasks: Subtask[]
): Promise<Task | null> {
  const task = await db.tasks.get(taskId);
  if (!task) return null;
  const now = Date.now();
  const updated: Task = { ...task, subtasks, updatedAt: now };
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
    id: crypto.randomUUID(),
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
    id: crypto.randomUUID(),
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

export async function saveSavedFilter(filter: SavedFilterInput): Promise<SavedFilter> {
  const now = Date.now();
  if (filter.id) {
    const existing = await db.savedFilters.get(filter.id);
    const full: SavedFilter = {
      ...(existing || {}),
      ...filter,
      id: filter.id,
      name: filter.name,
      match: filter.match,
      criteria: filter.criteria,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      deletedAt: existing?.deletedAt ?? null,
    };
    await db.savedFilters.put(full);
    return full;
  }

  const full: SavedFilter = {
    id: crypto.randomUUID(),
    name: filter.name,
    match: filter.match,
    criteria: filter.criteria,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.savedFilters.put(full);
  return full;
}

export async function softDeleteSavedFilter(id: string): Promise<void> {
  const filter = await db.savedFilters.get(id);
  if (!filter) return;
  const now = Date.now();
  await db.savedFilters.put({
    ...filter,
    deletedAt: now,
    updatedAt: now,
  });
}

/** Select-mode batch write (move / set date / delete) in one transaction. Returns count changed. */
export async function applyBatchOp(ids: string[], op: BatchOp): Promise<number> {
  return db.transaction('rw', db.tasks, async () => {
    const tasks = (await db.tasks.bulkGet(ids)).filter((t): t is Task => !!t);
    const updated = planBatch(tasks, ids, op);
    if (updated.length) await db.tasks.bulkPut(updated);
    return updated.length;
  });
}

/** Select-mode batch complete; recurring tasks advance to their next occurrence. */
export async function completeTasks(ids: string[]): Promise<void> {
  for (const id of ids) await completeTask(id);
}
