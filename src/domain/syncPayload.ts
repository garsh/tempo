import type {
  AnnualWindow,
  Folder,
  RecurrenceRule,
  RecurrenceScheduleSegment,
  Subtask,
  SyncData,
  Task,
  TaskList,
  TaskPriority,
  Weekday,
} from '../types/task';

/** Refuse backup bodies larger than this before they are parsed. */
export const MAX_SYNC_BYTES = 50 * 1024 * 1024;
export const MAX_SYNC_RECORDS = 100_000;
export const MAX_ID_LENGTH = 128;
export const MAX_TITLE_LENGTH = 2_000;
export const MAX_NOTES_LENGTH = 10_000;
export const MAX_HISTORY = 365;
const MAX_HISTORY_SCAN = 50_000;
export const MAX_SCHEDULE_HISTORY = 100;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
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
  maxRecords?: number;
  /** Clock used for the future-timestamp clamp. Defaults to Date.now(). */
  now?: number;
}

/** Compute UTF-8 byte length without allocating a full encoded buffer. */
export function utf8ByteLength(text: string): number {
  let bytes = 0;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code <= 0x7f) {
      bytes += 1;
    } else if (code <= 0x7ff) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = i + 1 < text.length ? text.charCodeAt(i + 1) : 0;
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        i += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

function exceedsMaxBytes(text: string, maxBytes: number): boolean {
  if (text.length > maxBytes) return true;
  if (text.length * 3 <= maxBytes) return false;
  return utf8ByteLength(text) > maxBytes;
}

export function formatByteSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
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
  const seen = new Set<number>();
  const add = (item: unknown) => {
    if (typeof item === 'number' && Number.isFinite(item)) seen.add(item);
  };
  if (value.length <= MAX_HISTORY_SCAN) {
    for (let i = 0; i < value.length; i++) add(value[i]);
  } else {
    const half = Math.floor(MAX_HISTORY_SCAN / 2);
    for (let i = 0; i < half; i++) add(value[i]);
    for (let i = value.length - half; i < value.length; i++) add(value[i]);
  }
  const sorted = [...seen].sort((a, b) => a - b);
  return sorted.length > MAX_HISTORY ? sorted.slice(-MAX_HISTORY) : sorted;
}

function asDateList(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const dates: string[] = [];
  for (const item of value) {
    if (typeof item === 'string' && DATE_RE.test(item)) dates.push(item);
  }
  const unique = [...new Set(dates)].sort();
  return unique.length > MAX_HISTORY ? unique.slice(-MAX_HISTORY) : unique;
}

function asRescheduledDates(value: unknown): Record<string, string> | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([k, v]) => typeof v === 'string' && DATE_RE.test(k) && DATE_RE.test(v) && k !== v)
    .sort(([a], [b]) => a.localeCompare(b)) as [string, string][];

  const seenTargets = new Set<string>();
  const uniqueEntries: [string, string][] = [];
  for (const [k, v] of entries) {
    if (seenTargets.has(v)) continue;
    seenTargets.add(v);
    uniqueEntries.push([k, v]);
  }
  if (uniqueEntries.length === 0) return undefined;
  const capped =
    uniqueEntries.length > MAX_HISTORY ? uniqueEntries.slice(-MAX_HISTORY) : uniqueEntries;
  return Object.fromEntries(capped);
}

function asScheduleHistory(value: unknown): RecurrenceScheduleSegment[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const parsed: RecurrenceScheduleSegment[] = [];
  for (const item of value) {
    if (!item || typeof item !== 'object') continue;
    const raw = item as Record<string, unknown>;
    if (typeof raw.startDate !== 'string' || !DATE_RE.test(raw.startDate)) continue;
    if (typeof raw.endDate !== 'string' || !DATE_RE.test(raw.endDate)) continue;
    if (raw.startDate > raw.endDate) continue;
    const rec = asRecurrence(raw.recurrence);
    if (!rec || rec.type !== 'fixed_interval') continue;
    const segRec: RecurrenceRule = { ...rec };
    delete segRec.endOnDate;
    delete segRec.endAfterCount;
    delete segRec.maxIntervalValue;
    parsed.push({
      startDate: raw.startDate,
      endDate: raw.endDate,
      recurrence: segRec,
    });
  }
  if (parsed.length === 0) return undefined;
  parsed.sort((a, b) =>
    a.startDate !== b.startDate
      ? a.startDate.localeCompare(b.startDate)
      : a.endDate.localeCompare(b.endDate)
  );
  const disjoint: RecurrenceScheduleSegment[] = [];
  let lastEnd = '';
  for (const seg of parsed) {
    if (lastEnd && seg.startDate <= lastEnd) continue;
    disjoint.push(seg);
    lastEnd = seg.endDate;
  }
  return disjoint.length > MAX_SCHEDULE_HISTORY ? disjoint.slice(-MAX_SCHEDULE_HISTORY) : disjoint;
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

const MAX_ANNUAL_MONTH_DAYS = [0, 31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31] as const;

function asAnnualWindow(value: unknown): AnnualWindow | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  const startMonth = asFinite(raw.startMonth);
  const startDay = asFinite(raw.startDay);
  const endMonth = asFinite(raw.endMonth);
  const endDay = asFinite(raw.endDay);
  if (startMonth === undefined || startDay === undefined || endMonth === undefined || endDay === undefined) {
    return undefined;
  }
  const sm = Math.floor(startMonth);
  const em = Math.floor(endMonth);
  const sd = Math.floor(startDay);
  const ed = Math.floor(endDay);
  if (sm < 1 || sm > 12 || em < 1 || em > 12) return undefined;
  if (sd < 1 || sd > 31 || ed < 1 || ed > 31) return undefined;
  return {
    startMonth: sm,
    startDay: Math.min(MAX_ANNUAL_MONTH_DAYS[sm], sd),
    endMonth: em,
    endDay: Math.min(MAX_ANNUAL_MONTH_DAYS[em], ed),
  };
}

