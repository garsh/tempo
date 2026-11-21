import { describe, it, expect } from 'vitest';
import {
  ACTIVE_VIEW_STORAGE_KEY,
  CALENDAR_EXPANDED_STORAGE_KEY,
  PICKER_FUTURE_YEARS,
  PICKER_PAST_YEARS,
  PICKER_YEAR_COLUMNS,
  buildPickerYears,
  buildWeekCells,
  calendarExpandProgress,
  calendarHeaderTitle,
  classifyCalendarPull,
  commitCalendarExpanded,
  computeMonthTitleSwipeState,
  defaultDateForMonth,
  dueAtForSelectedDay,
  jumpToToday,
  pickerDefaultScrollYear,
  readStoredActiveView,
  readStoredCalendarExpanded,
  saveStoredActiveView,
  saveStoredCalendarExpanded,
  shiftMonthView,
  shiftWeek,
  shortMonthNames,
  stepCalendarView,
} from '../calendarUi';

describe('jump to today', () => {
  it('returns today\'s year/month/dateStr', () => {
    const now = new Date(2026, 9, 6, 15, 30);
    expect(jumpToToday(now)).toEqual({ year: 2026, monthIndex: 9, dateStr: '2026-10-06' });
  });
});

describe('calendar header & due labels', () => {
  it('calendarHeaderTitle always includes the month and year', () => {
    expect(calendarHeaderTitle(2026, 10, 'en-US')).toBe('November 2026');
    expect(calendarHeaderTitle(2027, 0, 'en-US')).toBe('January 2027');
    expect(calendarHeaderTitle(2025, 11, 'en-US')).toBe('December 2025');
  });
});

describe('quick-add dueDate = selected day', () => {
  it('uses the selected calendar day (date-only)', () => {
    expect(dueAtForSelectedDay('2026-10-09')).toBe('2026-10-09');
    expect(dueAtForSelectedDay(null, '2026-10-06')).toBe('2026-10-06');
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

  function createMockStorage() {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) ?? null,
      setItem: (k: string, v: string) => void map.set(k, v),
      map,
    };
  }

  describe('calendar view persistence (week vs month)', () => {

    it('defaults to false (week view) when storage is empty', () => {
      const storage = createMockStorage();
      expect(readStoredCalendarExpanded(storage)).toBe(false);
    });

    it('returns true when storage has month or boolean true', () => {
      const storage = createMockStorage();
      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, 'month');
      expect(readStoredCalendarExpanded(storage)).toBe(true);

      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, 'true');
      expect(readStoredCalendarExpanded(storage)).toBe(true);

      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, '1');
      expect(readStoredCalendarExpanded(storage)).toBe(true);
    });

    it('returns false when storage has week or boolean false', () => {
      const storage = createMockStorage();
      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, 'week');
      expect(readStoredCalendarExpanded(storage)).toBe(false);

      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, 'false');
      expect(readStoredCalendarExpanded(storage)).toBe(false);

      storage.setItem(CALENDAR_EXPANDED_STORAGE_KEY, '0');
      expect(readStoredCalendarExpanded(storage)).toBe(false);
    });

    it('saves month and week representations correctly', () => {
      const storage = createMockStorage();
      saveStoredCalendarExpanded(true, storage);
      expect(storage.getItem(CALENDAR_EXPANDED_STORAGE_KEY)).toBe('month');
      expect(readStoredCalendarExpanded(storage)).toBe(true);

      saveStoredCalendarExpanded(false, storage);
      expect(storage.getItem(CALENDAR_EXPANDED_STORAGE_KEY)).toBe('week');
      expect(readStoredCalendarExpanded(storage)).toBe(false);
    });

    it('handles storage errors gracefully', () => {
      const faultyStorage = {
        getItem: () => {
          throw new Error('Access denied');
        },
        setItem: () => {
          throw new Error('Quota exceeded');
        },
      };
      expect(readStoredCalendarExpanded(faultyStorage)).toBe(false);
      expect(() => saveStoredCalendarExpanded(true, faultyStorage)).not.toThrow();
    });
  });

  describe('active main view storage', () => {
    it('defaults to calendar when unset or invalid', () => {
      const storage = createMockStorage();
      expect(readStoredActiveView(storage)).toBe('calendar');

      storage.setItem(ACTIVE_VIEW_STORAGE_KEY, 'invalid-view');
      expect(readStoredActiveView(storage)).toBe('calendar');
    });

    it('persists and restores tasks and calendar views', () => {
      const storage = createMockStorage();
      saveStoredActiveView('tasks', storage);
      expect(storage.getItem(ACTIVE_VIEW_STORAGE_KEY)).toBe('tasks');
      expect(readStoredActiveView(storage)).toBe('tasks');

      saveStoredActiveView('calendar', storage);
      expect(storage.getItem(ACTIVE_VIEW_STORAGE_KEY)).toBe('calendar');
      expect(readStoredActiveView(storage)).toBe('calendar');
    });

    it('handles storage errors gracefully when reading/saving active view', () => {
      const faultyStorage = {
        getItem: () => {
          throw new Error('Access denied');
        },
        setItem: () => {
          throw new Error('Quota exceeded');
        },
      };
      expect(readStoredActiveView(faultyStorage)).toBe('calendar');
      expect(() => saveStoredActiveView('tasks', faultyStorage)).not.toThrow();
    });
  });
});

