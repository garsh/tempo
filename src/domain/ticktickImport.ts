import type { Task, TaskList, TaskPriority } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { parseCsv, rowsToObjects } from './csvParse';
import { newId } from './id';

export interface TickTickImportResult {
  tasks: Task[];
  lists: TaskList[];
  skipped: number;
  format: 'ticktick' | 'generic' | 'unknown';
}

function mapPriority(raw: string | undefined): TaskPriority {
  const v = (raw || '').trim().toLowerCase();
  if (!v) return 'none';
  if (v === '5' || v === 'high' || v === 'h' || v.includes('high')) return 'high';
  if (v === '3' || v === 'medium' || v === 'med' || v === 'm') return 'medium';
  if (v === '1' || v === 'low' || v === 'l') return 'low';
  // TickTick uses 0–5; treat >=4 high, 2–3 medium, 1 low
  const n = Number(v);
  if (Number.isFinite(n)) {
    if (n >= 4) return 'high';
    if (n >= 2) return 'medium';
    if (n >= 1) return 'low';
  }
  return 'none';
}

export interface ParseImportDueOptions {
  isAllDay?: boolean;
  timezone?: string;
}

function formatInstantInTimezone(
  ms: number,
  timezone: string,
  isAllDay: boolean
): string | null {
  try {
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    const parts = fmt.formatToParts(new Date(ms));
    const get = (type: Intl.DateTimeFormatPartTypes) =>
      parts.find((p) => p.type === type)?.value ?? '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    if (!year || !month || !day) return null;
    const date = `${year}-${month}-${day}`;
    if (isAllDay) return date;
    const rawHour = get('hour');
    const hour = rawHour === '24' ? '00' : rawHour;
    const minute = get('minute');
    return `${date}T${hour}:${minute}`;
  } catch {
    return null;
  }
}

/** Normalize TickTick / loose date strings to Tempo dueAt. */
export function parseImportDue(
  raw: string | undefined,
  options?: ParseImportDueOptions
): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  const isAllDay = Boolean(options?.isAllDay);
  const timezone = options?.timezone?.trim();

  // Already date-only ISO
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // ISO-like datetime, possibly with timezone offset (e.g. "2026-11-13T05:00:00+0000" or "Z")
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(s);
    if (hasOffset && timezone) {
      const iso = s.replace(' ', 'T').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
      const ms = Date.parse(iso);
      if (!Number.isNaN(ms)) {
        const formatted = formatInstantInTimezone(ms, timezone, isAllDay);
        if (formatted) return formatted;
      }
    }
    const normalized = s.replace(' ', 'T');
    return isAllDay ? normalized.slice(0, 10) : normalized.slice(0, 16);
  }

  // US-ish M/D/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    const date = `${us[3]}-${mm}-${dd}`;
    if (us[4] && !isAllDay) return `${date}T${us[4].padStart(2, '0')}:${us[5]}`;
    return date;
  }
  return null;
}

function getField(row: Record<string, string>, ...names: string[]): string {
  const keys = Object.keys(row);
  for (const name of names) {
    const found = keys.find((k) => k.toLowerCase() === name.toLowerCase());
    if (found && row[found]) return row[found];
  }
  return '';
}

function isTickTickHeader(headers: string[]): boolean {
  const lower = headers.map((h) => h.toLowerCase());
  return (
    lower.includes('title') &&
    (lower.includes('folder name') ||
      lower.includes('list name') ||
      lower.includes('due date') ||
      lower.includes('repeat'))
  );
}

function isGenericHeader(headers: string[]): boolean {
  const lower = headers.map((h) => h.trim().toLowerCase());
  return lower.includes('title') || lower.includes('task') || lower.includes('name');
}

function findHeaderRow(rows: string[][]): {
  index: number;
  format: TickTickImportResult['format'];
} {
  const limit = Math.min(rows.length, 25);
  for (let i = 0; i < limit; i++) {
    const headers = rows[i].map((h) => h.trim());
    if (isTickTickHeader(headers)) return { index: i, format: 'ticktick' };
  }
  for (let i = 0; i < limit; i++) {
    const headers = rows[i].map((h) => h.trim());
    if (isGenericHeader(headers)) return { index: i, format: 'generic' };
  }
  return { index: -1, format: 'unknown' };
}

