import type { Task, TaskList, TaskPriority } from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { parseCsv, rowsToObjects } from './csvParse';

export interface TickTickImportResult {
  tasks: Task[];
  lists: TaskList[];
  skipped: number;
  format: 'ticktick' | 'generic' | 'unknown';
}

function newId(): string {
  return crypto.randomUUID();
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

/** Normalize TickTick / loose date strings to Tempo dueAt. */
export function parseImportDue(raw: string | undefined): string | null {
  if (!raw || !raw.trim()) return null;
  const s = raw.trim();
  // Already ISO-ish
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}/.test(s)) {
    return s.replace(' ', 'T').slice(0, 16);
  }
  // TickTick often: "2026-10-05T09:00:00+0000" or with space
  const m = s.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}):(\d{2})/);
  if (m) return `${m[1]}T${m[2]}:${m[3]}`;
  // US-ish M/D/YYYY
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2}))?/);
  if (us) {
    const mm = us[1].padStart(2, '0');
    const dd = us[2].padStart(2, '0');
    const date = `${us[3]}-${mm}-${dd}`;
    if (us[4]) return `${date}T${us[4].padStart(2, '0')}:${us[5]}`;
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
  const lower = headers.map((h) => h.toLowerCase());
  return lower.includes('title') || lower.includes('task') || lower.includes('name');
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
  const headers = rows[0].map((h) => h.trim());
  const objects = rowsToObjects(rows);

  const format: TickTickImportResult['format'] = isTickTickHeader(headers)
    ? 'ticktick'
    : isGenericHeader(headers)
      ? 'generic'
      : 'unknown';

  if (format === 'unknown') {
    return { tasks: [], lists: [], skipped: objects.length, format };
  }

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
    const dueAt = parseImportDue(dueRaw);

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
      Boolean(completedRaw);

    const createdRaw = getField(row, 'Created Time', 'created time', 'Created', 'created');
    let createdAt = now;
    const createdDue = parseImportDue(createdRaw);
    if (createdDue) {
      const d = new Date(createdDue.includes('T') ? createdDue : `${createdDue}T00:00`);
      if (!Number.isNaN(d.getTime())) createdAt = d.getTime();
    }

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
      completedAt: isDone ? now : null,
      completionHistory: isDone ? [now] : [],
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