describe('calendar pull to expand', () => {
  const expandDelta = 180;

  it('ignores a nudge and treats a sideways move as scrolling', () => {
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 2, dy: 3, atTop: true, onHeader: false, expanded: false })
    ).toBe('pending');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 20, dy: 4, atTop: true, onHeader: false, expanded: false })
    ).toBe('scroll');
  });

  it('pulls the month open only downward from the top, or upward while it is already open', () => {
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: 24, atTop: true, onHeader: false, expanded: false })
    ).toBe('drag');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: 24, atTop: false, onHeader: false, expanded: false })
    ).toBe('scroll');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: -24, atTop: false, onHeader: true, expanded: true })
    ).toBe('drag');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: -24, atTop: false, onHeader: false, expanded: true })
    ).toBe('scroll');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: -24, atTop: true, onHeader: false, expanded: true })
    ).toBe('scroll');
    expect(
      classifyCalendarPull({ mode: 'pending', dx: 0, dy: -24, atTop: true, onHeader: false, expanded: false })
    ).toBe('scroll');
  });

  it('keeps an in-progress drag in drag mode', () => {
    expect(
      classifyCalendarPull({ mode: 'drag', dx: 40, dy: 0, atTop: false, onHeader: false, expanded: false })
    ).toBe('drag');
  });

  it('follows the finger between the week strip and the full month, then snaps', () => {
    expect(calendarExpandProgress(0, expandDelta / 2, expandDelta)).toBeCloseTo(0.5);
    expect(calendarExpandProgress(0, expandDelta * 3, expandDelta)).toBe(1);
    expect(calendarExpandProgress(1, -expandDelta * 3, expandDelta)).toBe(0);

    expect(commitCalendarExpanded(0, 0.25)).toBe(false);
    expect(commitCalendarExpanded(0, 0.26)).toBe(true);
    expect(commitCalendarExpanded(1, 0.74)).toBe(false);
    expect(commitCalendarExpanded(1, 0.75)).toBe(true);
  });
});

describe('month title swipe state', () => {
  it('stays centered and opaque at rest', () => {
    expect(computeMonthTitleSwipeState(0, true, true)).toEqual({
      translatePercent: 0,
      prevOpacity: 0,
      currentOpacity: 1,
      nextOpacity: 0,
    });
  });

  it('tracks left and right drag progress with crossfading opacities', () => {
    const leftDrag = computeMonthTitleSwipeState(-0.4, true, true);
    expect(leftDrag.translatePercent).toBeCloseTo(-40);
    expect(leftDrag.prevOpacity).toBe(0);
    expect(leftDrag.currentOpacity).toBeCloseTo(0.6);
    expect(leftDrag.nextOpacity).toBeCloseTo(0.4);

    const rightDrag = computeMonthTitleSwipeState(0.5, true, true);
    expect(rightDrag.translatePercent).toBeCloseTo(50);
    expect(rightDrag.prevOpacity).toBeCloseTo(0.5);
    expect(rightDrag.currentOpacity).toBeCloseTo(0.5);
    expect(rightDrag.nextOpacity).toBe(0);
  });

  it('clamps overswipe progress to [-1, 1]', () => {
    expect(computeMonthTitleSwipeState(-1.5, true, true)).toEqual({
      translatePercent: -100,
      prevOpacity: 0,
      currentOpacity: 0,
      nextOpacity: 1,
    });
    expect(computeMonthTitleSwipeState(1.5, true, true)).toEqual({
      translatePercent: 100,
      prevOpacity: 1,
      currentOpacity: 0,
      nextOpacity: 0,
    });
  });

  it('keeps the title stationary when swiping in a blocked direction', () => {
    expect(computeMonthTitleSwipeState(0.6, false, true)).toEqual({
      translatePercent: 0,
      prevOpacity: 0,
      currentOpacity: 1,
      nextOpacity: 0,
    });
    expect(computeMonthTitleSwipeState(-0.6, true, false)).toEqual({
      translatePercent: 0,
      prevOpacity: 0,
      currentOpacity: 1,
      nextOpacity: 0,
    });
  });
});

