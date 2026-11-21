import type { Folder, Task, TaskList } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { formatDate } from '../domain/recurrence';

/** Prefix shared by every sample task / list / folder id. */
export const SAMPLE_ID_PREFIX = 'demo-';

export function isSampleId(id: string): boolean {
  return id.startsWith(SAMPLE_ID_PREFIX);
}

/**
 * Demo folder / lists / tasks, dated relative to `nowDate`.
 * Loaded on demand from Settings → "Load sample tasks".
 */
export function buildSampleData(nowDate: Date = new Date()): {
  folders: Folder[];
  lists: TaskList[];
  tasks: Task[];
} {
  const now = nowDate.getTime();
  const today = formatDate(nowDate);
  const tomorrow = formatDate(new Date(now + 86400000));
  const inThree = formatDate(new Date(now + 86400000 * 3));

  const personalFolder: Folder = {
    id: 'demo-folder-personal',
    name: 'Personal',
    sortOrder: 1,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
  };

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

  const sampleTasks: Task[] = [
    {
      id: 'demo-1',
      title: 'Water indoor plants',
      notes: 'Check soil moisture for the ferns and monstera',
      listId: homeList.id,
      dueAt: null,
      recurrence: {
        type: 'after_completion',
        intervalValue: 3,
        maxIntervalValue: 5,
        intervalUnit: 'days',
      },
      createdAt: now - 86400000 * 10,
      updatedAt: now,
      completionHistory: [now - 86400000 * 4],
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
    },
    {
      id: 'demo-4',
      title: 'Deep clean coffee machine',
      notes: 'Run vinegar or descaler cycle',
      listId: homeList.id,
      dueAt: null,
      recurrence: {
        type: 'after_completion',
        intervalValue: 2,
        maxIntervalValue: 3,
        intervalUnit: 'weeks',
      },
      createdAt: now - 86400000 * 30,
      updatedAt: now,
      completionHistory: [now - 86400000 * 24],
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
    },
    {
      id: 'demo-6',
      title: 'Team standup notes',
      notes: 'Prep talking points',
      listId: workList.id,
      dueAt: tomorrow,
      recurrence: null,
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
    },
    {
      id: 'demo-7',
      title: 'Pay rent',
      listId: INBOX_LIST_ID,
      dueAt: inThree,
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'months',
        monthDay: 1,
      },
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
    },
    {
      id: 'demo-8',
      title: 'Morning stretch',
      listId: homeList.id,
      dueAt: today,
      recurrence: {
        type: 'fixed_interval',
        intervalValue: 1,
        intervalUnit: 'weeks',
        weekdays: [1, 2, 3, 4, 5],
      },
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
    },
  ];

  return { folders: [personalFolder], lists: [homeList, workList], tasks: sampleTasks };
}
