export type RecurrenceType = 'after_completion' | 'fixed_interval';

export type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';

/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

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

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export interface RecurrenceRule {
  type: RecurrenceType;
  intervalValue: number;
  /** Optional upper bound (>= intervalValue) defining an approximate min–max window in Tasks. */
  maxIntervalValue?: number | null;
  intervalUnit: IntervalUnit;
  weekdays?: Weekday[];
  monthDay?: number;
  endOnDate?: string | null;
  endAfterCount?: number | null;
}

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface Task {
  id: string;
  title: string;
  notes?: string;
  listId: string;
  dueAt?: string | null;
  /** Inception/start date (YYYY-MM-DD) of the recurring schedule. Preserved across occurrence completions and skips. */
  startDate?: string | null;
  /** @deprecated Priority UI has been removed. Field retained for sync schema compatibility. */
  priority?: TaskPriority;
  /** @deprecated Pinned UI has been removed. Field retained for sync schema compatibility. */
  pinned?: boolean;
  /** @deprecated Tags UI has been removed. Field retained for sync schema compatibility. */
  tags?: string[];
  /** @deprecated Subtasks UI has been removed. Field retained for sync schema compatibility. */
  subtasks?: Subtask[];
  recurrence?: RecurrenceRule | null;
  completedAt?: number | null;
  completionHistory: number[];
  /** Completion timestamps explicitly deleted by the user (CRDT tombstones subtracted during merge). */
  removedCompletions?: number[];
  /** Local calendar dates (YYYY-MM-DD) where scheduled occurrences were skipped. */
  skippedDates?: string[];
  sortOrder?: number;
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

export interface Folder {
  id: string;
  name: string;
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
  folders?: Folder[];
  savedFilters?: unknown[];
}

export type TaskInput = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'completionHistory' | 'completedAt' | 'listId'
> & {
  id?: string;
  listId?: string;
  completedAt?: number | null;
  completionHistory?: number[];
};

export type TaskListInput = Omit<TaskList, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type FolderInput = Omit<Folder, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};
