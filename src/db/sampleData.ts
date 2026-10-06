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
 * Not seeded automatically (fresh installs start empty, like TickTick);
 * loaded on demand from Settings → "Load sample tasks".
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
      dueAt: formatDate(new Date(now - 86400000 * 1)),
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

  return { folders: [personalFolder], lists: [homeList, workList], tasks: sampleTasks };
}
