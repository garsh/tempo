// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CalendarMonthView } from '../CalendarMonthView';
import { formatDate } from '../../domain/recurrence';
import { INBOX_LIST_ID, type Task } from '../../types/task';

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

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Math.random().toString(36).slice(2, 7)}`,
    listId: INBOX_LIST_ID,
    title: 'Test Task',
    dueAt: null,
    completionHistory: [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  };
}

describe('Calendar Overdue Display', () => {
  const mounted: Array<() => void> = [];

  afterEach(() => {
    while (mounted.length > 0) {
      mounted.pop()!();
    }
  });

  describe('CalendarMonthView Dots', () => {
    it('renders red dot for past date with uncompleted task and blue dot for future date', () => {
      const now = new Date();
      const pastDate = new Date(now.getFullYear(), now.getMonth(), 1); // 1st of current month
      const pastStr = formatDate(pastDate);
      const futureDate = new Date(now.getFullYear(), now.getMonth(), 28);
      const futureStr = formatDate(futureDate);
      const todayStr = formatDate(now);

      // Only test if pastStr < todayStr and futureStr > todayStr
      const tasks: Task[] = [
        makeTask({ id: 't-past', title: 'Past Task', dueAt: pastStr }),
        makeTask({ id: 't-future', title: 'Future Task', dueAt: futureStr }),
      ];

      const { container, unmount } = mount(
        <CalendarMonthView
          tasks={tasks}
          year={now.getFullYear()}
          monthIndex={now.getMonth()}
          selectedDateStr={todayStr}
          expanded={true}
          onToggleExpanded={vi.fn()}
          onMonthChange={vi.fn()}
          onSelectDate={vi.fn()}
        />
      );
      mounted.push(unmount);

      const pastButton = container.querySelector(`button[data-date="${pastStr}"]`);
      const futureButton = container.querySelector(`button[data-date="${futureStr}"]`);

      expect(pastButton).toBeDefined();
      expect(futureButton).toBeDefined();

      if (pastStr < todayStr) {
        const pastDot = pastButton?.querySelector('span.rounded-full.-mt-1');
        expect(pastDot?.className).toContain('bg-tt-overdue');
      }

      if (futureStr > todayStr) {
        const futureDot = futureButton?.querySelector('span.rounded-full.-mt-1');
        expect(futureDot?.className).toContain('bg-tt-blue');
      }
    });
  });
});
