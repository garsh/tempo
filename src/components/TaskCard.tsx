import { memo, useEffect, useId, useRef, useState } from 'react';
import type { Task, TaskUrgency } from '../types/task';
import {
  formatDueLabel,
  getDueDatePart,
  getTaskUrgency,
  getWindowProgress,
  isCompleted,
  isFixedRecurring,
  isRecurring,
  isWindowPeriodic,
  parseDate,
} from '../domain/recurrence';
import { useTodayKey } from '../hooks/useTodayKey';
import {
  Check,
  GripVertical,
  RefreshCw,
  Calendar,
  SkipForward,
  Trash2,
} from 'lucide-react';
import { RadialProgressRingWithTooltip } from './RadialProgressRing';
import { SwipeActionButton } from './SwipeActionButton';
import { globalSwipeCoordinator } from '../domain/swipeCoordinator';
import { splitHighlightSegments } from '../domain/search';

const SWIPE_EASE = 'transform 200ms cubic-bezier(0.16, 1, 0.3, 1)';

/** Date + Skip + Delete. Sized for the sm button (40px) plus padding and gaps. */
export const SWIPE_DRAWER_WIDTH_WITH_SKIP = 160;
/** Date + Delete. Non-recurring rows do not reserve a Skip slot. */
export const SWIPE_DRAWER_WIDTH_WITHOUT_SKIP = 112;

interface TaskCardProps {
  task: Task;
  selected?: boolean;
  onComplete: (id: string, dateStr?: string) => void;
  onUncomplete?: (id: string, dateStr?: string) => void;
  onSelect?: (task: Task) => void;
  onEdit?: (task: Task) => void;
  onDelete?: (id: string) => void;
  /** ⋮ › Show Details: displays full wrapped descriptions (and wraps subtitles) under the title. */
  showDetails?: boolean;
  /** Optional metadata subtitle (e.g., recurrence label in Recurring view). */
  subtitle?: string;
  /** Search match snippet overriding `showDetails` preview when provided. */
  notesSnippet?: string;
  /** Occurrence calendar date (YYYY-MM-DD) when rendered inside a specific Calendar date section. */
  occurrenceDateStr?: string;
  /** Normalized search tokens highlighted inside title and notes preview. */
  highlightTokens?: string[];
  /** Drag-to-reorder support. Scrollable lists use a long press; lists that fit drag on move. */
  reorderEnabled?: boolean;
  isDragging?: boolean;
  isSettling?: boolean;
  isDragActive?: boolean;
  dragOffsetY?: number;
  shiftY?: number;
  rowRef?: (el: HTMLDivElement | null) => void;
  onRowPointerDown?: (e: React.PointerEvent<HTMLDivElement>) => void;
  onRowClickCapture?: (e: React.MouseEvent<HTMLDivElement>) => void;
  onRowContextMenu?: (e: React.MouseEvent<HTMLDivElement>) => void;
  /** `none` lets a short list drag on touch. Scrollable lists keep `pan-y`. */
  reorderTouchAction?: 'pan-y' | 'none';
  /** Swipe action triggers */
  onRequestChangeDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestLogDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestSkipOccurrence?: (task: Task) => void;
  onRequestDelete?: (task: Task) => void;
  isSwipedOpen?: boolean;
  onSwipeChange?: (taskId: string, isOpen: boolean) => void;
}

function dueTextClass(urgency: string): string {
  if (urgency === 'overdue') return 'text-tt-overdue';
  if (urgency === 'due_today') return 'text-tt-blue';
  return 'text-tt-secondary';
}

function formatRowDue(dueAt: string | null | undefined, urgency: TaskUrgency): string | null {
  if (!dueAt) return null;
  if (urgency === 'due_today') return 'Today';
  if (urgency === 'overdue') {
    return formatDueLabel(dueAt) || 'Overdue';
  }
  return formatDueLabel(dueAt);
}

function renderHighlighted(text: string, tokens?: string[]) {
  if (!tokens || tokens.length === 0) return text;
  const segments = splitHighlightSegments(text, tokens);
  if (segments.length === 1 && !segments[0].highlighted) return text;
  return segments.map((seg, idx) =>
    seg.highlighted ? (
      <mark key={idx} className="tt-search-mark">
        {seg.text}
      </mark>
    ) : (
      seg.text
    )
  );
}

