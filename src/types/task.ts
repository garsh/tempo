export type RecurrenceType = 'after_completion' | 'fixed_interval' | 'annual_window';

export type IntervalUnit = 'days' | 'weeks' | 'months' | 'years';

/** 0 = Sunday … 6 = Saturday (matches Date#getDay). */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type TaskPriority = 'high' | 'medium' | 'low' | 'none';

export type TaskUrgency = 'overdue' | 'due_today' | 'upcoming' | 'later' | 'none';

/** Built-in Inbox list id — always present, never deleted. */
export const INBOX_LIST_ID = 'inbox';

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  0: 'Sun',
  1: 'Mon',
  2: 'Tue',
  3: 'Wed',
  4: 'Thu',
  5: 'Fri',
  6: 'Sat',
};

export interface AnnualWindow {
  /** 1..12 */
  startMonth: number;
  /** 1..31 (clamped to actual month length for a given year) */
  startDay: number;
  /** 1..12 */
  endMonth: number;
  /** 1..31 (clamped to actual month length; 29 for Feb handles leap years) */
  endDay: number;
}

export interface RecurrenceRule {
  type: RecurrenceType;
  intervalValue: number;
  /** Optional upper bound (>= intervalValue) defining an approximate min–max window in Tasks. */
  maxIntervalValue?: number | null;
  intervalUnit: IntervalUnit;
  /** Recurring calendar date windows (MM-DD to MM-DD) when type === 'annual_window'. */
  annualWindows?: AnnualWindow[];
  weekdays?: Weekday[];
  monthDay?: number;
  endOnDate?: string | null;
  endAfterCount?: number | null;
}

export interface RecurrenceScheduleSegment {
  /** Inclusive start date (YYYY-MM-DD) of this historical schedule segment. */
  startDate: string;
  /** Inclusive end date (YYYY-MM-DD) of this historical schedule segment. */
  endDate: string;
  /** The recurrence rule that was active during [startDate, endDate]. */
  recurrence: RecurrenceRule;
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
  /** Skipped dates explicitly restored/unskipped (CRDT tombstones subtracted during merge). */
  removedSkippedDates?: string[];
  /** Per-date LWW timestamps (epoch ms) for skipped/unskipped state changes on YYYY-MM-DD keys. */
  skippedDateUpdatedAt?: Record<string, number>;
  /** Single-occurrence date overrides: original scheduled date (YYYY-MM-DD) -> target date (YYYY-MM-DD). */
  rescheduledDates?: Record<string, string>;
  /** Prior schedule segments preserved when a recurring task's schedule was moved. */
  scheduleHistory?: RecurrenceScheduleSegment[];
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
  /** Epoch ms watermark: soft-delete tombstones with deletedAt <= this value have been pruned. */
  tombstonesPrunedBefore?: number;
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
