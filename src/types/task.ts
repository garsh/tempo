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
  priority?: TaskPriority;
  pinned?: boolean;
  tags?: string[];
  subtasks?: Subtask[];
  recurrence?: RecurrenceRule | null;
  completedAt?: number | null;
  completionHistory: number[];
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

/** Due bucket used by saved filters (Phase 4). */
export type DueFilterBucket = 'overdue' | 'today' | 'tomorrow' | 'next7' | 'later' | 'none';

/**
 * Criteria for a saved filter. Empty arrays / undefined mean "any".
 * Combined with `match` (AND = every set criterion must match; OR = any set criterion).
 */
export interface FilterCriteria {
  tags?: string[];
  priorities?: TaskPriority[];
  dueBuckets?: DueFilterBucket[];
  listIds?: string[];
  /** Free-text substring (title / notes / tags). */
  query?: string;
  /** When true, only pinned tasks. */
  pinnedOnly?: boolean;
}

/** User-saved smart filter (Phase 4). */
export interface SavedFilter {
  id: string;
  name: string;
  match: 'and' | 'or';
  criteria: FilterCriteria;
  createdAt: number;
  updatedAt: number;
  deletedAt?: number | null;
}

export type SavedFilterInput = Omit<SavedFilter, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export interface SyncData {
  version: number;
  exportedAt: number;
  tasks: Task[];
  lists: TaskList[];
  folders?: Folder[];
  savedFilters?: SavedFilter[];
}

export type TaskInput = Omit<
  Task,
  'id' | 'createdAt' | 'updatedAt' | 'completionHistory' | 'completedAt'
> & {
  id?: string;
  completedAt?: number | null;
};

export type TaskListInput = Omit<TaskList, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type FolderInput = Omit<Folder, 'id' | 'createdAt' | 'updatedAt'> & {
  id?: string;
};

export type SmartView =
  | 'today'
  | 'tomorrow'
  | 'next7'
  | 'inbox'
  | 'all'
  | 'completed'
  | `list:${string}`;

export type AppView =
  | SmartView
  | 'calendar-month'
  | 'calendar-agenda'
  | 'board-status'
  | 'board-list'
  | `filter:${string}`;