const TaskCardComponent: React.FC<TaskCardProps> = ({
  task,
  selected = false,
  onComplete,
  onUncomplete,
  onSelect,
  onEdit,
  onDelete,
  showDetails = false,
  subtitle,
  notesSnippet,
  occurrenceDateStr,
  highlightTokens,
  reorderEnabled = false,
  isDragging = false,
  isSettling = false,
  isDragActive = false,
  dragOffsetY = 0,
  shiftY = 0,
  rowRef,
  onRowPointerDown,
  onRowClickCapture,
  onRowContextMenu,
  reorderTouchAction,
  onRequestChangeDate,
  onRequestLogDate,
  onRequestSkipOccurrence,
  onRequestDelete,
  isSwipedOpen,
  onSwipeChange,
}) => {
  const [justCompleted, setJustCompleted] = useState(false);
  const cardInstanceId = useId();
  const todayKey = useTodayKey();
  const windowPeriodic = isWindowPeriodic(task);
  const fixedRecurring = isFixedRecurring(task);
  const recurring = isRecurring(task);
  const progress = windowPeriodic ? getWindowProgress(task, parseDate(todayKey)) : null;
  const completed = windowPeriodic
    ? task.completedAt != null || (occurrenceDateStr == null && progress?.doneToday === true)
    : isCompleted(task);
  const canSkip = fixedRecurring && !completed && !!onRequestSkipOccurrence;
  const urgency = getTaskUrgency(task.dueAt);
  const borderColor = 'var(--tt-pri-none, #c7c7cc)';
  const dueLabel = windowPeriodic ? null : formatRowDue(task.dueAt, urgency);

  useEffect(() => {
    if (completed && justCompleted) {
      setJustCompleted(false);
    }
  }, [completed, justCompleted]);

  useEffect(() => {
    if (!justCompleted) return;
    const timer = setTimeout(() => {
      setJustCompleted(false);
    }, 1500);
    return () => clearTimeout(timer);
  }, [justCompleted]);

  const handleCheck = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (justCompleted) return;
    const dateStr = occurrenceDateStr ?? (task.dueAt ? getDueDatePart(task.dueAt) : undefined);
    if (completed) {
      onUncomplete?.(task.id, dateStr);
      return;
    }
    setJustCompleted(true);
    onComplete(task.id, dateStr);
  };

  const rowPad = 'py-3 min-h-[50px] desktop:py-2 desktop:min-h-[42px]';
  const notesPreview =
    notesSnippet !== undefined
      ? notesSnippet
      : showDetails
        ? task.notes?.trim() || undefined
        : undefined;
  const activate = () => onSelect?.(task);

  const contentOpacityClass = completed ? 'opacity-60' : justCompleted ? 'opacity-50' : '';

  // --- Swipe-to-reveal gesture logic ---
  // Negative offsets open the tray. It slides in from the right over the row;
  // the checkbox and title stay put and may be partly covered.
  const showSkipAction = recurring;
  const drawerWidth = showSkipAction
    ? SWIPE_DRAWER_WIDTH_WITH_SKIP
    : SWIPE_DRAWER_WIDTH_WITHOUT_SKIP;
  const drawerWidthRef = useRef(drawerWidth);
  drawerWidthRef.current = drawerWidth;

  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const isOpenRef = useRef(false);
  const currentOffsetRef = useRef(0);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const drawerRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number; initialOffset: number } | null>(null);
  const mouseStartRef = useRef<{
    x: number;
    y: number;
    initialOffset: number;
    didSwipe: boolean;
  } | null>(null);
  const swipeDirectionRef = useRef<'horizontal' | 'vertical' | null>(null);
  const mouseCleanupRef = useRef<(() => void) | null>(null);
  const suppressClickRef = useRef(false);
  const onSwipeChangeRef = useRef(onSwipeChange);

  useEffect(() => {
    onSwipeChangeRef.current = onSwipeChange;
  });

  const stopMouseSwipeTracking = () => {
    const cleanup = mouseCleanupRef.current;
    if (cleanup) {
      mouseCleanupRef.current = null;
      cleanup();
    }
  };

  useEffect(() => stopMouseSwipeTracking, []);

  const setDrawerVisibility = (visible: boolean, interactive: boolean) => {
    if (!drawerRef.current) return;
    drawerRef.current.style.visibility = visible ? 'visible' : 'hidden';
    drawerRef.current.style.pointerEvents = interactive ? 'auto' : 'none';
  };

  const placeDrawer = (offset: number, animate: boolean) => {
    const drawer = drawerRef.current;
    if (!drawer) return;
    drawer.style.transition = animate ? SWIPE_EASE : 'none';
    drawer.style.transform = `translateX(${drawerWidthRef.current + offset}px)`;
  };

  const openSwipe = () => {
    const width = drawerWidthRef.current;
    isOpenRef.current = true;
    currentOffsetRef.current = -width;
    placeDrawer(-width, true);
    setDrawerVisibility(true, true);
    setIsOpen(true);
    setSwipeOffset(-width);
    globalSwipeCoordinator.notifyOpened(cardInstanceId);
    onSwipeChangeRef.current?.(task.id, true);
  };

  const closeSwipe = () => {
    const wasOpen = isOpenRef.current;
    isOpenRef.current = false;
    currentOffsetRef.current = 0;
    placeDrawer(0, true);
    setDrawerVisibility(false, false);
    setIsOpen(false);
    setSwipeOffset(0);
    if (wasOpen) {
      globalSwipeCoordinator.notifyClosed(cardInstanceId);
      onSwipeChangeRef.current?.(task.id, false);
    }
  };

  // Register with global coordinator for mutual exclusion across all task cards
  useEffect(() => {
    return globalSwipeCoordinator.register(cardInstanceId, (activeId) => {
      if (activeId !== cardInstanceId && isOpenRef.current) {
        closeSwipe();
      }
    });
  }, [cardInstanceId]);

  useEffect(() => {
    if (isSwipedOpen !== undefined) {
      if (isSwipedOpen && !isOpenRef.current) {
        openSwipe();
      } else if (!isSwipedOpen && isOpenRef.current) {
        closeSwipe();
      }
    }
  }, [isSwipedOpen]);

  const applySwipeOffset = (initialOffset: number, dx: number) => {
    const width = drawerWidthRef.current;
    const next = Math.min(0, Math.max(-width - 25, initialOffset + dx));
    currentOffsetRef.current = next;
    placeDrawer(next, false);
    setDrawerVisibility(next < 0, false);
  };

  const commitSwipe = (wasHorizontal: boolean) => {
    if (wasHorizontal) {
      suppressClickRef.current = true;
      setTimeout(() => {
        suppressClickRef.current = false;
      }, 220);

      if (currentOffsetRef.current < -drawerWidthRef.current * 0.35) {
        openSwipe();
      } else {
        closeSwipe();
      }
    } else if (!isOpenRef.current) {
      setDrawerVisibility(false, false);
    }
  };

  useEffect(() => {
    const el = bodyRef.current;
    if (isDragging) {
      touchStartRef.current = null;
      mouseStartRef.current = null;
      stopMouseSwipeTracking();
      swipeDirectionRef.current = null;
      if (isOpenRef.current) {
        closeSwipe();
      } else {
        setDrawerVisibility(false, false);
      }
      return;
    }
    if (!el) return;

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const touch = e.touches[0];
      touchStartRef.current = {
        x: touch.clientX,
        y: touch.clientY,
        initialOffset: isOpenRef.current ? -drawerWidthRef.current : 0,
      };
      swipeDirectionRef.current = null;
    };

    const handleTouchMove = (e: TouchEvent) => {
      const start = touchStartRef.current;
      if (!start || e.touches.length !== 1) return;
      const touch = e.touches[0];
      const dx = touch.clientX - start.x;
      const dy = touch.clientY - start.y;

      if (swipeDirectionRef.current === null) {
        if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > 7) {
          swipeDirectionRef.current = 'vertical';
        } else if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 7) {
          swipeDirectionRef.current = 'horizontal';
        }
      }

      if (swipeDirectionRef.current === 'horizontal') {
        applySwipeOffset(start.initialOffset, dx);
      }
    };

    const handleTouchEnd = () => {
      const dir = swipeDirectionRef.current;
      touchStartRef.current = null;
      swipeDirectionRef.current = null;
      commitSwipe(dir === 'horizontal');
    };

    el.addEventListener('touchstart', handleTouchStart, { passive: true });
    el.addEventListener('touchmove', handleTouchMove, { passive: true });
    el.addEventListener('touchend', handleTouchEnd, { passive: true });
    el.addEventListener('touchcancel', handleTouchEnd, { passive: true });

    return () => {
      el.removeEventListener('touchstart', handleTouchStart);
      el.removeEventListener('touchmove', handleTouchMove);
      el.removeEventListener('touchend', handleTouchEnd);
      el.removeEventListener('touchcancel', handleTouchEnd);
      touchStartRef.current = null;
      swipeDirectionRef.current = null;
      if (!isOpenRef.current) {
        setDrawerVisibility(false, false);
        if (currentOffsetRef.current !== 0) {
          currentOffsetRef.current = 0;
          placeDrawer(0, false);
        }
      }
    };
  }, [isDragging, task.id]);

  const handleRowPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    onRowPointerDown?.(e);
    if (e.pointerType === 'mouse' && e.button === 0 && !isDragging) {
      if ((e.target as HTMLElement).closest('button, input, a, [data-drag-handle="true"]')) return;
      stopMouseSwipeTracking();
      mouseStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        initialOffset: isOpenRef.current ? -drawerWidthRef.current : 0,
        didSwipe: false,
      };
      if (typeof window === 'undefined') return;

      const onWinMove = (ev: PointerEvent) => {
        if (ev.pointerType !== 'mouse' || !mouseStartRef.current) return;
        if ((ev.buttons & 1) === 0) {
          stopMouseSwipeTracking();
          const { didSwipe } = mouseStartRef.current;
          mouseStartRef.current = null;
          commitSwipe(didSwipe);
          return;
        }
        const dx = ev.clientX - mouseStartRef.current.x;
        const dy = ev.clientY - mouseStartRef.current.y;
        if (!mouseStartRef.current.didSwipe) {
          if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
            mouseStartRef.current = null;
            stopMouseSwipeTracking();
            return;
          }
          if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy)) {
            mouseStartRef.current.didSwipe = true;
          }
        }
        if (mouseStartRef.current.didSwipe) {
          applySwipeOffset(mouseStartRef.current.initialOffset, dx);
        }
      };

      const onWinUp = (ev: PointerEvent) => {
        if (ev.pointerType !== 'mouse') return;
        stopMouseSwipeTracking();
        if (!mouseStartRef.current) return;
        const { didSwipe } = mouseStartRef.current;
        mouseStartRef.current = null;
        commitSwipe(didSwipe);
      };

      const onWinCancel = (ev: Event) => {
        if (ev.type === 'pointercancel' && (ev as PointerEvent).pointerType !== 'mouse') return;
        stopMouseSwipeTracking();
        if (!mouseStartRef.current) return;
        const wasOpened = mouseStartRef.current.initialOffset !== 0;
        mouseStartRef.current = null;
        if (wasOpened) {
          openSwipe();
        } else {
          closeSwipe();
        }
      };

      window.addEventListener('pointermove', onWinMove);
      window.addEventListener('pointerup', onWinUp);
      window.addEventListener('pointercancel', onWinCancel);
      window.addEventListener('blur', onWinCancel);
      mouseCleanupRef.current = () => {
        window.removeEventListener('pointermove', onWinMove);
        window.removeEventListener('pointerup', onWinUp);
        window.removeEventListener('pointercancel', onWinCancel);
        window.removeEventListener('blur', onWinCancel);
      };
    }
  };

  return (
    <div
      ref={rowRef}
      data-testid="task-card"
      data-task-id={task.id}
      data-dragging={isDragging ? 'true' : undefined}
      onPointerDown={handleRowPointerDown}
      onClickCapture={onRowClickCapture}
      onContextMenu={onRowContextMenu}
      onClick={(e) => {
        if (suppressClickRef.current) {
          suppressClickRef.current = false;
          return;
        }
        if ((e.target as HTMLElement).closest('button, input, a')) {
          return;
        }
        if (typeof window !== 'undefined' && window.getSelection?.()?.toString()) {
          return;
        }
        if (isOpen) {
          e.stopPropagation();
          closeSwipe();
          return;
        }
        activate();
      }}
      onDoubleClick={(e) => {
        if ((e.target as HTMLElement).closest('button, input, a')) return;
        if (!isOpen) onEdit?.(task);
      }}
      style={
        isDragging
          ? {
              transform: `translateY(${dragOffsetY}px)`,
              transition: isSettling
                ? 'transform 160ms cubic-bezier(0.2, 0, 0, 1), opacity 160ms ease'
                : 'none',
              touchAction: 'none',
            }
          : isDragActive
            ? {
                transform: `translateY(${shiftY}px)`,
                transition: 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
              }
            : undefined
      }
      className={`group relative overflow-hidden border-b border-tt-border/80 cursor-pointer ${
        isDragging
          ? 'z-20 bg-tt-elevated/45 backdrop-blur-[1px] shadow-md ring-2 ring-tt-blue/60 rounded-xl opacity-60 select-none'
          : `transition-colors ${reorderEnabled ? 'select-none hover-pointer:select-text' : ''}`
      }`}
    >
      {/* Swipe actions slide in from the right and cover the end of the row. */}
      <div
        ref={drawerRef}
        data-testid="task-action-drawer"
        className={`absolute right-0 inset-y-0 flex items-center justify-end px-3 gap-2 border-l border-tt-border bg-tt-elevated z-20 ${
          !isOpen && swipeOffset === 0 ? 'invisible pointer-events-none' : ''
        }`}
        style={{
          width: `${drawerWidth}px`,
          transform: `translateX(${drawerWidth + swipeOffset}px)`,
          transition: SWIPE_EASE,
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
        {windowPeriodic && task.completedAt == null && onRequestLogDate ? (
          <SwipeActionButton
            icon={<Calendar className="w-4 h-4" />}
            label="Log Date"
            explanation="Log Date: Record a completion date for this routine"
            colorClasses="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white"
            onClick={(anchorEl) => {
              const rect = anchorEl?.getBoundingClientRect();
              closeSwipe();
              onRequestLogDate(task, rect);
            }}
          />
        ) : (
          <SwipeActionButton
            icon={<Calendar className="w-4 h-4" />}
            label="Change Date"
            explanation={
              completed
                ? 'Change Date: Pick a new completed date for this task'
                : 'Change Date: Pick a new date for this task'
            }
            colorClasses="bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white"
            onClick={(anchorEl) => {
              const rect = anchorEl?.getBoundingClientRect();
              closeSwipe();
              onRequestChangeDate?.(task, rect);
            }}
          />
        )}
        {showSkipAction && (
          <SwipeActionButton
            icon={<SkipForward className="w-4 h-4" />}
            label="Skip Occurrence"
            explanation={
              canSkip
                ? "Skip Occurrence: Skip today's repeat and move to next occurrence"
                : windowPeriodic
                  ? 'Skip Occurrence: Not used for approximate window routines'
                  : fixedRecurring && completed
                    ? 'Skip Occurrence: Already completed for this date'
                    : 'Skip Occurrence: Not available for ended series'
            }
            disabled={!canSkip}
            colorClasses="bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white"
            onClick={() => {
              closeSwipe();
              onRequestSkipOccurrence?.(task);
            }}
          />
        )}
        <SwipeActionButton
          icon={<Trash2 className="w-4 h-4" />}
          label="Delete"
          explanation="Delete: Remove this task"
          colorClasses="bg-red-500 hover:bg-red-600 active:bg-red-700 text-white"
          onClick={() => {
            closeSwipe();
            if (onRequestDelete) {
              onRequestDelete(task);
            } else {
              onDelete?.(task.id);
            }
          }}
        />
      </div>

      {/* Row content stays put while the action tray covers the right side. */}
      <div
        ref={bodyRef}
        data-testid="task-card-body"
        style={{ touchAction: reorderTouchAction === 'none' ? 'none' : 'pan-y' }}
        className={`relative z-10 w-full flex items-start gap-3 desktop:gap-2.5 px-3 sm:px-4 ${
          selected
            ? 'bg-tt-blue-soft'
            : 'bg-tt-surface hover:[background-image:linear-gradient(var(--tt-hover),var(--tt-hover))]'
        } ${rowPad}`}
      >
        {reorderEnabled && (
          <span
            data-drag-handle="true"
            aria-hidden="true"
            title="Drag to reorder"
            className="hidden hover-pointer:flex items-center justify-center -ml-2 -mr-1 w-4 h-6 shrink-0 text-tt-muted/50 group-hover:text-tt-muted opacity-0 group-hover:opacity-100 transition-opacity cursor-grab active:cursor-grabbing"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}
        <button
          type="button"
          role="checkbox"
          aria-checked={completed}
          aria-label={completed ? `Mark "${task.title}" incomplete` : `Complete "${task.title}"`}
          onClick={handleCheck}
          onPointerDown={(e) => e.stopPropagation()}
          onTouchStart={(e) => e.stopPropagation()}
          disabled={completed && !onUncomplete}
          title={completed ? 'Mark incomplete' : recurring ? 'Complete this occurrence' : 'Complete'}
          className={`relative flex-shrink-0 w-[21px] h-[21px] mt-[2.5px] desktop:mt-[1px] rounded-[5px] border-[1.5px] flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tt-blue focus-visible:ring-offset-1 focus-visible:ring-offset-tt-surface after:absolute after:-inset-2 after:content-[''] ${contentOpacityClass}`}
          style={{
            borderColor: completed || justCompleted ? '#34C759' : borderColor,
            backgroundColor: completed || justCompleted ? '#34C759' : 'transparent',
            color: '#fff',
          }}
        >
          {(completed || justCompleted) && <Check className="w-3 h-3 stroke-[3]" />}
        </button>

      <div
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.target !== e.currentTarget) return;
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            if (isOpen) {
              closeSwipe();
            } else {
              activate();
            }
          }
        }}
        className={`flex-1 min-w-0 rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-tt-blue ${contentOpacityClass}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            data-testid="task-title"
            className={`text-[19px] desktop:text-[15px] leading-snug min-w-0 wrap-break-word text-pretty ${
              completed ? 'text-tt-secondary line-through' : 'text-tt-text'
            }`}
          >
            {renderHighlighted(task.title, highlightTokens)}
          </span>
        </div>
        {subtitle && (
          <p
            className={`mt-0.5 text-[13px] desktop:text-[12px] leading-snug text-tt-secondary ${
              showDetails ? 'wrap-break-word text-pretty' : 'truncate'
            }`}
          >
            {subtitle}
          </p>
        )}
        {notesPreview && (
          <p
            className={`mt-0.5 text-[13px] desktop:text-[12px] leading-snug text-tt-secondary ${
              showDetails ? 'whitespace-pre-wrap wrap-break-word' : 'truncate'
            }`}
            data-testid="task-notes-preview"
          >
            {renderHighlighted(notesPreview, highlightTokens)}
          </p>
        )}
      </div>

      <div className="flex items-center gap-1.5 sm:gap-2 flex-shrink-0 min-h-[26px]">
        {(onRequestChangeDate || onRequestLogDate || canSkip || onRequestDelete || onDelete) && (
          <div
            data-testid="task-hover-actions"
            className="hidden hover-pointer:flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus-within:opacity-100 transition-opacity"
            onPointerDown={(e) => e.stopPropagation()}
            onTouchStart={(e) => e.stopPropagation()}
          >
            {windowPeriodic && task.completedAt == null && onRequestLogDate ? (
              <button
                type="button"
                data-hover-action="date"
                aria-label="Log Date"
                title="Log Date"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestLogDate(task, e.currentTarget.getBoundingClientRect());
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-amber-600 dark:hover:text-amber-400 hover:bg-tt-hover transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            ) : (!windowPeriodic || task.completedAt != null) && onRequestChangeDate ? (
              <button
                type="button"
                data-hover-action="date"
                aria-label="Change Date"
                title={completed ? 'Change completed date' : 'Change Date'}
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestChangeDate(task, e.currentTarget.getBoundingClientRect());
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-amber-600 dark:hover:text-amber-400 hover:bg-tt-hover transition-colors cursor-pointer"
              >
                <Calendar className="w-3.5 h-3.5" />
              </button>
            ) : null}
            {canSkip && (
              <button
                type="button"
                data-hover-action="skip"
                aria-label="Skip Occurrence"
                title="Skip Occurrence"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestSkipOccurrence?.(task);
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-blue hover:bg-tt-hover transition-colors cursor-pointer"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            )}
            {(onRequestDelete || onDelete) && (
              <button
                type="button"
                data-hover-action="delete"
                aria-label="Delete"
                title="Delete"
                onClick={(e) => {
                  e.stopPropagation();
                  if (onRequestDelete) {
                    onRequestDelete(task);
                  } else {
                    onDelete?.(task.id);
                  }
                }}
                className="w-7 h-7 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-overdue hover:bg-tt-hover transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        )}

        <div className={`flex items-center gap-1.5 sm:gap-2 flex-shrink-0 text-[15px] desktop:text-[13px] min-h-[26px] ${contentOpacityClass}`}>
          {windowPeriodic && progress && task.completedAt == null ? (
            <RadialProgressRingWithTooltip progress={progress} />
          ) : (
            <>
              {recurring && (
                <span title="Repeats"><RefreshCw className="w-3 h-3 text-tt-muted" /></span>
              )}

              {dueLabel && (
                <span className={`tabular-nums font-medium ${completed ? 'text-tt-secondary' : dueTextClass(urgency)}`}>
                  {dueLabel}
                </span>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  </div>
);
};

export const TaskCard = memo(TaskCardComponent);
