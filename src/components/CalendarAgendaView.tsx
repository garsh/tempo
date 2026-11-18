import { useCallback, useEffect, useMemo, useRef } from 'react';
import type { Task } from '../types/task';
import { completedTasksOnDate, startOfWeek, tasksDueOnDate } from '../domain/calendar';
import { shiftWeek } from '../domain/calendarUi';
import { usePrefs } from '../prefs/prefs';
import {
  formatDate,
  isCompleted,
  isRecurring,
  getNextUncompletedOccurrenceDate,
  getDueDatePart,
  projectTaskForDate,
} from '../domain/recurrence';
import { Check } from 'lucide-react';

interface CalendarAgendaViewProps {
  tasks: Task[];
  onSelectTask: (task: Task) => void;
  selectedTaskId?: string | null;
  /** Focus day for the day-timeline (YYYY-MM-DD). Defaults to today. */
  selectedDateStr?: string | null;
  onSelectDate?: (dateStr: string) => void;
  onMonthChange?: (year: number, monthIndex: number) => void;
  dayCount?: number;
}

function weekAround(
  centerStr: string,
  weekStart: number
): { dateStr: string; date: Date; label: string; dayNum: number }[] {
  const [y, m, d] = centerStr.split('-').map(Number);
  // Week strip starts on Settings › Date & Time › Week starts on
  const monday = startOfWeek(new Date(y, m - 1, d), weekStart);
  const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(monday);
    dt.setDate(monday.getDate() + i);
    days.push({
      dateStr: formatDate(dt),
      date: dt,
      label: names[dt.getDay()],
      dayNum: dt.getDate(),
    });
  }
  return days;
}

/**
 * TickTick-like day agenda: week strip + vertical timeline for the selected day.
 */
