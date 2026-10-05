export type RecurrenceType = 'after_completion' | 'fixed_interval';

export type IntervalUnit = 'days' | 'weeks' | 'months';

export type TaskPriority = 'high' | 'medium' | 'low' | 'none';

export type TaskUrgency = 'overdue' | 'due_today' | 'upcoming' | 'later' | 'none';

/** Built-in Inbox list id — always present, never deleted. */
export const INBOX_LIST_ID = 'inbox';

export interface RecurrenceRule {
  type: RecurrenceType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  // Phase 2+: weekdays, monthly-by-date, end on date/count
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string; // UUID v4
  title: string;
  notes?: string;
  listId: string; // Inbox or user list
  dueAt?: string | null; // ISO date YYYY-MM-DD; optional
  priority?: TaskPriority;
  pinned?: boolean;
  tags?: string[];
  subtasks?: Subtask[];
  recurrence?: RecurrenceRule | null; // optional — one-off when null/undefined
  completedAt?: number | null;
  completionHistory: number[]; // epoch ms
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface TaskList {
  id: string;
  name: string;
  folderId?: string | null;
  sortOrder?: number;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export interface SyncData {
  version: number;
  exportedAt: number;
  tasks: Task[];
  lists: TaskList[];
}

/** Fields accepted when creating/updating a task via the UI. */
export type TaskInput = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'completionHistory' | 'completedAt'
> & {
  id?: string;
  completedAt?: number | null;
};

/** Fields accepted when creating/updating a list via the UI. */
export type TaskListInput = Omit<
  TaskList,
  'id' | 'createdAt' | 'updatedAt'
> & {
  id?: string;
};
