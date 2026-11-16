import { describe, it, expect } from 'vitest';
import { shiftMonthView, shiftWeek } from '../../domain/calendarUi';

describe('Calendar Swipe Gestures (Month & Week Navigation)', () => {
  describe('Month Swiping (when full month is visible)', () => {
    const mockToday = new Date(2026, 10, 16); // November 16, 2026

    it('swiping left moves to the next month defaulting to the 1st', () => {
      // Viewing November 2026 (current month) -> December 2026 (1st)
      const result = shiftMonthView(2026, 10, '2026-11-16', 1, mockToday);
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(11); // December
      expect(result.dateStr).toBe('2026-12-01');
    });

    it('swiping right moves to the previous month defaulting to the 1st', () => {
      // Viewing November 2026 (current month) -> October 2026 (1st)
      const result = shiftMonthView(2026, 10, '2026-11-16', -1, mockToday);
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(9); // October
      expect(result.dateStr).toBe('2026-10-01');
    });

    it('swiping into the current month defaults to today', () => {
      // Viewing December 2026 -> November 2026 (-1, current month)
      const fromNext = shiftMonthView(2026, 11, '2026-12-01', -1, mockToday);
      expect(fromNext.year).toBe(2026);
      expect(fromNext.monthIndex).toBe(10);
      expect(fromNext.dateStr).toBe('2026-11-16');

      // Viewing October 2026 -> November 2026 (+1, current month)
      const fromPrev = shiftMonthView(2026, 9, '2026-10-01', 1, mockToday);
      expect(fromPrev.year).toBe(2026);
      expect(fromPrev.monthIndex).toBe(10);
      expect(fromPrev.dateStr).toBe('2026-11-16');
    });

    it('swiping left across a year boundary advances the year and sets date to Jan 1', () => {
      // Viewing December 2026 -> January 2027
      const result = shiftMonthView(2026, 11, '2026-12-01', 1, mockToday);
      expect(result.year).toBe(2027);
      expect(result.monthIndex).toBe(0); // January
      expect(result.dateStr).toBe('2027-01-01');
    });

    it('swiping right across a year boundary retreats the year and sets date to Dec 1', () => {
      // Viewing January 2026 -> December 2025
      const result = shiftMonthView(2026, 0, '2026-01-01', -1, mockToday);
      expect(result.year).toBe(2025);
      expect(result.monthIndex).toBe(11); // December
      expect(result.dateStr).toBe('2025-12-01');
    });
  });

  describe('Week Swiping (when only a week is visible)', () => {
    it('swiping left moves forward by 7 days to next week', () => {
      // Selected Mon Nov 16, 2026
      const result = shiftWeek('2026-11-16', 1);
      expect(result.dateStr).toBe('2026-11-23');
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(10);
    });

    it('swiping right moves backward by 7 days to previous week', () => {
      // Selected Mon Nov 16, 2026
      const result = shiftWeek('2026-11-16', -1);
      expect(result.dateStr).toBe('2026-11-09');
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(10);
    });

    it('swiping left across month boundary transitions monthIndex and year', () => {
      // Selected Mon Nov 30, 2026 -> Mon Dec 7, 2026
      const result = shiftWeek('2026-11-30', 1);
      expect(result.dateStr).toBe('2026-12-07');
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(11); // December
    });

    it('swiping right across month boundary transitions monthIndex', () => {
      // Selected Wed Dec 2, 2026 -> Wed Nov 25, 2026
      const result = shiftWeek('2026-12-02', -1);
      expect(result.dateStr).toBe('2026-11-25');
      expect(result.year).toBe(2026);
      expect(result.monthIndex).toBe(10); // November
    });

    it('swiping left across year boundary transitions year and monthIndex', () => {
      // Selected Thu Dec 31, 2026 -> Thu Jan 7, 2027
      const result = shiftWeek('2026-12-31', 1);
      expect(result.dateStr).toBe('2027-01-07');
      expect(result.year).toBe(2027);
      expect(result.monthIndex).toBe(0); // January
    });

    it('swiping right across year boundary transitions year and monthIndex', () => {
      // Selected Fri Jan 1, 2026 -> Fri Dec 25, 2025
      const result = shiftWeek('2026-01-01', -1);
      expect(result.dateStr).toBe('2025-12-25');
      expect(result.year).toBe(2025);
      expect(result.monthIndex).toBe(11); // December
    });
  });

  describe('Swipe Threshold & Gesture Discrimination Logic', () => {
    const SWIPE_THRESHOLD = 36;

    const evaluateSwipe = (
      dx: number,
      dy: number,
      expanded: boolean,
      currentYear: number,
      currentMonth: number,
      currentSelectedDate: string
    ) => {
      const isHorizontal = Math.abs(dx) >= SWIPE_THRESHOLD && Math.abs(dx) > Math.abs(dy);
      if (!isHorizontal) return null;

      const delta = dx < 0 ? 1 : -1;
      return expanded
        ? shiftMonthView(currentYear, currentMonth, currentSelectedDate, delta)
        : shiftWeek(currentSelectedDate, delta);
    };

    it('triggers next month (1st of month) when expanded and swiped left past threshold', () => {
      const res = evaluateSwipe(-50, 5, true, 2026, 10, '2026-11-16');
      expect(res).toEqual({ dateStr: '2026-12-01', year: 2026, monthIndex: 11 });
    });

    it('triggers prev month (1st of month) when expanded and swiped right past threshold', () => {
      const res = evaluateSwipe(50, 8, true, 2026, 10, '2026-11-16');
      expect(res).toEqual({ dateStr: '2026-10-01', year: 2026, monthIndex: 9 });
    });

    it('triggers next week when collapsed (only week visible) and swiped left', () => {
      const res = evaluateSwipe(-45, 10, false, 2026, 10, '2026-11-16');
      expect(res).toEqual({ dateStr: '2026-11-23', year: 2026, monthIndex: 10 });
    });

    it('triggers prev week when collapsed (only week visible) and swiped right', () => {
      const res = evaluateSwipe(45, 10, false, 2026, 10, '2026-11-16');
      expect(res).toEqual({ dateStr: '2026-11-09', year: 2026, monthIndex: 10 });
    });

    it('does not trigger swipe if horizontal distance is below threshold', () => {
      const res = evaluateSwipe(-20, 2, false, 2026, 10, '2026-11-16');
      expect(res).toBeNull();
    });

    it('does not trigger swipe if vertical movement dominates (vertical scroll or expand)', () => {
      const res = evaluateSwipe(-45, 60, false, 2026, 10, '2026-11-16');
      expect(res).toBeNull();
    });
  });

  describe('Carousel Continuous Drag & Snap Logic', () => {
    const calculateSnapTarget = (
      dx: number,
      dt: number,
      containerWidth: number = 360
    ): -1 | 0 | 1 => {
      const velocity = dx / Math.max(1, dt);
      if (dx <= -containerWidth * 0.18 || velocity < -0.3) {
        return 1; // Next
      }
      if (dx >= containerWidth * 0.18 || velocity > 0.3) {
        return -1; // Prev
      }
      return 0; // Snap back
    };

    it('snaps to next page when dragged left past 18% of width', () => {
      // 360 * 0.18 = 64.8px. Drag -70px
      const target = calculateSnapTarget(-70, 400, 360);
      expect(target).toBe(1);
    });

    it('snaps to prev page when dragged right past 18% of width', () => {
      const target = calculateSnapTarget(70, 400, 360);
      expect(target).toBe(-1);
    });

    it('snaps to next page on quick flick even below distance threshold', () => {
      // -35px in 80ms => velocity = -0.4375 px/ms (< -0.3)
      const target = calculateSnapTarget(-35, 80, 360);
      expect(target).toBe(1);
    });

    it('snaps to prev page on quick flick right even below distance threshold', () => {
      // 35px in 80ms => velocity = 0.4375 px/ms (> 0.3)
      const target = calculateSnapTarget(35, 80, 360);
      expect(target).toBe(-1);
    });

    it('snaps back to 0 when dragged slowly below distance threshold', () => {
      // -30px in 300ms => velocity = -0.1 px/ms
      const target = calculateSnapTarget(-30, 300, 360);
      expect(target).toBe(0);
    });
  });
});