export function CalendarAgendaView({
  tasks,
  onSelectTask,
  selectedTaskId,
  selectedDateStr,
  onSelectDate,
  onMonthChange,
}: CalendarAgendaViewProps) {
  const todayStr = formatDate(new Date());
  const focus = selectedDateStr || todayStr;
  const [{ weekStart, showOverdue }] = usePrefs();

  const stripRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const justSwipedRef = useRef(false);
  const isSnappingRef = useRef(false);
  const snapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setTrackOffset = useCallback((offset: number, animate: boolean) => {
    const track = trackRef.current;
    if (!track) return;
    track.style.transition = animate ? 'transform 350ms cubic-bezier(0.25, 1, 0.5, 1)' : 'none';
    track.style.transform = `translateX(${offset}px)`;
  }, []);

  const pointerStartXRef = useRef(0);
  const pointerStartYRef = useRef(0);
  const pointerStartTimeRef = useRef(0);
  const pointerDirectionRef = useRef<'none' | 'horizontal' | 'vertical'>('none');

  const prevWeek = useMemo(
    () => weekAround(shiftWeek(focus, -1).dateStr, weekStart),
    [focus, weekStart]
  );
  const currentWeek = useMemo(
    () => weekAround(focus, weekStart),
    [focus, weekStart]
  );
  const nextWeek = useMemo(
    () => weekAround(shiftWeek(focus, 1).dateStr, weekStart),
    [focus, weekStart]
  );

  const finishSwipe = useCallback(
    (dx: number, dt: number) => {
      const width = stripRef.current?.offsetWidth || 360;
      const velocity = dx / dt;
      let target: -1 | 0 | 1 = 0;

      if (dx <= -width * 0.18 || velocity < -0.3) {
        target = 1;
      } else if (dx >= width * 0.18 || velocity > 0.3) {
        target = -1;
      }

      justSwipedRef.current = true;
      isSnappingRef.current = true;

      const targetOffset = target === 1 ? -width : target === -1 ? width : 0;
      setTrackOffset(targetOffset, true);

      const SNAP_DURATION = 350;

      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
      snapTimerRef.current = setTimeout(() => {
        if (target === 1) {
          const next = shiftWeek(focus, 1);
          onSelectDate?.(next.dateStr);
          onMonthChange?.(next.year, next.monthIndex);
        } else if (target === -1) {
          const prev = shiftWeek(focus, -1);
          onSelectDate?.(prev.dateStr);
          onMonthChange?.(prev.year, prev.monthIndex);
        }

        isSnappingRef.current = false;
        setTrackOffset(0, false);

        setTimeout(() => {
          justSwipedRef.current = false;
        }, 100);
      }, SNAP_DURATION);
    },
    [focus, onSelectDate, onMonthChange, setTrackOffset]
  );

  useEffect(() => {
    return () => {
      if (snapTimerRef.current) clearTimeout(snapTimerRef.current);
    };
  }, []);

  useEffect(() => {
    const el = stripRef.current;
    if (!el) return;

    let startX = 0;
    let startY = 0;
    let startTime = 0;
    let direction: 'none' | 'horizontal' | 'vertical' = 'none';

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isSnappingRef.current) return;
      const t = e.touches[0];
      startX = t.clientX;
      startY = t.clientY;
      startTime = Date.now();
      direction = 'none';
    };

    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length !== 1 || isSnappingRef.current) return;

      const t = e.touches[0];
      const dx = t.clientX - startX;
      const dy = t.clientY - startY;

      if (direction === 'none') {
        if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
          direction = 'horizontal';
        } else if (Math.abs(dy) > 6 && Math.abs(dy) > Math.abs(dx)) {
          direction = 'vertical';
        }
      }

      if (direction === 'horizontal') {
        if (e.cancelable) e.preventDefault();
        setTrackOffset(dx, false);
      }
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (direction !== 'horizontal') {
        if (direction === 'none') {
          setTrackOffset(0, false);
        }
        return;
      }
      direction = 'none';
      if (e.changedTouches[0]) {
        const dx = e.changedTouches[0].clientX - startX;
        const dt = Math.max(1, Date.now() - startTime);
        finishSwipe(dx, dt);
      }
    };

    const onTouchCancel = () => {
      direction = 'none';
      setTrackOffset(0, false);
    };

    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchmove', onTouchMove, { passive: false });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    el.addEventListener('touchcancel', onTouchCancel, { passive: true });

    return () => {
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchmove', onTouchMove);
      el.removeEventListener('touchend', onTouchEnd);
      el.removeEventListener('touchcancel', onTouchCancel);
    };
  }, [finishSwipe, setTrackOffset]);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || isSnappingRef.current || e.button !== 0) return;
    pointerStartXRef.current = e.clientX;
    pointerStartYRef.current = e.clientY;
    pointerStartTimeRef.current = Date.now();
    pointerDirectionRef.current = 'none';
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch' || isSnappingRef.current || pointerDirectionRef.current === 'vertical') return;
    if ((e.buttons & 1) === 0) {
      if (pointerDirectionRef.current === 'horizontal') {
        setTrackOffset(0, false);
      }
      pointerDirectionRef.current = 'none';
      return;
    }
    const dx = e.clientX - pointerStartXRef.current;
    const dy = e.clientY - pointerStartYRef.current;

    if (pointerDirectionRef.current === 'none') {
      if (Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) {
        pointerDirectionRef.current = 'horizontal';
      } else if (Math.abs(dy) > 6) {
        pointerDirectionRef.current = 'vertical';
      }
    }

    if (pointerDirectionRef.current === 'horizontal') {
      setTrackOffset(dx, false);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    if (e.pointerType === 'touch') return;
    if (pointerDirectionRef.current === 'horizontal') {
      const dx = e.clientX - pointerStartXRef.current;
      const dt = Math.max(1, Date.now() - pointerStartTimeRef.current);
      finishSwipe(dx, dt);
    }
    pointerDirectionRef.current = 'none';
  };

  const onPointerCancel = () => {
    if (pointerDirectionRef.current === 'horizontal') {
      setTrackOffset(0, false);
    }
    pointerDirectionRef.current = 'none';
  };

  const overdueTasks = useMemo(() => {
    if (!showOverdue) return [];
    const overdue: Task[] = [];
    for (const t of tasks) {
      if (t.deletedAt || isCompleted(t)) continue;
      if (isRecurring(t)) {
        const nextDate = getNextUncompletedOccurrenceDate(t, new Date());
        if (nextDate && nextDate < todayStr) {
          overdue.push(projectTaskForDate(t, nextDate));
        }
      } else if (t.dueAt && getDueDatePart(t.dueAt) < todayStr) {
        overdue.push(t);
      }
    }
    return overdue.sort((a, b) => (a.dueAt || '').localeCompare(b.dueAt || ''));
  }, [tasks, showOverdue, todayStr]);

  const dayTasks = useMemo(() => {
    const due = tasksDueOnDate(tasks, focus);
    // Include completed that were due this day for timeline checkmarks
    const completedToday = completedTasksOnDate(tasks, focus);
    const map = new Map<string, Task>();
    for (const t of [...due, ...completedToday]) map.set(t.id, t);
    return [...map.values()].sort((a, b) => {
      const hasOrderA = a.sortOrder != null;
      const hasOrderB = b.sortOrder != null;
      if (hasOrderA && hasOrderB && a.sortOrder !== b.sortOrder) {
        return a.sortOrder! - b.sortOrder!;
      }
      if (hasOrderA !== hasOrderB) return hasOrderA ? -1 : 1;
      return (a.createdAt ?? 0) - (b.createdAt ?? 0);
    });
  }, [tasks, focus]);

  const focusDate = useMemo(() => {
    const [y, m, d] = focus.split('-').map(Number);
    return new Date(y, m - 1, d);
  }, [focus]);

  const headerLabel = focusDate.toLocaleDateString(undefined, { month: 'short' });
  const isToday = focus === todayStr;

  const renderWeekStrip = (days: typeof currentWeek, isCurrent: boolean) => (
    <div className="flex items-center justify-between gap-1 px-1">
      {days.map((d) => {
        const active = isCurrent && d.dateStr === focus;
        const today = d.dateStr === todayStr;
        return (
          <button
            key={d.dateStr}
            type="button"
            onClick={() => {
              if (justSwipedRef.current || isSnappingRef.current) return;
              onSelectDate?.(d.dateStr);
            }}
            className="flex-1 flex flex-col items-center gap-1 py-1 rounded-xl hover:bg-tt-sidebar cursor-pointer"
          >
            <span className="text-[10px] font-medium text-tt-muted">{d.label}</span>
            <span
              className={`w-8 h-8 inline-flex items-center justify-center rounded-full text-sm font-semibold ${
                active || today
                  ? 'bg-tt-blue text-white'
                  : 'text-tt-text'
              }`}
            >
              {d.dayNum}
            </span>
          </button>
        );
      })}
    </div>
  );

  return (
    <div className="space-y-3">
      <h2 className="text-lg font-bold text-tt-text">
        {headerLabel}
        {isToday ? ', Today' : ''}
      </h2>

      <div
        ref={stripRef}
        className="select-none touch-pan-y overflow-hidden relative w-full"
        style={{ touchAction: 'pan-y' }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
      >
        <div
          ref={trackRef}
          style={{
            transform: 'translateX(0px)',
            transition: 'none',
            willChange: 'transform',
          }}
          className="w-full relative"
        >
          {/* Previous week */}
          <div style={{ position: 'absolute', top: 0, left: '-100%', width: '100%' }} aria-hidden="true">
            {renderWeekStrip(prevWeek, false)}
          </div>

          {/* Current week */}
          <div style={{ position: 'relative', top: 0, left: 0, width: '100%' }}>
            {renderWeekStrip(currentWeek, true)}
          </div>

          {/* Next week */}
          <div style={{ position: 'absolute', top: 0, left: '100%', width: '100%' }} aria-hidden="true">
            {renderWeekStrip(nextWeek, false)}
          </div>
        </div>
      </div>

      {overdueTasks.length > 0 && (
        <div className="rounded-xl border border-tt-overdue/30 bg-tt-overdue/5 p-3 space-y-2">
          <div className="text-xs font-bold text-tt-overdue">
            Overdue ({overdueTasks.length})
          </div>
          <div className="space-y-1.5">
            {overdueTasks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTask(t)}
                className="w-full text-left p-2 rounded-lg bg-tt-elevated border border-tt-border hover:border-tt-blue flex items-center justify-between gap-2"
              >
                <span className="text-[14px] font-medium text-tt-text truncate">{t.title}</span>
                <span className="text-[11px] text-tt-overdue shrink-0 font-medium">
                  {t.dueAt ? getDueDatePart(t.dueAt) : 'Overdue'}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {dayTasks.length === 0 ? (
        <div className="py-12 text-center">
          <p className="text-sm text-tt-muted">Nothing scheduled</p>
          <p className="text-xs text-tt-muted mt-1">Tasks with due times show on the timeline.</p>
        </div>
      ) : (
        <div className="relative pl-2">
          <div className="absolute left-[22px] top-2 bottom-2 w-px bg-tt-border" />
          <div className="space-y-3">
            {dayTasks.map((t) => {
              const done = isCompleted(t);
              const selected = selectedTaskId === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => onSelectTask(t)}
                  className={`relative w-full flex gap-3 text-left ${selected ? '' : ''}`}
                >
                  <div className="w-10 shrink-0 text-[11px] text-tt-secondary tabular-nums pt-3 text-right pr-1">
                    All day
                  </div>
                  <div
                    className={`mt-3 w-3.5 h-3.5 rounded-full border-2 shrink-0 z-[1] flex items-center justify-center ${
                      done
                        ? 'bg-tt-muted border-tt-muted text-white'
                        : 'bg-tt-elevated border-tt-border'
                    }`}
                  >
                    {done && <Check className="w-2 h-2 stroke-[3]" />}
                  </div>
                  <div
                    className={`flex-1 rounded-xl border px-3 py-2.5 transition-colors ${
                      selected
                        ? 'border-tt-blue bg-tt-blue-soft/40'
                        : 'border-tt-border bg-tt-elevated hover:bg-tt-sidebar/50'
                    } ${done ? 'opacity-60' : ''}`}
                  >
                    <div
                      className={`text-[15px] font-semibold ${
                        done ? 'text-tt-secondary line-through' : 'text-tt-text'
                      }`}
                    >
                      {t.title}
                    </div>
                    {t.notes && (
                      <div className="text-xs text-tt-muted mt-0.5 line-clamp-1">{t.notes}</div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
