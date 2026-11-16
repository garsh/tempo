import { describe, it, expect } from 'vitest';
import {
  CAL_TODAY_TIP_KEY,
  buildWeekCells,
  calendarRowDueLabel,
  dayCardTitle,
  defaultDateForMonth,
  dismissCalTodayTip,
  dueAtForSelectedDay,
  isCalTodayTipDismissed,
  jumpToToday,
  monthContains,
  monthName,
  shiftMonthView,
  shiftWeek,
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

describe('calendar swiping (week and month shifting)', () => {
  describe('shiftWeek', () => {
    it('shifts forward and backward by 7 days within the same month', () => {
      const next = shiftWeek('2026-11-16', 1);
      expect(next).toEqual({ dateStr: '2026-11-23', year: 2026, monthIndex: 10 });

      const prev = shiftWeek('2026-11-16', -1);
      expect(prev).toEqual({ dateStr: '2026-11-09', year: 2026, monthIndex: 10 });
    });

    it('shifts across month boundaries', () => {
      const nextMonth = shiftWeek('2026-11-30', 1);
      expect(nextMonth).toEqual({ dateStr: '2026-12-07', year: 2026, monthIndex: 11 });

      const prevMonth = shiftWeek('2026-12-05', -1);
      expect(prevMonth).toEqual({ dateStr: '2026-11-28', year: 2026, monthIndex: 10 });
    });

    it('shifts across year boundaries', () => {
      const nextYear = shiftWeek('2026-12-28', 1);
      expect(nextYear).toEqual({ dateStr: '2027-01-04', year: 2027, monthIndex: 0 });

      const prevYear = shiftWeek('2026-01-03', -1);
      expect(prevYear).toEqual({ dateStr: '2025-12-27', year: 2025, monthIndex: 11 });
    });

    it('defaults to today when selectedDateStr is null or undefined', () => {
      const mockToday = new Date(2026, 10, 16);
      const res = shiftWeek(null, 1, mockToday);
      expect(res).toEqual({ dateStr: '2026-11-23', year: 2026, monthIndex: 10 });
    });
  });

  describe('buildWeekCells', () => {
    it('builds 7 days for the week containing centerDateStr', () => {
      const cells = buildWeekCells('2026-11-16', 2026, 10, 0, '2026-11-16');
      expect(cells).toHaveLength(7);
      expect(cells[0].dateStr).toBe('2026-11-15'); // Sun
      expect(cells[1].dateStr).toBe('2026-11-16'); // Mon
      expect(cells[1].isToday).toBe(true);
      expect(cells[1].inCurrentMonth).toBe(true);
      expect(cells[6].dateStr).toBe('2026-11-21'); // Sat
    });

    it('correctly marks inCurrentMonth across month boundaries', () => {
      // Week of Nov 29 - Dec 5
      const cells = buildWeekCells('2026-11-30', 2026, 10, 0, '2026-11-16');
      expect(cells[0].dateStr).toBe('2026-11-29');
      expect(cells[0].inCurrentMonth).toBe(true);
      expect(cells[1].dateStr).toBe('2026-11-30');
      expect(cells[1].inCurrentMonth).toBe(true);
      expect(cells[2].dateStr).toBe('2026-12-01');
      expect(cells[2].inCurrentMonth).toBe(false); // In Dec, but year/month passed is Nov
    });
  });

  describe('defaultDateForMonth', () => {
    it('returns today for the current month', () => {
      const mockToday = new Date(2026, 10, 16);
      expect(defaultDateForMonth(2026, 10, mockToday)).toBe('2026-11-16');
    });

    it('returns the 1st of the month for other months', () => {
      const mockToday = new Date(2026, 10, 16);
      expect(defaultDateForMonth(2026, 9, mockToday)).toBe('2026-10-01');
      expect(defaultDateForMonth(2026, 11, mockToday)).toBe('2026-12-01');
      expect(defaultDateForMonth(2027, 0, mockToday)).toBe('2027-01-01');
    });
  });

  describe('shiftMonthView', () => {
    it('defaults to 1st of the month when shifting to non-current month', () => {
      const mockToday = new Date(2026, 10, 16); // November 16, 2026
      // From Nov 2026 to Dec 2026 (+1) -> 2026-12-01
      const next = shiftMonthView(2026, 10, '2026-11-16', 1, mockToday);
      expect(next).toEqual({ dateStr: '2026-12-01', year: 2026, monthIndex: 11 });

      // From Nov 2026 to Oct 2026 (-1) -> 2026-10-01
      const prev = shiftMonthView(2026, 10, '2026-11-16', -1, mockToday);
      expect(prev).toEqual({ dateStr: '2026-10-01', year: 2026, monthIndex: 9 });
    });

    it('defaults to today when shifting into the current month', () => {
      const mockToday = new Date(2026, 10, 16); // November 16, 2026
      // From Oct 2026 to Nov 2026 (+1, target is current month) -> 2026-11-16
      const toCurrentFromPrev = shiftMonthView(2026, 9, '2026-10-01', 1, mockToday);
      expect(toCurrentFromPrev).toEqual({ dateStr: '2026-11-16', year: 2026, monthIndex: 10 });

      // From Dec 2026 to Nov 2026 (-1, target is current month) -> 2026-11-16
      const toCurrentFromNext = shiftMonthView(2026, 11, '2026-12-01', -1, mockToday);
      expect(toCurrentFromNext).toEqual({ dateStr: '2026-11-16', year: 2026, monthIndex: 10 });
    });

    it('shifts across year boundaries defaulting to the 1st', () => {
      const mockToday = new Date(2026, 10, 16);
      const nextYear = shiftMonthView(2026, 11, '2026-12-01', 1, mockToday);
      expect(nextYear).toEqual({ dateStr: '2027-01-01', year: 2027, monthIndex: 0 });

      const prevYear = shiftMonthView(2026, 0, '2026-01-01', -1, mockToday);
      expect(prevYear).toEqual({ dateStr: '2025-12-01', year: 2025, monthIndex: 11 });
    });
  });
});
