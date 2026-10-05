import type { TaskPriority } from '../types/task';
import { combineDueAt, formatDate, addDays, startOfDay } from './recurrence';

export type ParsedCapture = {
  title: string;
  dueAt: string | null;
  priority: TaskPriority;
  tags: string[];
  /** Residual notes if any structured bits were stripped. */
  notes?: string;
};

const WEEKDAY_NAMES: Record<string, number> = {
  sunday: 0,
  sun: 0,
  monday: 1,
  mon: 1,
  tuesday: 2,
  tue: 2,
  tues: 2,
  wednesday: 3,
  wed: 3,
  thursday: 4,
  thu: 4,
  thur: 4,
  thurs: 4,
  friday: 5,
  fri: 5,
  saturday: 6,
  sat: 6,
};

function nextWeekday(from: Date, weekday: number): Date {
  const d = startOfDay(from);
  const diff = (weekday - d.getDay() + 7) % 7 || 7; // always future (next occurrence)
  return addDays(d, diff);
}

function parseTimeToken(token: string): string | null {
  // 3pm, 15:30, 9am, 3:00pm
  const m = token.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const ap = m[3]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!ap && h > 23) return null;
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

/**
 * Light NLP for quick capture.
 * Understands: today, tomorrow, yesterday, next <weekday>, in N days/weeks,
 * weekday names, times (3pm / 15:30), #tags, !high/!medium/!low priority,
 * and p1/p2/p3.
 */
export function parseQuickCapture(input: string, now: Date = new Date()): ParsedCapture {
  let remaining = input.trim();
  const tags: string[] = [];
  let priority: TaskPriority = 'none';
  let dueDate: string | null = null;
  let dueTime: string | null = null;

  // Extract #tags
  remaining = remaining.replace(/#([\w-]+)/g, (_, tag: string) => {
    tags.push(tag);
    return ' ';
  });

  // Priority tokens
  const priPatterns: [RegExp, TaskPriority][] = [
    [/(^|\s)!high\b/gi, 'high'],
    [/(^|\s)!medium\b/gi, 'medium'],
    [/(^|\s)!med\b/gi, 'medium'],
    [/(^|\s)!low\b/gi, 'low'],
    [/\bp1\b/gi, 'high'],
    [/\bp2\b/gi, 'medium'],
    [/\bp3\b/gi, 'low'],
  ];
  for (const [re, p] of priPatterns) {
    if (remaining.match(re)) {
      priority = p;
      // Keep leading whitespace from the capture group when present
      remaining = remaining.replace(re, (_full, lead) => (typeof lead === 'string' ? lead : ' '));
    }
  }

  // Normalize whitespace for token scanning
  remaining = remaining.replace(/\s+/g, ' ').trim();

  const tryConsume = (re: RegExp, apply: (m: RegExpMatchArray) => void) => {
    const m = remaining.match(re);
    if (!m || m.index == null) return false;
    apply(m);
    remaining = (remaining.slice(0, m.index) + ' ' + remaining.slice(m.index + m[0].length))
      .replace(/\s+/g, ' ')
      .trim();
    return true;
  };

  // today / tomorrow / yesterday
  tryConsume(/\b(today|tomorrow|yesterday)\b/i, (m) => {
    const word = m[1].toLowerCase();
    if (word === 'today') dueDate = formatDate(now);
    else if (word === 'tomorrow') dueDate = formatDate(addDays(now, 1));
    else dueDate = formatDate(addDays(now, -1));
  });

  // in N days/weeks
  tryConsume(/\bin\s+(\d+)\s+(days?|weeks?)\b/i, (m) => {
    const n = parseInt(m[1], 10);
    const unit = m[2].toLowerCase();
    const days = unit.startsWith('week') ? n * 7 : n;
    dueDate = formatDate(addDays(now, days));
  });

  // next monday / next fri
  tryConsume(/\bnext\s+(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i, (m) => {
    const wd = WEEKDAY_NAMES[m[1].toLowerCase()];
    if (wd != null) dueDate = formatDate(nextWeekday(now, wd));
  });

  // bare weekday (this week's upcoming or next week)
  if (!dueDate) {
    tryConsume(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tue|tues|wed|thu|thur|thurs|fri|sat)\b/i,
      (m) => {
        const wd = WEEKDAY_NAMES[m[1].toLowerCase()];
        if (wd == null) return;
        const todayWd = now.getDay();
        const delta = (wd - todayWd + 7) % 7; // 0 = today
        dueDate = formatDate(addDays(now, delta));
      }
    );
  }

  // time tokens
  tryConsume(/\b(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i, (m) => {
    const t = parseTimeToken(m[1].replace(/\s+/g, ''));
    if (t) {
      dueTime = t;
      if (!dueDate) dueDate = formatDate(now);
    }
  });

  const title = remaining.replace(/\s+/g, ' ').trim() || input.trim();
  const dueAt = dueDate ? combineDueAt(dueDate, dueTime) : null;

  return { title, dueAt, priority, tags };
}
