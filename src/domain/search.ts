import type { Task } from '../types/task';
import {
  formatDate,
  getDueDatePart,
  getDueDeadline,
  getLatestCompletionMs,
  getNextUncompletedOccurrenceDate,
  isRecurring,
  isWindowPeriodic,
  isWindowStopped,
  projectTaskForDate,
} from './recurrence';

export interface TextSegment {
  text: string;
  highlighted: boolean;
}

export interface SearchResultItem {
  task: Task;
  id: string;
  status: 'active' | 'completed';
  completable: boolean;
  jumpDateStr: string | null;
  notesSnippet?: string;
}

export interface SearchTasksResult {
  query: string;
  tokens: string[];
  active: SearchResultItem[];
  completed: SearchResultItem[];
}

export interface NextOccurrenceCache {
  todayStr: string;
  map: Map<string, string | null>;
}

interface NormalizedIndexMap {
  normalized: string;
  startMap: number[];
  endMap: number[];
}

/** Create a reusable cache for recurring task next-occurrence lookups across keystrokes. */
export function createNextOccurrenceCache(): NextOccurrenceCache {
  return { todayStr: '', map: new Map() };
}

const DIACRITIC_RE = /\p{Diacritic}/gu;
const WHITESPACE_RE = /\s+/;

const normalizedTaskTextCache = new WeakMap<
  Task,
  { title: string; notes: string; normTitle: string; normNotes: string }
>();

/** Case-fold and strip combining diacritical marks after NFD decomposition. */
export function normalizeSearchText(input: string): string {
  return input.normalize('NFD').toLowerCase().replace(DIACRITIC_RE, '');
}

/** Split a trimmed, normalized query into whitespace-delimited search tokens. */
export function tokenizeSearchQuery(query: string): string[] {
  const normalized = normalizeSearchText(query).trim();
  if (!normalized) return [];
  return normalized.split(WHITESPACE_RE);
}

function getNormalizedTaskText(task: Task): { normTitle: string; normNotes: string } {
  const notes = task.notes ?? '';
  const cached = normalizedTaskTextCache.get(task);
  if (cached && cached.title === task.title && cached.notes === notes) {
    return cached;
  }
  const entry = {
    title: task.title,
    notes,
    normTitle: normalizeSearchText(task.title),
    normNotes: notes ? normalizeSearchText(notes) : '',
  };
  normalizedTaskTextCache.set(task, entry);
  return entry;
}

/**
 * Build a normalized string alongside UTF-16 start/end offset maps so matches
 * found in diacritic-stripped, case-folded text slice exact substrings of `raw`.
 */
function buildNormalizedIndexMap(raw: string): NormalizedIndexMap {
  let normalized = '';
  const startMap: number[] = [];
  const endMap: number[] = [];

  let utf16Offset = 0;
  for (const ch of raw) {
    const start = utf16Offset;
    const end = start + ch.length;
    utf16Offset = end;

    const norm = ch.normalize('NFD').toLowerCase().replace(DIACRITIC_RE, '');
    if (norm.length === 0) {
      // Absorb trailing combining marks into the preceding base character's span.
      if (endMap.length > 0) {
        endMap[endMap.length - 1] = end;
      }
      continue;
    }

    for (let i = 0; i < norm.length; i++) {
      normalized += norm[i];
      startMap.push(start);
      endMap.push(end);
    }
  }

  return { normalized, startMap, endMap };
}

function findMatchRanges(text: string, tokens: string[]): Array<[number, number]> {
  if (!text || tokens.length === 0) return [];
  const { normalized, startMap, endMap } = buildNormalizedIndexMap(text);
  if (!normalized) return [];

  const ranges: Array<[number, number]> = [];
  for (const token of tokens) {
    if (!token) continue;
    let searchFrom = 0;
    while (searchFrom <= normalized.length - token.length) {
      const idx = normalized.indexOf(token, searchFrom);
      if (idx === -1) break;
      const origStart = startMap[idx];
      const origEnd = endMap[idx + token.length - 1];
      if (origStart !== undefined && origEnd !== undefined && origEnd > origStart) {
        ranges.push([origStart, origEnd]);
      }
      searchFrom = idx + token.length;
    }
  }

  if (ranges.length === 0) return [];
  ranges.sort((a, b) => a[0] - b[0] || a[1] - b[1]);

  const merged: Array<[number, number]> = [ranges[0]];
  for (let i = 1; i < ranges.length; i++) {
    const [start, end] = ranges[i];
    const last = merged[merged.length - 1];
    if (start <= last[1]) {
      if (end > last[1]) last[1] = end;
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** Split `text` into contiguous plain and highlighted segments for `<mark>` rendering. */
export function splitHighlightSegments(text: string, tokens: string[]): TextSegment[] {
  if (!text) return [];
  const ranges = findMatchRanges(text, tokens);
  if (ranges.length === 0) {
    return [{ text, highlighted: false }];
  }

  const segments: TextSegment[] = [];
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start > cursor) {
      segments.push({ text: text.slice(cursor, start), highlighted: false });
    }
    segments.push({ text: text.slice(start, end), highlighted: true });
    cursor = end;
  }
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), highlighted: false });
  }
  return segments;
}

