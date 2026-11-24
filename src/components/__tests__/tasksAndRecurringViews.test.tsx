// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RadialProgressRing,
  RadialProgressRingWithTooltip,
  ringColorForProgress,
} from '../RadialProgressRing';
import { CalendarMonthView } from '../CalendarMonthView';
import { TasksView } from '../TasksView';
import { RecurringTasksView } from '../RecurringTasksView';
import { DeleteConfirmDialog } from '../dialogs/DeleteConfirmDialog';
import { QuickAddSheet } from '../QuickAddSheet';
import { getWindowProgress } from '../../domain/recurrence';
import type { Task } from '../../types/task';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function mount(ui: ReactElement) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  act(() => {
    root.render(ui);
  });
  return {
    container,
    unmount() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

function makeTask(id: string, title: string, overrides: Partial<Task> = {}): Task {
  return {
    id,
    title,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('Tasks, Recurring, Progress Ring, Delete Dialog & QuickAddSheet History UI', () => {
  describe('RadialProgressRing', () => {
    it('renders steady SVG rings with stage and fill attributes across all stages without pulsing', () => {
      const rule = {
        type: 'after_completion' as const,
        intervalValue: 4,
        maxIntervalValue: 8,
        intervalUnit: 'days' as const,
      };
      const now = new Date(2026, 4, 20, 12, 0);

      const cases = [
        {
          label: 'before_min',
          task: makeTask('r-before', 'Fresh', {
            recurrence: rule,
            completionHistory: [new Date(2026, 4, 18, 12, 0).getTime()],
          }),
          expectedStage: 'before_min',
          expectedFill: '0.50',
        },
        {
          label: 'in_window',
          task: makeTask('r-win', 'Window', {
            recurrence: rule,
            completionHistory: [new Date(2026, 4, 14, 12, 0).getTime()],
          }),
          expectedStage: 'in_window',
          expectedFill: '0.50',
        },
        {
          label: 'not_done_yet',
          task: makeTask('r-never', 'Never done', {
            recurrence: rule,
            completionHistory: [],
          }),
          expectedStage: 'not_done_yet',
          expectedFill: '1.00',
        },
        {
          label: 'at_or_past_max',
          task: makeTask('r-over', 'Overdue', {
            recurrence: rule,
            completionHistory: [new Date(2026, 4, 8, 12, 0).getTime()],
          }),
          expectedStage: 'at_or_past_max',
          expectedFill: '1.00',
        },
      ];

      for (const c of cases) {
        const progress = getWindowProgress(c.task, now)!;
        const view = mount(<RadialProgressRing progress={progress} />);
        const svg = view.container.querySelector('[data-testid="radial-progress-ring"]');
        expect(svg, c.label).toBeTruthy();
        expect(svg!.getAttribute('data-stage')).toBe(c.expectedStage);
        expect(svg!.getAttribute('data-fill')).toBe(c.expectedFill);
        expect(view.container.querySelector('.animate-pulse')).toBeNull();
        view.unmount();
      }
    });

    it('uses green for both early and late in_window tasks and escalates amber -> orange -> red past max', () => {
      const rule = {
        type: 'after_completion' as const,
        intervalValue: 4,
        maxIntervalValue: 10,
        intervalUnit: 'days' as const,
      };
      const now = new Date(2026, 4, 20, 12, 0);

      const earlyInWindow = getWindowProgress(
        makeTask('g-early', 'Early green', {
          recurrence: rule,
          completionHistory: [new Date(2026, 4, 15, 12, 0).getTime()], // day 5
        }),
        now
      )!;
      expect(earlyInWindow.stage).toBe('in_window');
      expect(ringColorForProgress(earlyInWindow)).toBe('var(--tt-ring-green)');

      const lateInWindow = getWindowProgress(
        makeTask('g-late', 'Late green', {
          recurrence: rule,
          completionHistory: [new Date(2026, 4, 11, 12, 0).getTime()], // day 9
        }),
        now
      )!;
      expect(lateInWindow.stage).toBe('in_window');
      expect(ringColorForProgress(lateInWindow)).toBe('var(--tt-ring-green)');

      const atMax = getWindowProgress(
        makeTask('max-amber', 'At max', {
          recurrence: rule,
          completionHistory: [new Date(2026, 4, 10, 12, 0).getTime()], // day 10
        }),
        now
      )!;
      expect(ringColorForProgress(atMax)).toBe('var(--tt-ring-amber)');

      const slightlyPastMax = getWindowProgress(
        makeTask('past-orange', 'Past max 2d', {
          recurrence: rule,
          completionHistory: [new Date(2026, 4, 8, 12, 0).getTime()], // day 12 -> 0.2 intensity
        }),
        now
      )!;
      expect(ringColorForProgress(slightlyPastMax)).toBe('var(--tt-ring-orange)');

      const overduePastMax = getWindowProgress(
        makeTask('past-red', 'Overdue 5d', {
          recurrence: rule,
          completionHistory: [new Date(2026, 4, 5, 12, 0).getTime()], // day 15 -> 0.5 intensity
        }),
        now
      )!;
      expect(ringColorForProgress(overduePastMax)).toBe('var(--tt-ring-overdue)');
    });

    it('shows expanded status tooltip on desktop hover, stays open when hovering tooltip, and closes on Escape', () => {
      vi.useFakeTimers();
      const now = new Date(2026, 4, 20, 12, 0);
      const task = makeTask('hover-1', 'Flush heater', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 11,
          maxIntervalValue: 13,
          intervalUnit: 'months',
        },
        completionHistory: [],
      });
      const progress = getWindowProgress(task, now)!;
      const view = mount(<RadialProgressRingWithTooltip progress={progress} />);

      const trigger = view.container.querySelector<HTMLButtonElement>('button')!;
      expect(trigger).toBeTruthy();
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeNull();

      act(() => {
        trigger.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      });

      const tooltip = document.body.querySelector<HTMLElement>('[data-testid="ring-progress-tooltip"]');
      expect(tooltip).toBeTruthy();
      expect(tooltip!.textContent).toContain('Not done yet · every 11–13 months');

      // Moving pointer off trigger and onto tooltip keeps it open (WCAG Hoverable)
      act(() => {
        trigger.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
        tooltip!.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
        vi.advanceTimersByTime(200);
      });
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeTruthy();

      // Pressing Escape dismisses tooltip cleanly (WCAG Dismissible)
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      });
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeNull();
      view.unmount();
    });

    it('keeps tooltip open after mobile long-press release until dismissed, while short tap activates row', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 20, 12, 0));
      const now = new Date(2026, 4, 20, 12, 0);
      const task = makeTask('touch-1', 'Change filter', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 4, 16, 12, 0).getTime()],
      });
      const progress = getWindowProgress(task, now)!;
      const onRowClick = vi.fn();

      const view = mount(
        <div onClick={onRowClick}>
          <RadialProgressRingWithTooltip progress={progress} />
        </div>
      );
      const trigger = view.container.querySelector<HTMLButtonElement>('button')!;

      // Long press >= 280ms -> tooltip opens, releasing finger keeps it open indefinitely without clicking row
      act(() => {
        const start = Object.assign(new Event('touchstart', { bubbles: true }), {
          touches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(start);
        vi.advanceTimersByTime(280);
      });

      const tooltip = document.body.querySelector('[data-testid="ring-progress-tooltip"]');
      expect(tooltip).toBeTruthy();
      expect(tooltip!.textContent).toContain('Last done 4 days ago · every 3–5 days');

      act(() => {
        const end = Object.assign(new Event('touchend', { bubbles: true, cancelable: true }), {
          changedTouches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(end);
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        vi.advanceTimersByTime(10000);
      });
      expect(onRowClick).not.toHaveBeenCalled();
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeTruthy();

      // Tapping outside dismisses it
      act(() => {
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
      });
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeNull();

      // Long press again -> stays open, then tapping ring button again closes it without invoking row click
      act(() => {
        const start = Object.assign(new Event('touchstart', { bubbles: true }), {
          touches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(start);
        vi.advanceTimersByTime(280);
        const end = Object.assign(new Event('touchend', { bubbles: true, cancelable: true }), {
          changedTouches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(end);
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
        vi.advanceTimersByTime(500);
      });
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeTruthy();

      act(() => {
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeNull();
      expect(onRowClick).not.toHaveBeenCalled();

      // Short tap < 280ms when closed -> does not open tooltip and activates row click
      act(() => {
        const start = Object.assign(new Event('touchstart', { bubbles: true }), {
          touches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(start);
        vi.advanceTimersByTime(50);
        const end = Object.assign(new Event('touchend', { bubbles: true, cancelable: true }), {
          changedTouches: [{ clientX: 25, clientY: 25 }],
        });
        trigger.dispatchEvent(end);
        trigger.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
      });

      expect(onRowClick).toHaveBeenCalledTimes(1);
      expect(document.body.querySelector('[data-testid="ring-progress-tooltip"]')).toBeNull();
      view.unmount();
    });
  });

  describe('TasksView', () => {
    it('renders empty state when there are no due periodic or undated one-time tasks', () => {
      const view = mount(
        <TasksView
          periodicTasks={[]}
          oneTimeTasks={[]}
          showDetails={false}
          collapsedGroups={{}}
          onToggleGroup={vi.fn()}
          onReorderOneTime={vi.fn()}
          onSelect={vi.fn()}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      expect(view.container.textContent).toContain('No undated or periodic tasks due');
      view.unmount();
    });

    it('renders Recurring and One-Time sections with ring-only rows and no Completed section', () => {
      const periodic = makeTask('p-1', 'Clean kettle', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 2,
          maxIntervalValue: 4,
          intervalUnit: 'weeks',
        },
      });
      const oneTime = makeTask('o-1', 'Donate old monitor');

      const view = mount(
        <TasksView
          periodicTasks={[periodic]}
          oneTimeTasks={[oneTime]}
          showDetails={false}
          collapsedGroups={{}}
          onToggleGroup={vi.fn()}
          onReorderOneTime={vi.fn()}
          onSelect={vi.fn()}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      expect(view.container.querySelector('section[aria-label="Recurring"]')).toBeTruthy();
      expect(view.container.querySelector('section[aria-label="Periodic"]')).toBeNull();
      expect(view.container.querySelector('section[aria-label="One-Time"]')).toBeTruthy();
      expect(view.container.querySelector('section[aria-label="Completed"]')).toBeNull();
      expect(view.container.querySelector('[data-testid="radial-progress-ring"]')).toBeTruthy();
      expect(view.container.textContent).not.toContain('Not done yet');
      expect(view.container.textContent).toContain('Clean kettle');
      expect(view.container.textContent).toContain('Donate old monitor');
      view.unmount();
    });
  });

  describe('RecurringTasksView', () => {
    it('renders empty state when there are no active recurring tasks', () => {
      const view = mount(
        <RecurringTasksView
          tasks={[]}
          showDetails={false}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );
      const container = view.container.querySelector('[data-testid="recurring-tasks-view"]')!;
      expect(container.textContent).toContain('No active recurring tasks');
      expect(container.querySelectorAll('section')).toHaveLength(0);
      view.unmount();
    });

    it('renders active approximate (including before_min) and fixed tasks in a unified flat list ordered by closeness to due while excluding stopped/finished series', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 20, 12, 0)); // 2026-05-20

      // Opens in 4 days (May 24)
      const beforeMinApprox = makeTask('approx-before', 'Flush water heater', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 5,
          maxIntervalValue: 8,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 4, 19, 10, 0).getTime()],
      });

      const stoppedApprox = makeTask('approx-stopped', 'Seasonal gutter check', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 2,
          maxIntervalValue: 3,
          intervalUnit: 'weeks',
          endOnDate: '2026-05-10',
        },
        completionHistory: [new Date(2026, 4, 10, 10, 0).getTime()],
      });

      // Due in 2 days (May 22)
      const activeFixed = makeTask('fixed-active', 'Take out trash', {
        dueAt: '2026-05-22',
        startDate: '2026-05-01',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [5],
        },
      });

      const finishedFixed = makeTask('fixed-done', 'Old vitamin course', {
        dueAt: '2026-05-01',
        startDate: '2026-05-01',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'days',
          endOnDate: '2026-05-05',
        },
        completionHistory: [
          new Date(2026, 4, 1, 12, 0).getTime(),
          new Date(2026, 4, 2, 12, 0).getTime(),
          new Date(2026, 4, 3, 12, 0).getTime(),
          new Date(2026, 4, 4, 12, 0).getTime(),
          new Date(2026, 4, 5, 12, 0).getTime(),
        ],
      });

      const view = mount(
        <RecurringTasksView
          tasks={[beforeMinApprox, stoppedApprox, activeFixed, finishedFixed]}
          showDetails={false}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onEdit={vi.fn()}
          onDelete={vi.fn()}
        />
      );

      const list = view.container.querySelector('[data-testid="recurring-tasks-view"]')!;
      expect(list.querySelectorAll('section')).toHaveLength(0);

      const titles = Array.from(list.querySelectorAll('[data-testid="task-title"]')).map(
        (el) => el.textContent
      );
      expect(titles).toEqual(['Take out trash', 'Flush water heater']);
      expect(list.textContent).not.toContain('Seasonal gutter check');
      expect(list.textContent).not.toContain('Old vitamin course');
      expect(list.textContent).toContain('Every Fri');
      expect(list.textContent).toContain('Opens in 4 days · every 5–8 days');
      view.unmount();
    });

    it('orders mixed overdue, due-today, in-window, not_done_yet, and upcoming series (C3 + D2) and preserves per-type actions', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 10, 22, 12, 0)); // 2026-11-22

      const overdueFixed = makeTask('fixed-over', 'Daily pills', {
        dueAt: '2026-11-20',
        startDate: '2026-11-01',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'days' },
      });
      const dueTodayApprox = makeTask('approx-today', 'Exact max chore', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 17, 10, 0).getTime()],
      });
      const inWinApprox = makeTask('approx-inwin', 'Descaling cycle', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 18, 10, 0).getTime()],
      });
      const notDoneApprox = makeTask('approx-notdone', 'Brand new routine', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
      });
      const upcomingFixed1d = makeTask('fixed-1d', 'Trash tomorrow', {
        dueAt: '2026-11-23',
        startDate: '2026-11-02',
        recurrence: { type: 'fixed_interval', intervalValue: 1, intervalUnit: 'weeks' },
        completionHistory: [new Date(2026, 10, 16, 10, 0).getTime()],
      });
      const upcomingApprox2d = makeTask('approx-2d', 'Water ferns', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 3,
          maxIntervalValue: 5,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 10, 21, 10, 0).getTime()],
      });
      const upcomingAnnual60d = makeTask('annual-60d', 'Drain tank', {
        createdAt: new Date(2025, 11, 1).getTime(),
        recurrence: {
          type: 'annual_window',
          intervalValue: 1,
          intervalUnit: 'years',
          annualWindows: [{ startMonth: 1, startDay: 21, endMonth: 2, endDay: 20 }],
        },
        completionHistory: [new Date(2026, 1, 1, 10, 0).getTime()],
      });

      const onEdit = vi.fn();
      const onRequestLogDate = vi.fn();
      const onRequestChangeDate = vi.fn();
      const onRequestSkipOccurrence = vi.fn();
      const onRequestDelete = vi.fn();

      const view = mount(
        <RecurringTasksView
          tasks={[
            upcomingAnnual60d,
            notDoneApprox,
            upcomingApprox2d,
            overdueFixed,
            upcomingFixed1d,
            inWinApprox,
            dueTodayApprox,
          ]}
          showDetails={false}
          onClose={vi.fn()}
          onComplete={vi.fn()}
          onEdit={onEdit}
          onDelete={vi.fn()}
          onRequestLogDate={onRequestLogDate}
          onRequestChangeDate={onRequestChangeDate}
          onRequestSkipOccurrence={onRequestSkipOccurrence}
          onRequestDelete={onRequestDelete}
        />
      );

      const list = view.container.querySelector('[data-testid="recurring-tasks-view"]')!;
      const titles = Array.from(list.querySelectorAll('[data-testid="task-title"]')).map(
        (el) => el.textContent
      );
      expect(titles).toEqual([
        'Daily pills',
        'Exact max chore',
        'Descaling cycle',
        'Brand new routine',
        'Trash tomorrow',
        'Water ferns',
        'Drain tank',
      ]);

      expect(list.textContent).toContain('Last day of window · every 3–5 days');
      expect(list.textContent).toContain('1 day left · every 3–5 days');
      expect(list.textContent).toContain('Not done yet · every 3–5 days');
      expect(list.textContent).toContain('Opens in 2 days · every 3–5 days');
      expect(list.textContent).toContain('Starts Jan 21, 2027 (in 2 months) · Jan 21 – Feb 20');

      const rows = Array.from(list.children) as HTMLElement[];
      // Window row click calls onEdit(raw) and has Log Date action
      const waterFernsRow = rows[5];
      act(() => {
        waterFernsRow.click();
      });
      expect(onEdit).toHaveBeenLastCalledWith(upcomingApprox2d);
      const logBtn = waterFernsRow.querySelector<HTMLButtonElement>('button[aria-label="Log Date"]');
      expect(logBtn).toBeTruthy();
      act(() => {
        logBtn!.click();
      });
      expect(onRequestLogDate).toHaveBeenCalledTimes(1);
      expect(onRequestLogDate.mock.calls[0][0].id).toBe('approx-2d');

      // Fixed row click calls onEdit(projected) and delete passes raw task
      const trashRow = rows[4];
      act(() => {
        trashRow.click();
      });
      expect(onEdit.mock.calls[1][0].id).toBe('fixed-1d');
      expect(onEdit.mock.calls[1][0].dueAt).toBe('2026-11-23');

      const changeBtn = trashRow.querySelector<HTMLButtonElement>('button[aria-label="Change Date"]');
      const skipBtn = trashRow.querySelector<HTMLButtonElement>('button[aria-label="Skip Occurrence"]');
      const deleteBtn = trashRow.querySelector<HTMLButtonElement>('button[aria-label="Delete"]');
      expect(changeBtn).toBeTruthy();
      expect(skipBtn).toBeTruthy();
      expect(skipBtn!.disabled).toBe(false);
      act(() => {
        changeBtn!.click();
        skipBtn!.click();
        deleteBtn!.click();
      });
      expect(onRequestChangeDate).toHaveBeenCalledTimes(1);
      expect(onRequestSkipOccurrence).toHaveBeenCalledTimes(1);
      expect(onRequestDelete).toHaveBeenCalledWith(upcomingFixed1d);

      view.unmount();
    });
  });

  describe('DeleteConfirmDialog', () => {
    it('shows Stop Repeating (Keep History) and Delete Everything for recurring tasks with history', () => {
      const task = makeTask('rec-hist', 'Mop kitchen', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 7,
          maxIntervalValue: 10,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 4, 10, 12, 0).getTime()],
      });
      const onClose = vi.fn();
      const onConfirm = vi.fn();
      const onStopRepeating = vi.fn();

      const view = mount(
        <DeleteConfirmDialog
          isOpen={true}
          task={task}
          onClose={onClose}
          onConfirm={onConfirm}
          onStopRepeating={onStopRepeating}
        />
      );

      const buttons = Array.from(view.container.querySelectorAll('button')).map((b) => b.textContent?.trim());
      expect(buttons).toContain('Stop Repeating (Keep History)');
      expect(buttons).toContain('Delete Everything');

      const stopBtn = Array.from(view.container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Stop Repeating (Keep History)'
      );
      act(() => {
        stopBtn!.click();
      });

      expect(onClose).toHaveBeenCalledTimes(1);
      expect(onStopRepeating).toHaveBeenCalledWith(task);
      expect(onConfirm).not.toHaveBeenCalled();
      view.unmount();
    });

    it('shows Delete All Occurrences for recurring tasks without history and Delete for one-off tasks', () => {
      const recurringNoHist = makeTask('rec-empty', 'Empty Repeat', {
        dueAt: '2026-05-20',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
        },
        completionHistory: [],
      });

      const viewRec = mount(
        <DeleteConfirmDialog
          isOpen={true}
          task={recurringNoHist}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
          onStopRepeating={vi.fn()}
        />
      );
      expect(viewRec.container.textContent).toContain('Delete All Occurrences');
      expect(viewRec.container.textContent).not.toContain('Stop Repeating (Keep History)');
      viewRec.unmount();

      const oneOff = makeTask('one-off', 'Buy lightbulb');
      const viewOne = mount(
        <DeleteConfirmDialog
          isOpen={true}
          task={oneOff}
          onClose={vi.fn()}
          onConfirm={vi.fn()}
        />
      );
      const confirmBtn = Array.from(viewOne.container.querySelectorAll('button')).find(
        (b) => b.textContent?.trim() === 'Delete'
      );
      expect(confirmBtn).toBeTruthy();
      viewOne.unmount();
    });
  });

  describe('QuickAddSheet', () => {
    it('shows No date chip when opened with explicit defaultDueAt={null}', () => {
      const view = mount(
        <QuickAddSheet
          isOpen={true}
          defaultDueAt={null}
          onSave={vi.fn()}
          onClose={vi.fn()}
        />
      );
      const dateBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Date"]');
      expect(dateBtn).toBeTruthy();
      expect(dateBtn!.textContent).toContain('No date');
      view.unmount();
    });

    it('renders Completion History panel for existing window task and calls onRemoveCompletionTimestamp', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 20, 12, 0));

      const tsMay12 = new Date(2026, 4, 12, 12, 0, 0).getTime();
      const existingWindowTask = makeTask('edit-win', 'Change HVAC filter', {
        recurrence: {
          type: 'after_completion',
          intervalValue: 2,
          maxIntervalValue: 3,
          intervalUnit: 'months',
        },
        completionHistory: [tsMay12],
      });

      const onLogCompletionDate = vi.fn();
      const onRemoveCompletionTimestamp = vi.fn();

      const view = mount(
        <QuickAddSheet
          isOpen={true}
          initialTask={existingWindowTask}
          onSave={vi.fn()}
          onClose={vi.fn()}
          onLogCompletionDate={onLogCompletionDate}
          onRemoveCompletionTimestamp={onRemoveCompletionTimestamp}
        />
      );

      const repeatBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Repeat"]');
      expect(repeatBtn).toBeTruthy();
      expect(repeatBtn!.textContent).toContain('Approx');
      const lastDoneBtn = view.container.querySelector<HTMLButtonElement>('button[aria-label="Last done"]');
      expect(lastDoneBtn).toBeTruthy();
      expect(lastDoneBtn!.textContent).toContain('Last done:');

      const panel = view.container.querySelector('[data-testid="completion-history-panel"]');
      expect(panel).toBeTruthy();
      expect(panel!.textContent).toContain('Done 1 time');

      const logInput = panel!.querySelector<HTMLInputElement>('input[aria-label="Log past completion date"]');
      expect(logInput).toBeTruthy();

      const removeBtn = panel!.querySelector<HTMLButtonElement>('button[aria-label="Remove completion on 2026-05-12"]');
      expect(removeBtn).toBeTruthy();

      act(() => {
        removeBtn!.click();
      });

      expect(onRemoveCompletionTimestamp).toHaveBeenCalledWith('edit-win', tsMay12);
      view.unmount();
    });
  });

  describe('CalendarMonthView', () => {
    it("keeps today's date distinctly highlighted when another day is selected", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date(2026, 4, 20, 12, 0));

      const view = mount(
        <CalendarMonthView
          tasks={[]}
          year={2026}
          monthIndex={4}
          selectedDateStr="2026-05-15"
          expanded={true}
          onToggleExpanded={vi.fn()}
          onMonthChange={vi.fn()}
          onSelectDate={vi.fn()}
        />
      );

      const todayBtn = view.container.querySelector<HTMLButtonElement>('button[data-date="2026-05-20"]');
      const selectedBtn = view.container.querySelector<HTMLButtonElement>('button[data-date="2026-05-15"]');

      expect(todayBtn).toBeTruthy();
      expect(selectedBtn).toBeTruthy();
      expect(todayBtn!.getAttribute('aria-current')).toBe('date');
      expect(selectedBtn!.getAttribute('aria-current')).toBeNull();

      const todayNumeral = todayBtn!.querySelector('span');
      const selectedNumeral = selectedBtn!.querySelector('span');

      expect(todayNumeral!.className).toContain('bg-tt-blue-soft');
      expect(todayNumeral!.className).toContain('ring-1');
      expect(todayNumeral!.className).toContain('text-tt-blue');
      expect(todayNumeral!.className).not.toContain('bg-tt-blue text-white');

      expect(selectedNumeral!.className).toContain('bg-tt-blue');
      expect(selectedNumeral!.className).toContain('text-white');

      view.unmount();
    });
  });
});
