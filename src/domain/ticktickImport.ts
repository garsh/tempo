import type {
  IntervalUnit,
  RecurrenceRule,
  RecurrenceType,
  Task,
  TaskList,
  TaskPriority,
  Weekday,
} from '../types/task';
import { INBOX_LIST_ID } from '../types/task';
import { parseCsv, rowsToObjects } from './csvParse';
import { newId } from './id';
import { formatDate } from './recurrence';

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

const tzFormatterCache = new Map<string, Intl.DateTimeFormat | null>();

function getTimezoneFormatter(timezone: string): Intl.DateTimeFormat | null {
  if (tzFormatterCache.has(timezone)) return tzFormatterCache.get(timezone) ?? null;
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
    tzFormatterCache.set(timezone, fmt);
    return fmt;
  } catch {
    tzFormatterCache.set(timezone, null);
    return null;
  }
}

function formatInstantInTimezone(
  ms: number,
  timezone: string,
  isAllDay: boolean
): string | null {
  const fmt = getTimezoneFormatter(timezone);
  if (!fmt) return null;
  try {
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

const RRULE_WEEKDAY: Record<string, Weekday> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

/** Parse a TickTick RRULE/ERULE or human repeat string into a Tempo RecurrenceRule. */
export function parseImportRepeat(raw: string | undefined): RecurrenceRule | null {
  if (!raw || !raw.trim()) return null;
  let s = raw.trim();
  let type: RecurrenceType = 'fixed_interval';

  if (/^ERULE:/i.test(s)) {
    type = 'after_completion';
    s = s.slice(6).trim();
  } else if (/^RRULE:/i.test(s)) {
    s = s.slice(6).trim();
  }

  if (/FREQ=/i.test(s)) {
    const parts = new Map<string, string>();
    for (const seg of s.split(';')) {
      const eq = seg.indexOf('=');
      if (eq <= 0) continue;
      parts.set(seg.slice(0, eq).trim().toUpperCase(), seg.slice(eq + 1).trim().toUpperCase());
    }

    if (parts.get('REPEATFROM') === '2' || parts.get('REPEATFROM') === 'COMPLETION') {
      type = 'after_completion';
    }

    const freq = parts.get('FREQ');
    const rawInterval = parseInt(parts.get('INTERVAL') || '1', 10);
    const interval = Number.isFinite(rawInterval) && rawInterval >= 1 ? rawInterval : 1;

    const byDayRaw = parts.get('BYDAY');
    const weekdays: Weekday[] = [];
    if (byDayRaw) {
      const seen = new Set<Weekday>();
      for (const tok of byDayRaw.split(',')) {
        const code = tok.trim().slice(-2).toUpperCase();
        const wd = RRULE_WEEKDAY[code];
        if (wd !== undefined && !seen.has(wd)) {
          seen.add(wd);
          weekdays.push(wd);
        }
      }
      weekdays.sort((a, b) => a - b);
    }

    const byMonthDayRaw = parts.get('BYMONTHDAY');
    let monthDay: number | undefined;
    if (byMonthDayRaw) {
      const firstDom = parseInt(byMonthDayRaw.split(',')[0], 10);
      if (firstDom === -1) monthDay = 31;
      else if (Number.isFinite(firstDom) && firstDom >= 1 && firstDom <= 31) monthDay = firstDom;
    }

    const untilRaw = parts.get('UNTIL');
    let endOnDate: string | null | undefined;
    if (untilRaw) {
      const m = untilRaw.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
      if (m) endOnDate = `${m[1]}-${m[2]}-${m[3]}`;
    }

    const countRaw = parts.get('COUNT');
    let endAfterCount: number | null | undefined;
    if (countRaw) {
      const n = parseInt(countRaw, 10);
      if (Number.isFinite(n) && n > 0) endAfterCount = n;
    }

    let intervalUnit: IntervalUnit;
    let intervalValue = interval;
    let ruleWeekdays: Weekday[] | undefined;

    if (freq === 'DAILY') {
      if (weekdays.length > 0 && weekdays.length < 7) {
        intervalUnit = 'weeks';
        intervalValue = 1;
        ruleWeekdays = weekdays;
      } else {
        intervalUnit = 'days';
      }
    } else if (freq === 'WEEKLY') {
      if (weekdays.length === 7 && interval === 1) {
        intervalUnit = 'days';
        intervalValue = 1;
      } else {
        intervalUnit = 'weeks';
        ruleWeekdays = weekdays.length > 0 ? weekdays : undefined;
      }
    } else if (freq === 'MONTHLY') {
      intervalUnit = 'months';
    } else if (freq === 'YEARLY') {
      intervalUnit = 'months';
      intervalValue = interval * 12;
    } else {
      return null;
    }

    return {
      type,
      intervalValue,
      intervalUnit,
      ...(ruleWeekdays ? { weekdays: ruleWeekdays } : {}),
      ...(monthDay !== undefined && intervalUnit === 'months' ? { monthDay } : {}),
      ...(endOnDate ? { endOnDate } : {}),
      ...(endAfterCount ? { endAfterCount } : {}),
    };
  }

  const lower = s.toLowerCase();
  if (lower === 'daily' || lower === 'every day') {
    return { type, intervalValue: 1, intervalUnit: 'days' };
  }
  if (lower === 'weekly' || lower === 'every week') {
    return { type, intervalValue: 1, intervalUnit: 'weeks' };
  }
  if (lower === 'weekdays' || lower === 'every weekday') {
    return { type, intervalValue: 1, intervalUnit: 'weeks', weekdays: [1, 2, 3, 4, 5] };
  }
  if (lower === 'monthly' || lower === 'every month') {
    return { type, intervalValue: 1, intervalUnit: 'months' };
  }
  if (lower === 'yearly' || lower === 'annually' || lower === 'every year') {
    return { type, intervalValue: 12, intervalUnit: 'months' };
  }
  const everyMatch = lower.match(/^every\s+(\d+)\s+(day|week|month|year)s?$/);
  if (everyMatch) {
    const n = Math.max(1, parseInt(everyMatch[1], 10) || 1);
    const unit = everyMatch[2];
    if (unit === 'year') return { type, intervalValue: n * 12, intervalUnit: 'months' };
    return { type, intervalValue: n, intervalUnit: `${unit}s` as IntervalUnit };
  }

  return null;
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
  const activeRecurringByKey = new Map<string, Task>();
  const activeRecurringByIdentity = new Map<string, Task>();
  const identitiesWithDatedOrRecurringOrDone = new Set<string>();
  const completedRecurringCandidates: {
    index: number;
    repeatKey: string | null;
    identityKey: string | null;
    compTs: number;
  }[] = [];
  const orphanOpenCandidates: { index: number; identityKey: string }[] = [];

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

    const dueRaw = getField(
      row,
      'Due Date',
      'due date',
      'Due',
      'due',
      'dueAt',
      'Start Date',
      'start date'
    );
    const isAllDayRaw = getField(row, 'Is All Day', 'is all day', 'isAllDay').trim().toLowerCase();
    const isAllDay = isAllDayRaw === 'true' || isAllDayRaw === '1' || isAllDayRaw === 'yes';
    const timezone = getField(row, 'Timezone', 'timezone', 'Time Zone', 'time zone').trim() || undefined;
    const dueAt = parseImportDue(dueRaw, { isAllDay, timezone });

    const repeatRaw = getField(row, 'Repeat', 'repeat', 'Recurrence', 'recurrence');
    const parsedRecurrence = parseImportRepeat(repeatRaw);

    const priority = mapPriority(getField(row, 'Priority', 'priority'));
    const tagsRaw = getField(row, 'Tags', 'tags', 'tag');
    const tags = tagsRaw
      ? tagsRaw
          .split(/[,;\s]+/)
          .map((t) => t.replace(/^#/, '').trim())
          .filter(Boolean)
      : [];

    const notes = getField(row, 'Content', 'content', 'Notes', 'notes', 'Description', 'description');
    const status = getField(row, 'Status', 'status').trim().toLowerCase();
    const completedRaw = getField(row, 'Completed Time', 'completed time', 'Completed', 'completed');
    const explicitOpen = status === '0' || status === 'normal' || status === 'open';
    const isDone =
      explicitOpen && (parsedRecurrence || !completedRaw)
        ? false
        : status === 'completed' ||
          status === 'done' ||
          status === '1' ||
          status === '2' ||
          status === '-1' ||
          Boolean(completedRaw);

    const createdRaw = getField(row, 'Created Time', 'created time', 'Created', 'created');
    const hasExplicitCreated = createdRaw.trim().length > 0;
    const createdAt = parseTimestampMs(createdRaw, now);
    const completedAt = isDone ? parseTimestampMs(completedRaw, now) : null;

    const titleLower = title.trim().toLowerCase();
    const repeatKey = parsedRecurrence
      ? `${listId}::${titleLower}::${repeatRaw.trim()}`
      : null;
    const identityKey = hasExplicitCreated ? `${listId}::${titleLower}::${createdAt}` : null;

    const task: Task = {
      id: newId(),
      title: title.trim(),
      notes: notes || undefined,
      listId,
      dueAt: !isDone && parsedRecurrence ? dueAt ?? formatDate(new Date(createdAt)) : dueAt,
      priority,
      pinned: false,
      tags: tags.length ? tags : undefined,
      subtasks: [],
      recurrence: !isDone ? parsedRecurrence : null,
      completedAt: !isDone ? null : completedAt,
      completionHistory: completedAt !== null ? [completedAt] : [],
      createdAt,
      updatedAt: now,
      deletedAt: null,
    };

    if (identityKey && (parsedRecurrence || dueAt || isDone)) {
      identitiesWithDatedOrRecurringOrDone.add(identityKey);
    }

    if (!isDone && parsedRecurrence) {
      if (repeatKey && !activeRecurringByKey.has(repeatKey)) {
        activeRecurringByKey.set(repeatKey, task);
      }
      if (identityKey && !activeRecurringByIdentity.has(identityKey)) {
        activeRecurringByIdentity.set(identityKey, task);
      }
    } else if (!isDone && !parsedRecurrence && !dueAt && identityKey) {
      orphanOpenCandidates.push({ index: tasks.length, identityKey });
    } else if (isDone && (repeatKey || identityKey)) {
      let compTs = completedAt ?? now;
      if (!completedRaw && dueAt) {
        const [y, m, d] = dueAt.slice(0, 10).split('-').map(Number);
        compTs = new Date(y, m - 1, d, 12, 0, 0, 0).getTime();
      }
      completedRecurringCandidates.push({
        index: tasks.length,
        repeatKey,
        identityKey,
        compTs,
      });
    }
    tasks.push(task);
  }

  const dropIndices = new Set<number>();

  if (completedRecurringCandidates.length > 0) {
    for (const c of completedRecurringCandidates) {
      const active =
        (c.repeatKey ? activeRecurringByKey.get(c.repeatKey) : undefined) ??
        (c.identityKey ? activeRecurringByIdentity.get(c.identityKey) : undefined);
      if (active) {
        dropIndices.add(c.index);
        if (!active.completionHistory.includes(c.compTs)) {
          active.completionHistory.push(c.compTs);
        }
      }
    }
    const touched = new Set<Task>([
      ...activeRecurringByKey.values(),
      ...activeRecurringByIdentity.values(),
    ]);
    for (const active of touched) {
      active.completionHistory.sort((a, b) => a - b);
      if (active.completionHistory.length > 365) {
        active.completionHistory = active.completionHistory.slice(-365);
      }
    }
  }

  if (orphanOpenCandidates.length > 0) {
    const keptOrphanIdentity = new Set<string>();
    for (const o of orphanOpenCandidates) {
      if (
        identitiesWithDatedOrRecurringOrDone.has(o.identityKey) ||
        keptOrphanIdentity.has(o.identityKey)
      ) {
        dropIndices.add(o.index);
      } else {
        keptOrphanIdentity.add(o.identityKey);
      }
    }
  }

  if (dropIndices.size > 0) {
    return {
      tasks: tasks.filter((_, idx) => !dropIndices.has(idx)),
      lists: [...listMap.values()],
      skipped,
      format,
    };
  }

  return {
    tasks,
    lists: [...listMap.values()],
    skipped,
    format,
  };
}
