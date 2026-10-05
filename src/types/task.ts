export type RecurrenceType = 'after_completion' | 'fixed_interval';

export type IntervalUnit = 'days' | 'weeks' | 'months';

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
  intervalUnit: IntervalUnit;
  /** Weekly: which weekdays fire (e.g. Mon–Fri). Empty/undefined = same weekday as due. */
  weekdays?: Weekday[];
  /** Monthly: day of month 1–31 (clamped to month length). Undefined = same DOM as due. */
  monthDay?: number;
  /** Stop generating occurrences after this date (YYYY-MM-DD). */
  endOnDate?: string | null;
  /** Stop after this many completions (uses completionHistory length). */
  endAfterCount?: number | null;
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

/** Groups lists in the sidebar (Phase 2). */
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

export type FolderInput = Omit<Folder, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

/** Smart-list / navigation views. */
export type SmartView =
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'inbox'
  | 'all'
  | 'completed'
  | `list:${string}`;

/** App navigation including calendar (Phase 3). */
export type AppView = SmartView | 'calendar-month' | 'calendar-agenda';