/**
 * Extract a short single-line window around a matched token in `notes` so CSS
 * line truncation does not hide why the task matched.
 */
export function extractNotesSnippet(
  notes: string | undefined,
  tokens: string[],
  maxLength: number = 96,
  prioritizedTokens?: string[]
): string | undefined {
  if (!notes || tokens.length === 0) return undefined;

  const lines = notes
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return undefined;

  const priorityList = prioritizedTokens && prioritizedTokens.length > 0 ? prioritizedTokens : tokens;
  let chosenLine = '';
  let bestScore = -1;

  for (const line of lines) {
    const normLine = normalizeSearchText(line);
    let priorityHits = 0;
    for (const tok of priorityList) {
      if (normLine.includes(tok)) priorityHits++;
    }
    let totalHits = 0;
    for (const tok of tokens) {
      if (normLine.includes(tok)) totalHits++;
    }
    if (totalHits === 0) continue;
    const score = priorityHits * 100 + totalHits;
    if (score > bestScore) {
      bestScore = score;
      chosenLine = line;
    }
  }

  if (!chosenLine) {
    chosenLine = lines.join(' ');
  }
  if (chosenLine.length <= maxLength) {
    return chosenLine;
  }

  const priorityRanges = findMatchRanges(chosenLine, priorityList);
  const ranges = priorityRanges.length > 0 ? priorityRanges : findMatchRanges(chosenLine, tokens);
  const [matchStart, matchEnd] = ranges[0] ?? [0, 0];

  const leadContext = 24;
  let start = Math.max(0, matchStart - leadContext);
  if (start > 0) {
    // Advance past a cut leading word without skipping past the match itself.
    const nextSpace = chosenLine.indexOf(' ', start);
    if (nextSpace !== -1 && nextSpace + 1 <= matchStart) {
      start = nextSpace + 1;
    }
  }

  let end = Math.min(chosenLine.length, start + maxLength);
  if (end === chosenLine.length && chosenLine.length > maxLength) {
    start = Math.max(0, end - maxLength);
    if (start > 0) {
      const nextSpace = chosenLine.indexOf(' ', start);
      if (nextSpace !== -1 && nextSpace + 1 <= matchStart) {
        start = nextSpace + 1;
      }
    }
  }
  if (matchEnd > end) {
    end = Math.min(chosenLine.length, matchEnd);
  }

  let snippet = chosenLine.slice(start, end).trim();
  if (start > 0) snippet = `…${snippet}`;
  if (end < chosenLine.length) snippet = `${snippet}…`;
  return snippet;
}

function getCachedNextOccurrence(
  task: Task,
  now: Date,
  todayStr: string,
  cache?: NextOccurrenceCache
): string | null {
  if (!cache) {
    return getNextUncompletedOccurrenceDate(task, now);
  }
  if (cache.todayStr !== todayStr) {
    cache.todayStr = todayStr;
    cache.map.clear();
  }
  const rescheduledCount = task.rescheduledDates ? Object.keys(task.rescheduledDates).length : 0;
  const scheduleHistoryCount = task.scheduleHistory?.length ?? 0;
  const key = `${task.id}|${task.updatedAt}|${task.completionHistory.length}|${task.skippedDates?.length ?? 0}|${rescheduledCount}|${scheduleHistoryCount}|${todayStr}`;
  if (cache.map.has(key)) {
    return cache.map.get(key) ?? null;
  }
  const nextDate = getNextUncompletedOccurrenceDate(task, now);
  cache.map.set(key, nextDate);
  return nextDate;
}

interface RankedSearchEntry {
  item: SearchResultItem;
  titleBoost: 0 | 1;
  dueMs: number;
  completedSortTs: number;
}

function makeEndedSeriesEntry(
  task: Task,
  dueAt: string | null | undefined,
  latestCompDate: string | null,
  completedTs: number,
  titleBoost: 0 | 1,
  notesSnippet?: string
): RankedSearchEntry {
  return {
    item: {
      task: {
        ...task,
        dueAt,
        completedAt: completedTs,
      },
      id: task.id,
      status: 'completed',
      completable: false,
      jumpDateStr: latestCompDate,
      notesSnippet,
    },
    titleBoost,
    dueMs: Number.POSITIVE_INFINITY,
    completedSortTs: completedTs,
  };
}

/**
 * Search active and completed tasks across `title` and `notes` using case- and
 * diacritic-insensitive multi-token AND matching.
 */
