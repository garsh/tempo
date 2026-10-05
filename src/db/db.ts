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
import { calculateNextDueDate, formatDate, isRecurring } from '../domain/recurrence';

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

export async function seedInitialTasksIfEmpty(): Promise<void> {
  await ensureInboxList();

  const count = await db.tasks.count();
  if (count > 0) return;

  const now = Date.now();
  const today = formatDate(new Date());
  const tomorrow = formatDate(new Date(Date.now() + 86400000));
  const inThree = formatDate(new Date(Date.now() + 86400000 * 3));

  const personalFolder: Folder = {
    id: 'demo-folder-personal',
    name: 'Personal',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.folders.put(personalFolder);

  const homeList: TaskList = {
    id: 'demo-list-home',
    name: 'Home',
    folderId: personalFolder.id,
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  const workList: TaskList = {
    id: 'demo-list-work',
    name: 'Work',
    folderId: null,
    sortOrder: 2,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };
  await db.lists.bulkPut([homeList, workList]);

  const sampleTasks: Task[] = [
    {
      id: 'demo-1',
      title: 'Water indoor plants',
      notes: 'Check soil moisture for the ferns and monstera',
      listId: homeList.id,
      dueAt: `${today}T09:00`,
      priority: 'medium',
      pinned: true,
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        intervalUnit: 'days',
      },
      createdAt: now - 86400000 * 3,
      updatedAt: now,
      completionHistory: [now - 86400000 * 3],
      tags: ['Plants'],
      subtasks: [
        { id: 'st-1a', title: 'Check fern', completed: false },
        { id: 'st-1b', title: 'Check monstera', completed: true },
      ],
    },
    {
      id: 'demo-2',
      title: 'Back up laptop to external drive',
      notes: 'Run Time Machine / backup script',
      listId: INBOX_LIST_ID,
      dueAt: today,
      priority: 'high',
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
      dueAt: `${today}T17:30`,
      priority: 'high',
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Errands'],
      subtasks: [
        { id: 'st-3a', title: 'Milk', completed: false },
        { id: 'st-3b', title: 'Eggs', completed: false },
        { id: 'st-3c', title: 'Greens', completed: false },
      ],
    },
    {
      id: 'demo-4',
      title: 'Deep clean coffee machine',
      notes: 'Run vinegar or descaler cycle',
      listId: homeList.id,
      dueAt: formatDate(new Date(Date.now() - 86400000 * 1)),
      priority: 'low',
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
      priority: 'medium',
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Health'],
    },
    {
      id: 'demo-6',
      title: 'Team standup notes',
      notes: 'Prep talking points',
      listId: workList.id,
      dueAt: `${tomorrow}T10:00`,
      priority: 'none',
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Work'],
    },
    {
      id: 'demo-7',
      title: 'Pay rent',
      listId: INBOX_LIST_ID,
      dueAt: inThree,
      priority: 'high',
      pinned: true,
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 1,
      },
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Finance'],
    },
    {
      id: 'demo-8',
      title: 'Morning stretch',
      listId: homeList.id,
      dueAt: today,
      priority: 'low',
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 2, 3, 4, 5],
      },
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Health'],
    },
  ];

  await db.tasks.bulkPut(sampleTasks);
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
