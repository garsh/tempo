import { describe, it, expect, vi } from 'vitest';
import type { Task } from '../../types/task';
import { SwipeCoordinator } from '../../domain/swipeCoordinator';

/**
 * Constants matching TaskCard swipe and interaction specifications.
 */
const DRAWER_WIDTH = 160;
const SNAP_THRESHOLD_PX = -DRAWER_WIDTH * 0.35; // -56px
const MIN_GESTURE_DISCRIMINATION_PX = 7;
const MAX_LEFT_DRAG_PX = -DRAWER_WIDTH - 25; // -185px
const CLICK_SUPPRESSION_MS = 220;

/**
 * TaskCard Gesture & State Machine interaction simulator.
 * Models the decoupled interaction logic for TaskCard touch and mouse swipe interactions.
 */
export class TaskCardGestureMachine {
  private isOpen = false;
  private isGesturing = false;
  private swipeOffset = 0;
  private direction: 'none' | 'horizontal' | 'vertical' = 'none';
  private touchStart: { x: number; y: number; initialOffset: number } | null = null;
  private suppressClick = false;
  private suppressTimer: ReturnType<typeof setTimeout> | null = null;

  public readonly taskId: string;
  private readonly callbacks: {
    onSelect?: () => void;
    onEdit?: () => void;
    onSwipeChange?: (open: boolean) => void;
    onRequestChangeDate?: () => void;
    onRequestSkipOccurrence?: () => void;
    onRequestDelete?: () => void;
  };

  constructor(
    taskId: string,
    callbacks: {
      onSelect?: () => void;
      onEdit?: () => void;
      onSwipeChange?: (open: boolean) => void;
      onRequestChangeDate?: () => void;
      onRequestSkipOccurrence?: () => void;
      onRequestDelete?: () => void;
    } = {}
  ) {
    this.taskId = taskId;
    this.callbacks = callbacks;
  }

  public getOffset(): number {
    return this.swipeOffset;
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public getIsGesturing(): boolean {
    return this.isGesturing;
  }

  public getDirection(): 'none' | 'horizontal' | 'vertical' {
    return this.direction;
  }

  public isClickSuppressed(): boolean {
    return this.suppressClick;
  }

  public onTouchStart(clientX: number, clientY: number): void {
    this.touchStart = {
      x: clientX,
      y: clientY,
      initialOffset: this.isOpen ? -DRAWER_WIDTH : 0,
    };
    this.direction = 'none';
    this.isGesturing = true;
  }

  public onTouchMove(
    clientX: number,
    clientY: number
  ): { prevented: boolean; offset: number } {
    if (!this.touchStart) return { prevented: false, offset: this.swipeOffset };

    const dx = clientX - this.touchStart.x;
    const dy = clientY - this.touchStart.y;

    if (this.direction === 'none') {
      if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > MIN_GESTURE_DISCRIMINATION_PX) {
        this.direction = 'vertical';
      } else if (
        Math.abs(dx) > Math.abs(dy) &&
        Math.abs(dx) > MIN_GESTURE_DISCRIMINATION_PX
      ) {
        this.direction = 'horizontal';
      }
    }

    if (this.direction === 'horizontal') {
      let next = this.touchStart.initialOffset + dx;
      // Clamp right drag to 0 and left drag to -DRAWER_WIDTH - 25
      next = Math.min(0, Math.max(MAX_LEFT_DRAG_PX, next));
      this.swipeOffset = next;
      return { prevented: true, offset: this.swipeOffset };
    }

    // Vertical movement is not prevented so browser scrolling proceeds
    return { prevented: false, offset: this.swipeOffset };
  }

  public onTouchEnd(): { snappedOpen: boolean } {
    const dir = this.direction;
    this.touchStart = null;
    this.direction = 'none';
    this.isGesturing = false;

    if (dir === 'horizontal') {
      this.suppressClick = true;
      if (this.suppressTimer) clearTimeout(this.suppressTimer);
      this.suppressTimer = setTimeout(() => {
        this.suppressClick = false;
        this.suppressTimer = null;
      }, CLICK_SUPPRESSION_MS);

      if (this.swipeOffset < SNAP_THRESHOLD_PX) {
        this.isOpen = true;
        this.swipeOffset = -DRAWER_WIDTH;
        this.callbacks.onSwipeChange?.(true);
        return { snappedOpen: true };
      } else {
        this.closeSwipe();
        return { snappedOpen: false };
      }
    }

    return { snappedOpen: this.isOpen };
  }