export function searchTasks(
  tasks: Task[],
  query: string,
  now: Date = new Date(),
  cache?: NextOccurrenceCache
): SearchTasksResult {
  const normalizedQuery = normalizeSearchText(query).trim();
  const tokens = normalizedQuery ? normalizedQuery.split(WHITESPACE_RE) : [];
  if (tokens.length === 0) {
    return { query, tokens: [], active: [], completed: [] };
  }

  const todayStr = formatDate(now);
  const activeEntries: RankedSearchEntry[] = [];
  const completedEntries: RankedSearchEntry[] = [];

  for (const task of tasks) {
    if (task.deletedAt) continue;

    const { normTitle, normNotes } = getNormalizedTaskText(task);

    let allTokensMatched = true;
    const notesOnlyTokens: string[] = [];
    let anyNotesMatch = false;

    for (const token of tokens) {
      const inTitle = normTitle.includes(token);
      const inNotes = normNotes.includes(token);
      if (!inTitle && !inNotes) {
        allTokensMatched = false;
        break;
      }
      if (inNotes) {
        anyNotesMatch = true;
        if (!inTitle) notesOnlyTokens.push(token);
      }
    }
    if (!allTokensMatched) continue;

    const notesSnippet = anyNotesMatch
      ? extractNotesSnippet(task.notes, tokens, 96, notesOnlyTokens)
      : undefined;
    const titleBoost: 0 | 1 =
      normTitle === normalizedQuery || normTitle.startsWith(normalizedQuery) ? 0 : 1;

    // Branch by task kind before getNextUncompletedOccurrenceDate so open undated
    // one-off tasks are never mistaken for ended recurring series.
    if (!isRecurring(task)) {
      if (task.completedAt) {
        const jumpDateStr = task.dueAt ? formatDate(new Date(task.completedAt)) : null;
        completedEntries.push({
          item: {
            task,
            id: task.id,
            status: 'completed',
            completable: true,
            jumpDateStr,
            notesSnippet,
          },
          titleBoost,
          dueMs: Number.POSITIVE_INFINITY,
          completedSortTs: task.completedAt,
        });
      } else {
        const jumpDateStr = task.dueAt ? getDueDatePart(task.dueAt) : null;
        activeEntries.push({
          item: {
            task,
            id: task.id,
            status: 'active',
            completable: true,
            jumpDateStr,
            notesSnippet,
          },
          titleBoost,
          dueMs: task.dueAt ? getDueDeadline(task.dueAt).getTime() : Number.POSITIVE_INFINITY,
          completedSortTs: 0,
        });
      }
      continue;
    }

    if (isWindowPeriodic(task)) {
      if (isWindowStopped(task, now)) {
        const latestCompTs = getLatestCompletionMs(task);
        const latestCompDate = latestCompTs != null ? formatDate(new Date(latestCompTs)) : null;
        completedEntries.push(
          makeEndedSeriesEntry(
            task,
            latestCompDate,
            latestCompDate,
            latestCompTs ?? task.updatedAt,
            titleBoost,
            notesSnippet
          )
        );
      } else {
        activeEntries.push({
          item: {
            task: { ...task, dueAt: null },
            id: task.id,
            status: 'active',
            completable: true,
            jumpDateStr: null,
            notesSnippet,
          },
          titleBoost,
          dueMs: Number.POSITIVE_INFINITY,
          completedSortTs: 0,
        });
      }
      continue;
    }

    const nextDate = getCachedNextOccurrence(task, now, todayStr, cache);
    if (nextDate != null) {
      const projected = projectTaskForDate(task, nextDate);
      activeEntries.push({
        item: {
          task: projected,
          id: task.id,
          status: 'active',
          completable: true,
          jumpDateStr: nextDate,
          notesSnippet,
        },
        titleBoost,
        dueMs: projected.dueAt
          ? getDueDeadline(projected.dueAt).getTime()
          : Number.POSITIVE_INFINITY,
        completedSortTs: 0,
      });
    } else {
      const latestCompTs = getLatestCompletionMs(task);
      const latestCompDate = latestCompTs != null ? formatDate(new Date(latestCompTs)) : null;
      completedEntries.push(
        makeEndedSeriesEntry(
          task,
          latestCompDate ?? task.dueAt,
          latestCompDate,
          latestCompTs ?? task.updatedAt,
          titleBoost,
          notesSnippet
        )
      );
    }
  }

  activeEntries.sort((a, b) => {
    if (a.titleBoost !== b.titleBoost) return a.titleBoost - b.titleBoost;
    if (a.dueMs !== b.dueMs) return a.dueMs - b.dueMs;
    return a.item.task.title.localeCompare(b.item.task.title);
  });

  completedEntries.sort((a, b) => {
    if (a.titleBoost !== b.titleBoost) return a.titleBoost - b.titleBoost;
    if (a.completedSortTs !== b.completedSortTs) return b.completedSortTs - a.completedSortTs;
    return a.item.task.title.localeCompare(b.item.task.title);
  });

  return {
    query,
    tokens,
    active: activeEntries.map((e) => e.item),
    completed: completedEntries.map((e) => e.item),
  };
}
