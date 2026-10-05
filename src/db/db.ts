import Dexie, { type Table } from 'dexie';
import type { Task, TaskInput, TaskList, TaskListInput } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { calculateNextDueDate, formatDate, isRecurring } from '../domain/recurrence';

export class TempoDatabase extends Dexie {
  tasks!: Table<Task, string>;
  lists!: Table<TaskList, string>;

  constructor() {
    super('TempoDatabase');

    // v1: original PeriodicTask-only schema (superseded; no migration)
    this.version(1).stores({
      tasks: 'id, dueDate, updatedAt, deletedAt',
    });

    // v2: Task + optional recurrence + TaskList (Phase 0)
    this.version(2)
      .stores({
        tasks: 'id, listId, dueAt, updatedAt, deletedAt, completedAt',
        lists: 'id, sortOrder, updatedAt, deletedAt',
      })
      .upgrade(async (tx) => {
        // App not in production use — drop legacy PeriodicTask rows
        await tx.table('tasks').clear();
      });
  }
}

export const db = new TempoDatabase();

/** Ensure the built-in Inbox list exists. */
export async function ensureInboxList(): Promise<TaskList> {
  const existing = await db.lists.get(INBOX_LIST_ID);
  if (existing && !existing.deletedAt) return existing;

  const now = Date.now();
  const inbox: TaskList = {
    id: INBOX_LIST_ID,
    name: 'Inbox',
    sortOrder: 0,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.lists.put(inbox);
  return inbox;
}

/**
 * Seed Inbox + sample tasks if database is empty.
 */
export async function seedInitialTasksIfEmpty(): Promise<void> {
  await ensureInboxList();

  const count = await db.tasks.count();
  if (count > 0) return;

  const now = Date.now();
  const today = formatDate(new Date());

  // Sample user list
  const homeList: TaskList = {
    id: 'demo-list-home',
    name: 'Home',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.lists.put(homeList);

  const sampleTasks: Task[] = [
    {
      id: 'demo-1',
      title: 'Water indoor plants',
      notes: 'Check soil moisture for the ferns and monstera',
      listId: homeList.id,
      dueAt: today,
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        intervalUnit: 'days',
      },
      createdAt: now - 86400000 * 3,
      updatedAt: now,
      completionHistory: [now - 86400000 * 3],
      tags: ['Plants'],
    },
    {
      id: 'demo-2',
      title: 'Back up laptop to external drive',
      notes: 'Run Time Machine / backup script',
      listId: INBOX_LIST_ID,
      dueAt: today,
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
      },
      createdAt: now - 86400000 * 7,
      updatedAt: now,
      completionHistory: [now - 86400000 * 7],
      tags: ['Tech'],
    },
    {
      id: 'demo-3',
      title: 'Buy groceries for the week',
      notes: 'Milk, eggs, greens',
      listId: INBOX_LIST_ID,
      dueAt: today,
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Errands'],
    },
    {
      id: 'demo-4',
      title: 'Deep clean coffee machine',
      notes: 'Run vinegar or descaler cycle',
      listId: homeList.id,
      dueAt: formatDate(new Date(Date.now() - 86400000 * 1)),
      recurrence: {
        type: 'after_completion',
        intervalValue: 2,
        intervalUnit: 'weeks',
      },
      createdAt: now - 86400000 * 15,
      updatedAt: now,
      completionHistory: [now - 86400000 * 15],
      tags: ['Home'],
    },
    {
      id: 'demo-5',
      title: 'Call dentist to schedule checkup',
      listId: INBOX_LIST_ID,
      dueAt: null,
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Health'],
    },
  ];

  await db.tasks.bulkPut(sampleTasks);
}

/**
 * Add or update a task
 */
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
 * - Recurring: records completion, rolls dueAt forward, clears completedAt.
 * - One-off: records completion and sets completedAt.
 */
export async function completeTask(id: string): Promise<Task | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const history = [...(task.completionHistory || []), now];

  let updated: Task;
  if (isRecurring(task) && task.recurrence) {
    const nextDue = calculateNextDueDate(
      { recurrence: task.recurrence, dueAt: task.dueAt },
      new Date(now)
    );
    updated = {
      ...task,
      dueAt: nextDue,
      completedAt: null,
      completionHistory: history,
      updatedAt: now,
    };
  } else {
    updated = {
      ...task,
      completedAt: now,
      completionHistory: history,
      updatedAt: now,
    };
  }

  await db.tasks.put(updated);
  return updated;
}

/**
 * Un-complete a one-off task (clear completedAt).
 */
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

/**
 * Soft delete a task
 */
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

/**
 * Restore a soft-deleted task
 */
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

/**
 * Add or update a list (Inbox id is reserved / upserted via ensureInboxList).
 */
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

/**
 * Soft-delete a user list. Tasks in that list move to Inbox.
 * Inbox cannot be deleted.
 */
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
