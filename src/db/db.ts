import Dexie, { type Table } from 'dexie';
import type { PeriodicTask } from '../types/task';
import { calculateNextDueDate, formatDate } from '../domain/recurrence';

export class TempoDatabase extends Dexie {
  tasks!: Table<PeriodicTask, string>;

  constructor() {
    super('TempoDatabase');
    this.version(1).stores({
      tasks: 'id, dueDate, updatedAt, deletedAt',
    });
  }
}

export const db = new TempoDatabase();

/**
 * Seed initial sample routines if database is empty
 */
export async function seedInitialTasksIfEmpty(): Promise<void> {
  const count = await db.tasks.count();
  if (count > 0) return;

  const now = Date.now();
  const today = formatDate(new Date());

  const sampleTasks: PeriodicTask[] = [
    {
      id: 'demo-1',
      title: 'Water indoor plants',
      notes: 'Check soil moisture for the ferns and monstera',
      recurrenceType: 'after_completion',
      intervalValue: 3,
      intervalUnit: 'days',
      dueDate: today,
      createdAt: now - 86400000 * 3,
      updatedAt: now,
      completionHistory: [now - 86400000 * 3],
      tags: ['Home', 'Plants'],
    },
    {
      id: 'demo-2',
      title: 'Back up laptop to external drive',
      notes: 'Run Time Machine / backup script',
      recurrenceType: 'fixed_interval',
      intervalValue: 1,
      intervalUnit: 'weeks',
      dueDate: today,
      createdAt: now - 86400000 * 7,
      updatedAt: now,
      completionHistory: [now - 86400000 * 7],
      tags: ['Tech'],
    },
    {
      id: 'demo-3',
      title: 'Replace HVAC air filter',
      notes: '20x25x1 MERV 11 filter',
      recurrenceType: 'after_completion',
      intervalValue: 3,
      intervalUnit: 'months',
      dueDate: formatDate(new Date(Date.now() + 86400000 * 14)), // in 2 weeks
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
      tags: ['Maintenance'],
    },
    {
      id: 'demo-4',
      title: 'Deep clean coffee machine',
      notes: 'Run vinegar or descaler cycle',
      recurrenceType: 'after_completion',
      intervalValue: 2,
      intervalUnit: 'weeks',
      dueDate: formatDate(new Date(Date.now() - 86400000 * 1)), // Overdue by 1 day
      createdAt: now - 86400000 * 15,
      updatedAt: now,
      completionHistory: [now - 86400000 * 15],
      tags: ['Home'],
    },
  ];

  await db.tasks.bulkPut(sampleTasks);
}

/**
 * Add or update a task
 */
export async function saveTask(task: Omit<PeriodicTask, 'id' | 'createdAt' | 'updatedAt' | 'completionHistory'> & { id?: string }): Promise<PeriodicTask> {
  const now = Date.now();
  let fullTask: PeriodicTask;

  if (task.id) {
    const existing = await db.tasks.get(task.id);
    fullTask = {
      ...(existing || {}),
      ...task,
      id: task.id,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      completionHistory: existing?.completionHistory || [],
    } as PeriodicTask;
  } else {
    fullTask = {
      ...task,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
      completionHistory: [],
    };
  }

  await db.tasks.put(fullTask);
  return fullTask;
}

/**
 * Complete a task: records timestamp in completion history and rolls over due date
 */
export async function completeTask(id: string): Promise<PeriodicTask | null> {
  const task = await db.tasks.get(id);
  if (!task) return null;

  const now = Date.now();
  const nextDue = calculateNextDueDate(task, new Date(now));

  const updated: PeriodicTask = {
    ...task,
    dueDate: nextDue,
    completionHistory: [...(task.completionHistory || []), now],
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