  public closeSwipe(): void {
    const wasOpen = this.isOpen;
    this.isOpen = false;
    this.swipeOffset = 0;
    if (wasOpen) {
      this.callbacks.onSwipeChange?.(false);
    }
  }

  public onClick(): 'activated' | 'closed_drawer' | 'suppressed' {
    if (this.suppressClick) {
      this.suppressClick = false;
      return 'suppressed';
    }
    if (this.isOpen) {
      this.closeSwipe();
      return 'closed_drawer';
    }
    this.callbacks.onSelect?.();
    return 'activated';
  }

  public onDoubleClick(): boolean {
    if (this.isOpen || this.suppressClick) return false;
    this.callbacks.onEdit?.();
    return true;
  }

  public executeAction(action: 'changeDate' | 'skipOccurrence' | 'delete'): void {
    this.closeSwipe();
    if (action === 'changeDate') this.callbacks.onRequestChangeDate?.();
    if (action === 'skipOccurrence') this.callbacks.onRequestSkipOccurrence?.();
    if (action === 'delete') this.callbacks.onRequestDelete?.();
  }
}


describe('TaskCard Gesture & Interaction State Machine', () => {
  const sampleTask: Task = {
    id: 'task-101',
    title: 'Daily Habit',
    createdAt: 1000,
    updatedAt: 1000,
    dueAt: '2026-11-17',
    subtasks: [],
    completionHistory: [],
    recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
  };

  it('discriminates gesture: vertical scroll does not move card or prevent default', () => {
    const machine = new TaskCardGestureMachine(sampleTask.id);
    machine.onTouchStart(100, 100);

    // dy = 20, dx = 3 -> vertical movement dominates
    const res = machine.onTouchMove(103, 120);

    expect(res.prevented).toBe(false);
    expect(res.offset).toBe(0);
    expect(machine.getDirection()).toBe('vertical');

    const end = machine.onTouchEnd();
    expect(end.snappedOpen).toBe(false);
    expect(machine.getOffset()).toBe(0);
  });

  it('discriminates gesture: horizontal swipe locks and clamps left drag', () => {
    const onSwipeChange = vi.fn();
    const machine = new TaskCardGestureMachine(sampleTask.id, { onSwipeChange });
    machine.onTouchStart(200, 100);

    // dx = -50, dy = 4 -> horizontal movement dominates
    const res = machine.onTouchMove(150, 104);

    expect(res.prevented).toBe(true);
    expect(res.offset).toBe(-50);
    expect(machine.getDirection()).toBe('horizontal');

    // Drag beyond maximum left limit (-185px)
    const clampedRes = machine.onTouchMove(-50, 104); // dx = -250
    expect(clampedRes.offset).toBe(MAX_LEFT_DRAG_PX); // -185
  });

  it('clamps right swipe drag to 0 so cards cannot slide rightwards', () => {
    const machine = new TaskCardGestureMachine(sampleTask.id);
    machine.onTouchStart(100, 100);

    // dx = +60 (user drags right)
    const res = machine.onTouchMove(160, 100);

    expect(res.prevented).toBe(true);
    expect(res.offset).toBe(0);
  });

  it('snaps open when released past threshold (-56px) and invokes callback', () => {
    const onSwipeChange = vi.fn();
    const machine = new TaskCardGestureMachine(sampleTask.id, { onSwipeChange });

    machine.onTouchStart(200, 100);
    machine.onTouchMove(140, 100); // dx = -60 (< -56)
    const end = machine.onTouchEnd();

    expect(end.snappedOpen).toBe(true);
    expect(machine.getIsOpen()).toBe(true);
    expect(machine.getOffset()).toBe(-DRAWER_WIDTH);
    expect(onSwipeChange).toHaveBeenCalledWith(true);
  });

  it('snaps closed when released before threshold and resets offset', () => {
    const onSwipeChange = vi.fn();
    const machine = new TaskCardGestureMachine(sampleTask.id, { onSwipeChange });

    machine.onTouchStart(200, 100);
    machine.onTouchMove(160, 100); // dx = -40 (> -56)
    const end = machine.onTouchEnd();

    expect(end.snappedOpen).toBe(false);
    expect(machine.getIsOpen()).toBe(false);
    expect(machine.getOffset()).toBe(0);
  });

  it('suppresses click immediately after horizontal drag release', () => {
    const onSelect = vi.fn();
    const machine = new TaskCardGestureMachine(sampleTask.id, { onSelect });

    machine.onTouchStart(200, 100);
    machine.onTouchMove(170, 100); // dx = -30
    machine.onTouchEnd();

    // Browser fires click right after touchend
    const clickResult = machine.onClick();
    expect(clickResult).toBe('suppressed');
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('tapping on an already open card closes drawer without activating task', () => {
    const onSelect = vi.fn();
    const onSwipeChange = vi.fn();
    const machine = new TaskCardGestureMachine(sampleTask.id, { onSelect, onSwipeChange });

    // Open drawer
    machine.onTouchStart(200, 100);
    machine.onTouchMove(120, 100);
    machine.onTouchEnd();
    expect(machine.getIsOpen()).toBe(true);

    // Fast-forward suppression
    machine.onClick(); // consumes initial gesture suppress

    // User taps the open card to dismiss
    const clickResult = machine.onClick();
    expect(clickResult).toBe('closed_drawer');
    expect(machine.getIsOpen()).toBe(false);
    expect(machine.getOffset()).toBe(0);
    expect(onSelect).not.toHaveBeenCalled();
    expect(onSwipeChange).toHaveBeenCalledWith(false);
  });

  it('executing action buttons invokes action and closes drawer immediately', () => {
    const onSelect = vi.fn();
    const onRequestChangeDate = vi.fn();
    const onRequestSkipOccurrence = vi.fn();
    const onRequestDelete = vi.fn();
    const onSwipeChange = vi.fn();

    const machine = new TaskCardGestureMachine(sampleTask.id, {
      onSelect,
      onRequestChangeDate,
      onRequestSkipOccurrence,
      onRequestDelete,
      onSwipeChange,
    });

    // Open drawer
    machine.onTouchStart(200, 100);
    machine.onTouchMove(100, 100);
    machine.onTouchEnd();
    expect(machine.getIsOpen()).toBe(true);

    // Action 1: Change Date
    machine.executeAction('changeDate');
    expect(onRequestChangeDate).toHaveBeenCalledTimes(1);
    expect(machine.getIsOpen()).toBe(false);
    expect(machine.getOffset()).toBe(0);

    // Re-open and execute Action 2: Skip Occurrence
    machine.onTouchStart(200, 100);
    machine.onTouchMove(100, 100);
    machine.onTouchEnd();
    machine.executeAction('skipOccurrence');
    expect(onRequestSkipOccurrence).toHaveBeenCalledTimes(1);
    expect(machine.getIsOpen()).toBe(false);

    // Re-open and execute Action 3: Delete
    machine.onTouchStart(200, 100);
    machine.onTouchMove(100, 100);
    machine.onTouchEnd();
    machine.executeAction('delete');
    expect(onRequestDelete).toHaveBeenCalledTimes(1);
    expect(machine.getIsOpen()).toBe(false);
  });

  it('SwipeCoordinator closes previously open card when another card opens', () => {
    const coordinator = new SwipeCoordinator();

    let isOpenA = false;
    let isOpenB = false;
    const closeA = vi.fn();
    const closeB = vi.fn();

    const unregA = coordinator.register('task-A', (activeId) => {
      if (activeId !== 'task-A' && isOpenA) {
        isOpenA = false;
        closeA();
      }
    });
    const unregB = coordinator.register('task-B', (activeId) => {
      if (activeId !== 'task-B' && isOpenB) {
        isOpenB = false;
        closeB();
      }
    });

    // Task A opens
    isOpenA = true;
    coordinator.notifyOpened('task-A');
    expect(coordinator.getActiveTaskId()).toBe('task-A');
    expect(closeA).not.toHaveBeenCalled();
    expect(closeB).not.toHaveBeenCalled();

    // Task B opens -> Task A must receive close notification
    isOpenB = true;
    coordinator.notifyOpened('task-B');
    expect(coordinator.getActiveTaskId()).toBe('task-B');
    expect(closeA).toHaveBeenCalledTimes(1);
    expect(closeB).not.toHaveBeenCalled();

    // Clean up
    unregA();
    unregB();
  });
});
