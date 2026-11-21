import { describe, it, expect, vi } from 'vitest';
import {
  shiftMonthView,
  shiftWeek,
  jumpToToday,
  dueAtForSelectedDay,
  buildWeekCells,
  readStoredCalendarExpanded,
  saveStoredCalendarExpanded,
  CALENDAR_EXPANDED_STORAGE_KEY,
} from '../../domain/calendarUi';
import { buildMonthGrid } from '../../domain/calendar';

/**
 * Calendar Carousel Drag & Interaction Model.
 * Simulates month navigation and carousel snap transitions.
 */
export class CalendarDragMachine {
  private dragOffset = 0;
  private isDragging = false;
  private direction: 'none' | 'horizontal' | 'vertical' = 'none';
  private startX = 0;
  private startY = 0;
  private startTime = 0;
  private readonly containerWidth: number;
  private readonly onNavigate?: (delta: -1 | 0 | 1) => void;

  constructor(
    containerWidth: number = 360,
    onNavigate?: (delta: -1 | 0 | 1) => void
  ) {
    this.containerWidth = containerWidth;
    this.onNavigate = onNavigate;
  }

  public getOffset(): number {
    return this.dragOffset;
  }

  public getDirection(): 'none' | 'horizontal' | 'vertical' {
    return this.direction;
  }

  public onDragStart(clientX: number, clientY: number, time: number = Date.now()): void {
    this.startX = clientX;
    this.startY = clientY;
    this.startTime = time;
    this.direction = 'none';
    this.dragOffset = 0;
    this.isDragging = true;
  }

  public onDragMove(clientX: number, clientY: number): { prevented: boolean; offset: number } {
    if (!this.isDragging) return { prevented: false, offset: 0 };

    const dx = clientX - this.startX;
    const dy = clientY - this.startY;

    if (this.direction === 'none') {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        this.direction = 'horizontal';
      } else if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
        this.direction = 'vertical';
      }
    }

    if (this.direction === 'horizontal') {
      this.dragOffset = dx;
      return { prevented: true, offset: dx };
    }

    return { prevented: false, offset: 0 };
  }

  public onDragEnd(clientX: number, time: number = Date.now()): { targetDelta: -1 | 0 | 1 } {
    this.isDragging = false;
    const dir = this.direction;
    this.direction = 'none';

    if (dir !== 'horizontal') {
      this.dragOffset = 0;
      return { targetDelta: 0 };
    }

    const dx = clientX - this.startX;
    const dt = Math.max(1, time - this.startTime);
    const velocity = dx / dt;
    const threshold = this.containerWidth * 0.18; // 64.8px

    let targetDelta: -1 | 0 | 1 = 0;

    // In calendar navigation:
    // Dragging left (negative dx) reveals next month (delta = +1)
    // Dragging right (positive dx) reveals previous month (delta = -1)
    if (dx <= -threshold || velocity < -0.3) {
      targetDelta = 1; // Next month
    } else if (dx >= threshold || velocity > 0.3) {
      targetDelta = -1; // Prev month
    } else {
      targetDelta = 0; // Snap back
    }

    this.dragOffset = 0;
    this.onNavigate?.(targetDelta);
    return { targetDelta };
  }
}

