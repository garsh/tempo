import type { Folder, RecurrenceRule, Subtask, Task, TaskList, TaskPriority, Weekday } from '../types/task';

/** Refuse backup bodies larger than this before they are parsed. */
export const MAX_SYNC_BYTES = 5 * 1024 * 1024;
export const MAX_SYNC_RECORDS = 5_000;
export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 2_000;
export const MAX_NOTES_LENGTH = 10_000;
export const MAX_HISTORY = 365;
/** Timestamps further ahead than this are hostile and are rewritten to `now`. */
export const CLOCK_SKEW_MS = 5 * 60 * 1000;

export class SyncPayloadError extends Error {
  readonly code: 'too_large' | 'tasks_not_array' | 'invalid';

  constructor(message: string, code: 'too_large' | 'tasks_not_array' | 'invalid') {
    super(message);
    this.name = 'SyncPayloadError';
    this.code = code;
  }
}

export interface ParsedSyncPayload {
  tasks: Task[];
  lists: TaskList[];
  folders: Folder[];
  /** Present when the backup named an exportedAt. Clamped the same way as record timestamps. */
  exportedAt?: number;
}

export interface ParseSyncOptions {
  maxBytes?: number;
  /** Clock used for the future-timestamp clamp. Defaults to Date.now(). */
  now?: number;
}

function byteLength(text: string): number {
  return new TextEncoder().encode(text).byteLength;
}

function isId(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const id = value.trim();
  if (!id || id.length > MAX_ID_LENGTH) return false;
  return !/[\u0000-\u001F\u007F]/.test(id);
}

function asText(value: unknown, max: number): string | undefined {
  if (typeof value !== 'string') return undefined;
  const cleaned = value.replace(/\u0000/g, '');
  return cleaned.length > max ? cleaned.slice(0, max) : cleaned;
}

function asFinite(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  return value;
}

/** Keep an in-range stamp unchanged. A far-future stamp becomes `now`. */
export function clampTimestamp(value: number, now: number): number {
  if (value > now + CLOCK_SKEW_MS) return now;
  return value;
}

function asStamp(value: unknown, now: number, fallback: number): number {
  const n = asFinite(value);
  if (n === undefined) return fallback;
  return clampTimestamp(n, now);
}

function asOptionalStamp(value: unknown, now: number): number | null | undefined {
  if (value == null) return value === null ? null : undefined;
  const n = asFinite(value);
  if (n === undefined) return undefined;
  return clampTimestamp(n, now);
}

function asHistory(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  const nums: number[] = [];
  for (const item of value) {
    if (typeof item === 'number' && Number.isFinite(item)) nums.push(item);
    if (nums.length > MAX_HISTORY * 4) break;
  }
  nums.sort((a, b) => a - b);
  return nums.length > MAX_HISTORY ? nums.slice(-MAX_HISTORY) : nums;
}

function asDateList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dates: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item)) dates.push(item);
  }
  const unique = [...new Set(dates)].sort();
  return unique.length > MAX_HISTORY ? unique.slice(-MAX_HISTORY) : unique;
}

function asPriority(value: unknown): TaskPriority | undefined {
  if (value === 'high' || value === 'medium' || value === 'low' || value === 'none') return value;
  return undefined;
}

function asWeekday(value: unknown): Weekday | undefined {
  if (value === 0 || value === 1 || value === 2 || value === 3 || value === 4 || value === 5 || value === 6) {
    return value;
  }
  return undefined;
}

