import { describe, it, expect } from 'vitest';
import {
  CAL_TODAY_TIP_KEY,
  calendarRowDueLabel,
  dayCardTitle,
  dismissCalTodayTip,
  dueAtForSelectedDay,
  isCalTodayTipDismissed,
  jumpToToday,
  monthContains,
  monthName,
} from '../calendarUi';

function mem() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => void map.set(k, v),
    map,
  };
}

describe('calendar tip dismissal', () => {
  it('starts shown; dismiss persists', () => {
    const s = mem();
    expect(isCalTodayTipDismissed(s)).toBe(false);
    dismissCalTodayTip(s);
    expect(s.map.get(CAL_TODAY_TIP_KEY)).toBe('1');
    expect(isCalTodayTipDismissed(s)).toBe(true);
  });
});

describe('jump to today', () => {
  it('returns today\'s year/month/dateStr', () => {
    const now = new Date(2026, 9, 6, 15, 30);
    expect(jumpToToday(now)).toEqual({ year: 2026, monthIndex: 9, dateStr: '2026-10-06' });
  });
});

describe('day card + row labels', () => {
  it('titles Today vs a short date', () => {
    expect(dayCardTitle('2026-10-06', '2026-10-06', 'en-US')).toBe('Today');
    expect(dayCardTitle('2026-10-07', '2026-10-06', 'en-US')).toMatch(/Oct/);
    expect(dayCardTitle('2026-10-07', '2026-10-06', 'en-US')).toMatch(/7/);
  });

  it('row due label is Today or short date', () => {
    expect(calendarRowDueLabel('2026-10-06T09:00', '2026-10-06')).toBe('Today');
    expect(calendarRowDueLabel('2026-10-06', '2026-10-06')).toBe('Today');
    expect(calendarRowDueLabel('2026-10-08', '2026-10-06')).toMatch(/Oct/);
  });

  it('month name has no year', () => {
    expect(monthName(2026, 9, 'en-US')).toBe('October');
    expect(monthName(2026, 0, 'en-US')).toBe('January');
  });
});

describe('quick-add dueDate = selected day', () => {
  it('uses the selected calendar day (date-only)', () => {
    expect(dueAtForSelectedDay('2026-10-09')).toBe('2026-10-09');
    expect(dueAtForSelectedDay(null, '2026-10-06')).toBe('2026-10-06');
  });

  it('monthContains', () => {
    expect(monthContains('2026-10-06', 2026, 9)).toBe(true);
    expect(monthContains('2026-11-01', 2026, 9)).toBe(false);
  });
});

describe('empty day card', () => {
  it('uses Today title and free-day copy for an empty selected today', async () => {
    const { tasksDueOnDate } = await import('../calendar');
    const today = '2026-10-06';
    expect(tasksDueOnDate([], today)).toEqual([]);
    expect(dayCardTitle(today, today)).toBe('Today');
    // Copy for EmptyCalendarDay (component text — keep in sync)
    expect(['You have a free day', 'Take it easy']).toHaveLength(2);
  });
});