function asAnnualWindows(value: unknown): AnnualWindow[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const windows: AnnualWindow[] = [];
  for (const item of value.slice(0, 12)) {
    const parsed = asAnnualWindow(item);
    if (parsed) windows.push(parsed);
  }
  return windows.length > 0 ? windows : undefined;
}

function asRecurrence(value: unknown): RecurrenceRule | null | undefined {
  if (value == null) return value === null ? null : undefined;
  if (typeof value !== 'object') return undefined;
  const raw = value as Record<string, unknown>;
  if (raw.type === 'annual_window') {
    const annualWindows = asAnnualWindows(raw.annualWindows);
    if (!annualWindows) return undefined;
    const rawInterval = asFinite(raw.intervalValue);
    const intervalValue = rawInterval !== undefined ? Math.min(99, Math.max(1, Math.floor(rawInterval))) : 1;
    const rule: RecurrenceRule = {
      type: 'annual_window',
      intervalValue,
      intervalUnit: 'years',
      annualWindows,
    };
    if (typeof raw.endOnDate === 'string' && DATE_RE.test(raw.endOnDate)) rule.endOnDate = raw.endOnDate;
    else if (raw.endOnDate === null) rule.endOnDate = null;
    return rule;
  }
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
  const deletedAt = asOptionalStamp(record.deletedAt, now);
  if (deletedAt) {
    return {
      id: record.id.trim(),
      title: '',
      listId,
      completionHistory: [],
      createdAt: asStamp(record.createdAt, now, 0),
      updatedAt: asStamp(record.updatedAt, now, 0),
      deletedAt,
    };
  }
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
  const isWindowRecurrence =
    task.recurrence?.type === 'after_completion' || task.recurrence?.type === 'annual_window';
  if (isWindowRecurrence) {
    task.dueAt = null;
    task.startDate = null;
  }
  const removedCompletions = asHistory(record.removedCompletions);
  if (removedCompletions.length > 0) task.removedCompletions = removedCompletions;
  const completedAt = asOptionalStamp(record.completedAt, now);
  if (completedAt !== undefined) task.completedAt = completedAt;
  if (deletedAt !== undefined) task.deletedAt = deletedAt;
  const skipped = asDateList(record.skippedDates);
  if (skipped && skipped.length > 0) task.skippedDates = skipped;
  if (!isWindowRecurrence) {
    const removedSkipped = asDateList(record.removedSkippedDates);
    if (removedSkipped && removedSkipped.length > 0) task.removedSkippedDates = removedSkipped;
    if (task.recurrence) {
      const rescheduled = asRescheduledDates(record.rescheduledDates);
      if (rescheduled) task.rescheduledDates = rescheduled;
      const scheduleHistory = asScheduleHistory(record.scheduleHistory);
      if (scheduleHistory && scheduleHistory.length > 0) task.scheduleHistory = scheduleHistory;
    }
  }
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
  const deletedAt = asOptionalStamp(record.deletedAt, now);
  if (deletedAt) {
    return { ...base, name: '', deletedAt };
  }
  const sortOrder = asFinite(record.sortOrder);
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

function requireBoundedRecords(value: unknown, maxRecords: number): unknown[] {
  if (!Array.isArray(value)) return [];
  if (value.length > maxRecords) {
    throw new SyncPayloadError(
      `Backup has too many records (${value.length.toLocaleString()}, max ${maxRecords.toLocaleString()}).`,
      'too_large'
    );
  }
  return value;
}

/**
 * Parse a JSON backup (SyncData object or a legacy Task[]) into clean records.
 * Drops individual bad rows. Throws if the body is too large, not JSON, or `tasks` is not an array.
 */
export function parseSyncPayload(text: string, opts: ParseSyncOptions = {}): ParsedSyncPayload {
  const maxBytes = opts.maxBytes ?? MAX_SYNC_BYTES;
  const maxRecords = opts.maxRecords ?? MAX_SYNC_RECORDS;
  if (exceedsMaxBytes(text, maxBytes)) {
    throw new SyncPayloadError(
      `Backup is too large (${formatByteSize(utf8ByteLength(text))}, max ${formatByteSize(maxBytes)}).`,
      'too_large'
    );
  }
  const parsed: unknown = JSON.parse(text);
  const now = opts.now ?? Date.now();

  let taskRows: unknown[];
  let listRows: unknown[] = [];
  let folderRows: unknown[] = [];
  let exportedAt: number | undefined;

  if (Array.isArray(parsed)) {
    taskRows = requireBoundedRecords(parsed, maxRecords);
  } else if (parsed && typeof parsed === 'object') {
    const record = parsed as Record<string, unknown>;
    if ('tasks' in record && !Array.isArray(record.tasks)) {
      throw new SyncPayloadError('Invalid format: tasks array missing.', 'tasks_not_array');
    }
    taskRows = requireBoundedRecords(record.tasks, maxRecords);
    listRows = requireBoundedRecords(record.lists, maxRecords);
    folderRows = requireBoundedRecords(record.folders, maxRecords);
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
  if (declared > maxBytes) {
    throw new SyncPayloadError(
      `Backup is too large (${formatByteSize(declared)}, max ${formatByteSize(maxBytes)}).`,
      'too_large'
    );
  }

  const body = res.body;
  if (!body || typeof body.getReader !== 'function') {
    const text = await res.text();
    if (exceedsMaxBytes(text, maxBytes)) {
      throw new SyncPayloadError(
        `Backup is too large (${formatByteSize(utf8ByteLength(text))}, max ${formatByteSize(maxBytes)}).`,
        'too_large'
      );
    }
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
      throw new SyncPayloadError(
        `Backup is too large (exceeds ${formatByteSize(maxBytes)} limit).`,
        'too_large'
      );
    }
    text += decoder.decode(value, { stream: true });
  }
  text += decoder.decode();
  return text;
}

function compactTaskForSync(task: Task): Task {
  if (task.deletedAt) {
    return {
      id: task.id,
      title: '',
      listId: task.listId || 'inbox',
      completionHistory: [],
      createdAt: task.createdAt,
      updatedAt: task.updatedAt,
      deletedAt: task.deletedAt,
    };
  }
  const compact: Task = {
    id: task.id,
    title: task.title,
    listId: task.listId,
    completionHistory: task.completionHistory ?? [],
    createdAt: task.createdAt,
    updatedAt: task.updatedAt,
  };
  if (task.notes) compact.notes = task.notes;
  if (task.dueAt) compact.dueAt = task.dueAt;
  if (task.startDate) compact.startDate = task.startDate;
  if (task.priority && task.priority !== 'none') compact.priority = task.priority;
  if (task.pinned === true) compact.pinned = true;
  if (task.tags && task.tags.length > 0) compact.tags = task.tags;
  if (task.subtasks && task.subtasks.length > 0) compact.subtasks = task.subtasks;
  if (task.recurrence != null) compact.recurrence = task.recurrence;
  if (task.completedAt != null) compact.completedAt = task.completedAt;
  if (task.removedCompletions && task.removedCompletions.length > 0) {
    compact.removedCompletions = task.removedCompletions;
  }
  if (task.skippedDates && task.skippedDates.length > 0) compact.skippedDates = task.skippedDates;
  if (task.removedSkippedDates && task.removedSkippedDates.length > 0) {
    compact.removedSkippedDates = task.removedSkippedDates;
  }
  if (task.rescheduledDates && Object.keys(task.rescheduledDates).length > 0) {
    compact.rescheduledDates = task.rescheduledDates;
  }
  if (task.scheduleHistory && task.scheduleHistory.length > 0) {
    compact.scheduleHistory = task.scheduleHistory;
  }
  if (task.sortOrder !== undefined) compact.sortOrder = task.sortOrder;
  return compact;
}

function compactListForSync(list: TaskList): TaskList {
  if (list.deletedAt) {
    return {
      id: list.id,
      name: '',
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      deletedAt: list.deletedAt,
    };
  }
  const compact: TaskList = {
    id: list.id,
    name: list.name,
    createdAt: list.createdAt,
    updatedAt: list.updatedAt,
  };
  if (list.folderId) compact.folderId = list.folderId;
  if (list.sortOrder !== undefined) compact.sortOrder = list.sortOrder;
  return compact;
}

function compactFolderForSync(folder: Folder): Folder {
  if (folder.deletedAt) {
    return {
      id: folder.id,
      name: '',
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
      deletedAt: folder.deletedAt,
    };
  }
  const compact: Folder = {
    id: folder.id,
    name: folder.name,
    createdAt: folder.createdAt,
    updatedAt: folder.updatedAt,
  };
  if (folder.sortOrder !== undefined) compact.sortOrder = folder.sortOrder;
  return compact;
}

/** Strip redundant whitespace/default fields and tombstone payloads before uploading to Drive. */
export function compactSyncData(data: SyncData): SyncData {
  return {
    version: data.version,
    exportedAt: data.exportedAt,
    tasks: data.tasks.map(compactTaskForSync),
    lists: data.lists.map(compactListForSync),
    folders: (data.folders ?? []).map(compactFolderForSync),
  };
}