function asRecurrence(value: unknown): RecurrenceRule | null | undefined {
  if (value == null) return value === null ? null : undefined;
  if (typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type !== 'after_completion' && raw.type !== 'fixed_interval') return undefined;
  if (
    raw.intervalUnit !== 'days' &&
    raw.intervalUnit !== 'weeks' &&
    raw.intervalUnit !== 'months' &&
    raw.intervalUnit !== 'years'
  ) {
    return undefined;
  }
  const interval = asFinite(raw.intervalValue);
  if (interval === undefined) return undefined;
  const clampedMin = Math.min(999, Math.max(1, Math.floor(interval)));
  const rawMax = asFinite(raw.maxIntervalValue);
  let maxIntervalValue: number | undefined;
  if (rawMax !== undefined) {
    maxIntervalValue = Math.min(999, Math.max(clampedMin, Math.floor(rawMax)));
  } else if (raw.type === 'after_completion') {
    maxIntervalValue = clampedMin;
  }

  const isWindow = raw.type === 'after_completion' || maxIntervalValue !== undefined;
  const rule: RecurrenceRule = {
    type: isWindow ? 'after_completion' : 'fixed_interval',
    intervalUnit: raw.intervalUnit,
    intervalValue: clampedMin,
    ...(maxIntervalValue !== undefined ? { maxIntervalValue } : {}),
  };
  if (!isWindow && Array.isArray(raw.weekdays)) {
    const days = raw.weekdays.map(asWeekday).filter((d): d is Weekday => d !== undefined).slice(0, 7);
    if (days.length > 0) rule.weekdays = days;
  }
  if (!isWindow) {
    const monthDay = asFinite(raw.monthDay);
    if (monthDay !== undefined && monthDay >= 1 && monthDay <= 31) rule.monthDay = Math.floor(monthDay);
  }
  if (typeof raw.endOnDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.endOnDate)) rule.endOnDate = raw.endOnDate;
  else if (raw.endOnDate === null) rule.endOnDate = null;
  if (!isWindow) {
    const endCount = asFinite(raw.endAfterCount);
    if (endCount !== undefined && endCount >= 0) rule.endAfterCount = Math.min(10_000, Math.floor(endCount));
    else if (raw.endAfterCount === null) rule.endAfterCount = null;
  }
  return rule;
}

function asSubtasks(value: unknown): Subtask[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const subtasks: Subtask[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (!isId(raw.id)) continue;
    const title = asText(raw.title, MAX_TITLE_LENGTH);
    if (title === undefined) continue;
    subtasks.push({ id: raw.id.trim(), title, completed: raw.completed === true });
    if (subtasks.length >= 100) break;
  }
  return subtasks;
}

function asTags(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const tags: string[] = [];
  for (const item of value) {
    const tag = asText(item, 100);
    if (tag) tags.push(tag);
    if (tags.length >= 50) break;
  }
  return tags;
}

function sanitizeTask(raw: unknown, now: number): Task | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!isId(record.id)) return null;
  const title = asText(record.title, MAX_TITLE_LENGTH);
  if (title === undefined) return null;
  const listId = isId(record.listId) ? record.listId.trim() : 'inbox';
  const task: Task = {
    id: record.id.trim(),
    title,
    listId,
    completionHistory: asHistory(record.completionHistory),
    createdAt: asStamp(record.createdAt, now, 0),
    updatedAt: asStamp(record.updatedAt, now, 0),
  };
  const notes = asText(record.notes, MAX_NOTES_LENGTH);
  if (notes) task.notes = notes;
  const dueAt = asText(record.dueAt, 40);
  if (dueAt) task.dueAt = dueAt;
  else if (record.dueAt === null) task.dueAt = null;
  const startDate = asText(record.startDate, 40);
  if (startDate) task.startDate = startDate;
  else if (record.startDate === null) task.startDate = null;
  const priority = asPriority(record.priority);
  if (priority) task.priority = priority;
  if (typeof record.pinned === 'boolean') task.pinned = record.pinned;
  const tags = asTags(record.tags);
  if (tags && tags.length > 0) task.tags = tags;
  const subtasks = asSubtasks(record.subtasks);
  if (subtasks && subtasks.length > 0) task.subtasks = subtasks;
  const recurrence = asRecurrence(record.recurrence);
  if (recurrence !== undefined) task.recurrence = recurrence;
  if (task.recurrence?.type === 'after_completion') {
    task.dueAt = null;
    task.startDate = null;
  }
  const removedCompletions = asHistory(record.removedCompletions);
  if (removedCompletions.length > 0) task.removedCompletions = removedCompletions;
  const completedAt = asOptionalStamp(record.completedAt, now);
  if (completedAt !== undefined) task.completedAt = completedAt;
  const deletedAt = asOptionalStamp(record.deletedAt, now);
  if (deletedAt !== undefined) task.deletedAt = deletedAt;
  const skipped = asDateList(record.skippedDates);
  if (skipped && skipped.length > 0) task.skippedDates = skipped;
  const sortOrder = asFinite(record.sortOrder);
  if (sortOrder !== undefined) task.sortOrder = sortOrder;
  return task;
}

