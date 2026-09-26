export type RecurrenceType = 'after_completion' | 'fixed_interval';

export type IntervalUnit = 'days' | 'weeks' | 'months';

export interface PeriodicTask {
  id: string;
  title: string;
  notes?: string;
  recurrenceType: RecurrenceType;
  intervalValue: number;
  intervalUnit: IntervalUnit;
  dueDate: string; // ISO format: YYYY-MM-DD
  createdAt: number; // Unix epoch ms
  updatedAt: number; // Unix epoch ms
  deletedAt?: number | null; // Soft-delete tombstone
  completionHistory: number[]; // Epoch ms timestamps of every completion
  tags?: string[];
}

export type TaskUrgency = 'overdue' | 'due_today' | 'upcoming' | 'later';

export interface SyncData {
  version: number;
  exportedAt: number;
  tasks: PeriodicTask[];
}