describe('Calendar Month & Week Navigation Interactions', () => {
  describe('Drag & Snap State Machine', () => {
    it('snaps to next month when dragged left past 18% threshold', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      const move = machine.onDragMove(130, 102); // dx = -70 (< -64.8)
      expect(move.prevented).toBe(true);
      expect(move.offset).toBe(-70);

      const end = machine.onDragEnd(130, 1400); // dt = 400ms (slow drag)
      expect(end.targetDelta).toBe(1);
      expect(onNavigate).toHaveBeenCalledWith(1);
      expect(machine.getOffset()).toBe(0);
    });

    it('snaps to previous month when dragged right past 18% threshold', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      machine.onDragMove(275, 102); // dx = +75 (> +64.8)

      const end = machine.onDragEnd(275, 1400);
      expect(end.targetDelta).toBe(-1);
      expect(onNavigate).toHaveBeenCalledWith(-1);
    });

    it('snaps on quick velocity flick left even below distance threshold', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      machine.onDragMove(165, 101); // dx = -35 (< threshold 64.8px)

      // Released after 80ms -> velocity = -35 / 80 = -0.4375 (< -0.3)
      const end = machine.onDragEnd(165, 1080);
      expect(end.targetDelta).toBe(1);
      expect(onNavigate).toHaveBeenCalledWith(1);
    });

    it('snaps on quick velocity flick right even below distance threshold', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      machine.onDragMove(235, 101); // dx = +35

      // Released after 80ms -> velocity = +35 / 80 = +0.4375 (> 0.3)
      const end = machine.onDragEnd(235, 1080);
      expect(end.targetDelta).toBe(-1);
      expect(onNavigate).toHaveBeenCalledWith(-1);
    });

    it('snaps back to 0 when dragged slowly below distance threshold', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      machine.onDragMove(170, 100); // dx = -30

      const end = machine.onDragEnd(170, 1400); // dt = 400ms -> velocity = -0.075
      expect(end.targetDelta).toBe(0);
      expect(onNavigate).toHaveBeenCalledWith(0);
    });

    it('vertical gesture does not trigger horizontal calendar navigation', () => {
      const onNavigate = vi.fn();
      const machine = new CalendarDragMachine(360, onNavigate);

      machine.onDragStart(200, 100, 1000);
      const move = machine.onDragMove(205, 160); // dy = 60, dx = 5
      expect(move.prevented).toBe(false);
      expect(move.offset).toBe(0);
      expect(machine.getDirection()).toBe('vertical');

      const end = machine.onDragEnd(205, 1300);
      expect(end.targetDelta).toBe(0);
      expect(onNavigate).not.toHaveBeenCalled();
    });
  });

  describe('Year and Month Boundary Navigation', () => {
    const fixedToday = new Date(2026, 10, 17); // Nov 17 2026

    it('shifts backward across year boundary from Jan 2026 to Dec 2025', () => {
      const res = shiftMonthView(2026, 0, '2026-01-15', -1, fixedToday);
      expect(res.year).toBe(2025);
      expect(res.monthIndex).toBe(11);
      expect(res.dateStr).toBe('2025-12-01');
    });

    it('shifts forward across year boundary from Dec 2026 to Jan 2027', () => {
      const res = shiftMonthView(2026, 11, '2026-12-15', 1, fixedToday);
      expect(res.year).toBe(2027);
      expect(res.monthIndex).toBe(0);
      expect(res.dateStr).toBe('2027-01-01');
    });

    it('defaults to today when navigating into the current calendar month', () => {
      // Navigating forward from Oct 2026 to Nov 2026 (current month)
      const res = shiftMonthView(2026, 9, '2026-10-01', 1, fixedToday);
      expect(res.year).toBe(2026);
      expect(res.monthIndex).toBe(10);
      expect(res.dateStr).toBe('2026-11-17'); // Today, not 1st
    });

    it('jumpToToday resets to current year, month, and date', () => {
      const res = jumpToToday(fixedToday);
      expect(res).toEqual({
        year: 2026,
        monthIndex: 10,
        dateStr: '2026-11-17',
      });
    });
  });

  describe('Grid Cell Selection & Context Updates', () => {
    it('calculates dueAt for selected date correctly', () => {
      expect(dueAtForSelectedDay('2026-11-20', '2026-11-17')).toBe('2026-11-20');
      expect(dueAtForSelectedDay(null, '2026-11-17')).toBe('2026-11-17');
    });

    it('identifies leading and trailing cells in 42-day month grid', () => {
      // Nov 1 2026 is Sunday -> weekStart 0 means first cell is Nov 1
      const gridNov = buildMonthGrid(2026, 10, new Date(2026, 10, 17), 0);
      expect(gridNov).toHaveLength(42);
      expect(gridNov[0].dateStr).toBe('2026-11-01');
      expect(gridNov[0].inCurrentMonth).toBe(true);

      // Dec 1 2026 is Tuesday -> weekStart 0 has leading Nov 29 & Nov 30
      const gridDec = buildMonthGrid(2026, 11, new Date(2026, 10, 17), 0);
      expect(gridDec[0].dateStr).toBe('2026-11-29');
      expect(gridDec[0].inCurrentMonth).toBe(false); // leading cell
      expect(gridDec[2].dateStr).toBe('2026-12-01');
      expect(gridDec[2].inCurrentMonth).toBe(true);
    });
  });

  describe('Collapsed Week Navigation Mode', () => {
    const fixedToday = new Date(2026, 10, 17);

    it('shifts week forward by exactly 7 days', () => {
      const res = shiftWeek('2026-11-17', 1, fixedToday);
      expect(res.dateStr).toBe('2026-11-24');
      expect(res.year).toBe(2026);
      expect(res.monthIndex).toBe(10);
    });

    it('shifts week backward across month boundary', () => {
      const res = shiftWeek('2026-11-03', -1, fixedToday);
      expect(res.dateStr).toBe('2026-10-27');
      expect(res.year).toBe(2026);
      expect(res.monthIndex).toBe(9); // October
    });

    it('buildWeekCells constructs exactly 7 consecutive days', () => {
      const cells = buildWeekCells('2026-11-17', 2026, 10, 0, '2026-11-17');
      expect(cells).toHaveLength(7);
      expect(cells[0].dateStr).toBe('2026-11-15'); // Sunday
      expect(cells[2].dateStr).toBe('2026-11-17'); // Tuesday
      expect(cells[2].isToday).toBe(true);
      expect(cells[6].dateStr).toBe('2026-11-21'); // Saturday
    });
  });

  describe('Calendar Expanded State Storage Persistence', () => {
    it('defaults to collapsed (false) when storage is empty', () => {
      const mockStorage: Record<string, string> = {};
      const storage = {
        getItem: (k: string) => mockStorage[k] ?? null,
      };
      expect(readStoredCalendarExpanded(storage)).toBe(false);
    });

    it('reads month view when set to month or true', () => {
      const mockStorage: Record<string, string> = {
        [CALENDAR_EXPANDED_STORAGE_KEY]: 'month',
      };
      const storage = {
        getItem: (k: string) => mockStorage[k] ?? null,
      };
      expect(readStoredCalendarExpanded(storage)).toBe(true);

      mockStorage[CALENDAR_EXPANDED_STORAGE_KEY] = 'true';
      expect(readStoredCalendarExpanded(storage)).toBe(true);
    });

    it('writes month or week string to storage', () => {
      const mockStorage: Record<string, string> = {};
      const storage = {
        setItem: (k: string, v: string) => {
          mockStorage[k] = v;
        },
      };

      saveStoredCalendarExpanded(true, storage);
      expect(mockStorage[CALENDAR_EXPANDED_STORAGE_KEY]).toBe('month');

      saveStoredCalendarExpanded(false, storage);
      expect(mockStorage[CALENDAR_EXPANDED_STORAGE_KEY]).toBe('week');
    });
  });
});