function sanitizeNamed(
  raw: unknown,
  now: number,
  kind: 'list' | 'folder'
): (TaskList | Folder) | null {
  if (!raw || typeof raw !== 'object') return null;
  const record = raw as Record<string, unknown>;
  if (!isId(record.id)) return null;
  const name = asText(record.name, MAX_TITLE_LENGTH);
  if (name === undefined) return null;
  const base = {
    id: record.id.trim(),
    name,
    createdAt: asStamp(record.createdAt, now, 0),
    updatedAt: asStamp(record.updatedAt, now, 0),
  };
  const sortOrder = asFinite(record.sortOrder);
  const deletedAt = asOptionalStamp(record.deletedAt, now);
  if (kind === 'folder') {
    const folder: Folder = { ...base };
    if (sortOrder !== undefined) folder.sortOrder = sortOrder;
    if (deletedAt !== undefined) folder.deletedAt = deletedAt;
    return folder;
  }
  const list: TaskList = { ...base };
  if (sortOrder !== undefined) list.sortOrder = sortOrder;
  if (deletedAt !== undefined) list.deletedAt = deletedAt;
  if (record.folderId === null) list.folderId = null;
  else if (isId(record.folderId)) list.folderId = record.folderId.trim();
  return list;
}

function takeRecords(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SYNC_RECORDS);
}

/**
 * Parse a JSON backup (SyncData object or a legacy Task[]) into clean records.
 * Drops individual bad rows. Throws if the body is too large, not JSON, or `tasks` is not an array.
 */
export function parseSyncPayload(text: string, opts: ParseSyncOptions = {}): ParsedSyncPayload {
  const maxBytes = opts.maxBytes ?? MAX_SYNC_BYTES;
  if (byteLength(text) > maxBytes) {
    throw new SyncPayloadError('Backup is too large.', 'too_large');
  }
  const parsed: unknown = JSON.parse(text);
  const now = opts.now ?? Date.now();

  let taskRows: unknown[];
  let listRows: unknown[] = [];
  let folderRows: unknown[] = [];
  let exportedAt: number | undefined;

  if (Array.isArray(parsed)) {
    taskRows = parsed.slice(0, MAX_SYNC_RECORDS);
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if ('tasks' in record && !Array.isArray(record.tasks)) {
      throw new SyncPayloadError('Invalid format: tasks array missing.', 'tasks_not_array');
    }
    taskRows = takeRecords(record.tasks);
    listRows = takeRecords(record.lists);
    folderRows = takeRecords(record.folders);
    const stamped = asFinite(record.exportedAt);
    if (stamped !== undefined) exportedAt = clampTimestamp(stamped, now);
  } else {
    throw new SyncPayloadError('Invalid format: tasks array missing.', 'invalid');
  }

  return {
    tasks: taskRows.map((row) => sanitizeTask(row, now)).filter((row): row is Task => row !== null),
    lists: listRows.map((row) => sanitizeNamed(row, now, 'list')).filter((row): row is TaskList => row !== null),
    folders: folderRows
      .map((row) => sanitizeNamed(row, now, 'folder'))
      .filter((row): row is Folder => row !== null),
    exportedAt,
  };
}

/** Read a response body, stopping once `maxBytes` is exceeded. */
export async function readResponseTextCapped(res: Response, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get('content-length') || 0);
  if (declared > maxBytes) throw new SyncPayloadError('Backup is too large.', 'too_large');

  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    if (byteLength(text) > maxBytes) throw new SyncPayloadError('Backup is too large.', 'too_large');
    return text;
  }

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let total = 0;
  let text = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already consumed */
      }
      throw new SyncPayloadError('Backup is too large.', 'too_large');
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}
