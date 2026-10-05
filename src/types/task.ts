export type RecurrenceType = 'after_completion' | 'fixed_interval';

export type IntervalUnit = 'days' | 'weeks' | 'months';

export type TaskPriority = 'high' | 'medium' | 'low' | 'none';

export type TaskUrgency = 'overdue' | 'due_today' | 'upcoming' | 'later' | 'none';

/** Built-in Inbox list id — always present, never deleted. */
export const INBOX_LIST_ID = 'inbox';

export const PRIORITY_ORDER: Record<TaskPriority, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

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
  /**
   * Optional due instant.
   * - Date-only: `YYYY-MM-DD` (all-day; overdue after that calendar day ends)
   * - Date+time: `YYYY-MM-DDTHH:mm` local (no timezone suffix)
   */
  dueAt?: string | null;
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

/** Smart-list / navigation views (Phase 1). */
export type SmartView =
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'inbox'
  | 'all'
  | 'completed'
  | `list:${string}`;