describe('header arrow stepping and month/year picker helpers', () => {
  const mockToday = new Date(2026, 10, 19);

  it('stepCalendarView steps by month when expanded, matching swipe behavior', () => {
    expect(
      stepCalendarView({
        expanded: true,
        year: 2026,
        monthIndex: 10,
        selectedDateStr: '2026-11-19',
        delta: 1,
        today: mockToday,
      })
    ).toEqual({ dateStr: '2026-12-01', year: 2026, monthIndex: 11 });

    expect(
      stepCalendarView({
        expanded: true,
        year: 2026,
        monthIndex: 11,
        selectedDateStr: '2026-12-01',
        delta: -1,
        today: mockToday,
      })
    ).toEqual({ dateStr: '2026-11-19', year: 2026, monthIndex: 10 });
  });

  it('stepCalendarView steps by 7 days when collapsed, across month and year boundaries', () => {
    expect(
      stepCalendarView({
        expanded: false,
        year: 2026,
        monthIndex: 10,
        selectedDateStr: '2026-11-19',
        delta: 1,
        today: mockToday,
      })
    ).toEqual({ dateStr: '2026-11-26', year: 2026, monthIndex: 10 });

    expect(
      stepCalendarView({
        expanded: false,
        year: 2026,
        monthIndex: 11,
        selectedDateStr: '2026-12-28',
        delta: 1,
        today: mockToday,
      })
    ).toEqual({ dateStr: '2027-01-04', year: 2027, monthIndex: 0 });

    expect(
      stepCalendarView({
        expanded: false,
        year: 2026,
        monthIndex: 0,
        selectedDateStr: '2026-01-03',
        delta: -1,
        today: mockToday,
      })
    ).toEqual({ dateStr: '2025-12-27', year: 2025, monthIndex: 11 });
  });

  it('shortMonthNames returns 12 localized month names', () => {
    const names = shortMonthNames('en-US');
    expect(names).toHaveLength(12);
    expect(names[0]).toBe('Jan');
    expect(names[11]).toBe('Dec');
  });

  it('buildPickerYears places past years before currentYear and aligns currentYear to column 0', () => {
    const years = buildPickerYears(2026);
    expect(years[0]).toBeLessThanOrEqual(2026 - PICKER_PAST_YEARS);
    expect(years[years.length - 1]).toBeGreaterThanOrEqual(2026 + PICKER_FUTURE_YEARS);
    const currentIndex = years.indexOf(2026);
    expect(currentIndex).toBeGreaterThan(0);
    expect(currentIndex % PICKER_YEAR_COLUMNS).toBe(0);
    expect(years.length % PICKER_YEAR_COLUMNS).toBe(0);
  });

  it('buildPickerYears expands when selectedYear is outside the default range', () => {
    const pastYears = buildPickerYears(2026, 1940);
    expect(pastYears).toContain(1940);
    expect(pastYears.indexOf(2026) % PICKER_YEAR_COLUMNS).toBe(0);

    const futureYears = buildPickerYears(2026, 2120);
    expect(futureYears).toContain(2120);
    expect(futureYears.indexOf(2026) % PICKER_YEAR_COLUMNS).toBe(0);
  });

  it('pickerDefaultScrollYear anchors at currentYear by default and row-start for outside years', () => {
    expect(pickerDefaultScrollYear(2026, 2026)).toBe(2026);
    expect(pickerDefaultScrollYear(2030, 2026)).toBe(2026);
    expect(pickerDefaultScrollYear(2037, 2026)).toBe(2026);
    expect(pickerDefaultScrollYear(2025, 2026)).toBe(2022);
    expect(pickerDefaultScrollYear(2040, 2026)).toBe(2038);
  });
});