function parseTimestampMs(raw: string, fallback: number): number {
  if (!raw) return fallback;
  const iso = raw.trim().replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const parsed = Date.parse(iso);
  if (!Number.isNaN(parsed)) return parsed;
  const due = parseImportDue(raw);
  if (due) {
    const d = new Date(due.includes('T') ? due : `${due}T00:00`);
    if (!Number.isNaN(d.getTime())) return d.getTime();
  }
  return fallback;
}

/**
 * Import tasks from TickTick CSV export or a simple generic CSV
 * (title, notes, due, priority, tags, list, status).
 */
export function importTasksFromCsv(csvText: string, now = Date.now()): TickTickImportResult {
  const rows = parseCsv(csvText);
  if (rows.length < 2) {
    return { tasks: [], lists: [], skipped: 0, format: 'unknown' };
  }

  const { index: headerIndex, format } = findHeaderRow(rows);
  if (format === 'unknown' || headerIndex < 0) {
    return { tasks: [], lists: [], skipped: Math.max(0, rows.length - 1), format: 'unknown' };
  }

  const objects = rowsToObjects(rows.slice(headerIndex));

  const listMap = new Map<string, TaskList>();
  const tasks: Task[] = [];
  let skipped = 0;

  const ensureList = (name: string): string => {
    const trimmed = name.trim() || 'Imported';
    const existing = [...listMap.values()].find(
      (l) => l.name.toLowerCase() === trimmed.toLowerCase()
    );
    if (existing) return existing.id;
    if (trimmed.toLowerCase() === 'inbox') return INBOX_LIST_ID;
    const id = newId();
    listMap.set(id, {
      id,
      name: trimmed,
      folderId: null,
      sortOrder: listMap.size,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
    });
    return id;
  };

  for (const row of objects) {
    const title =
      getField(row, 'Title', 'title', 'Task', 'task', 'Name', 'name') || '';
    if (!title.trim()) {
      skipped += 1;
      continue;
    }

    const listName = getField(row, 'List Name', 'list name', 'List', 'list', 'Folder Name');
    const listId = listName ? ensureList(listName) : INBOX_LIST_ID;

    const dueRaw = getField(row, 'Due Date', 'due date', 'Due', 'due', 'dueAt');
    const isAllDayRaw = getField(row, 'Is All Day', 'is all day', 'isAllDay').trim().toLowerCase();
    const isAllDay = isAllDayRaw === 'true' || isAllDayRaw === '1' || isAllDayRaw === 'yes';
    const timezone = getField(row, 'Timezone', 'timezone', 'Time Zone', 'time zone').trim() || undefined;
    const dueAt = parseImportDue(dueRaw, { isAllDay, timezone });

    const priority = mapPriority(getField(row, 'Priority', 'priority'));
    const tagsRaw = getField(row, 'Tags', 'tags', 'tag');
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;\s]+/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean)
      : [];

    const notes = getField(row, 'Content', 'content', 'Notes', 'notes', 'Description', 'description');
    const status = getField(row, 'Status', 'status').toLowerCase();
    const completedRaw = getField(row, 'Completed Time', 'completed time', 'Completed', 'completed');
    const isDone =
      status === 'completed' ||
      status === 'done' ||
      status === '1' ||
      status === '2' ||
      status === '-1' ||
      Boolean(completedRaw);

    const createdRaw = getField(row, 'Created Time', 'created time', 'Created', 'created');
    const createdAt = parseTimestampMs(createdRaw, now);
    const completedAt = isDone ? parseTimestampMs(completedRaw, now) : null;

    const task: Task = {
      id: newId(),
      title: title.trim(),
      notes: notes || undefined,
      listId,
      dueAt,
      priority,
      pinned: false,
      tags: tags.length ? tags : undefined,
      subtasks: [],
      recurrence: null,
      completedAt,
      completionHistory: completedAt !== null ? [completedAt] : [],
      createdAt,
      updatedAt: now,
      deletedAt: null,
    };
    tasks.push(task);
  }

  return {
    tasks,
    lists: [...listMap.values()],
    skipped,
    format,
  };
}
