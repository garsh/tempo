// @vitest-environment happy-dom
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TaskCard } from '../TaskCard';
import { RecurringTasksView } from '../RecurringTasksView';
import type { Task } from '../../types/task';
import { INBOX_LIST_ID } from '../../types/task';

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
    listId: INBOX_LIST_ID,
    dueAt: null,
    recurrence: null,
    completionHistory: [],
    createdAt: 1000,
    updatedAt: 1000,
    ...overrides,
  };
}

function classTokens(el: Element | null | undefined): string[] {
  return (el?.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean);
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe('TaskCard showDetails wrapping', () => {
  it('always wraps task titles and top-aligns row controls even when showDetails is false (default)', () => {
    const longTitle = 'A long task title that should always wrap onto multiple lines by default';
    const task = makeTask('task-1', longTitle, {
      dueAt: '2026-05-22',
      notes: 'Hidden notes line',
    });
    const view = mount(<TaskCard task={task} onComplete={vi.fn()} />);

    const title = view.container.querySelector('[data-testid="task-title"]');
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe(longTitle);
    const titleClasses = classTokens(title);
    expect(titleClasses).not.toContain('truncate');
    expect(titleClasses).toContain('min-w-0');
    expect(titleClasses).toContain('wrap-break-word');
    expect(titleClasses).toContain('text-pretty');

    const foreground = title!.closest('.relative.z-10');
    const foregroundClasses = classTokens(foreground);
    expect(foregroundClasses).toContain('items-start');
    expect(foregroundClasses).not.toContain('items-center');

    const checkboxButton = foreground!.querySelector(':scope > button');
    expect(classTokens(checkboxButton)).toContain('mt-[2.5px]');

    const metadataContainer = foreground!.lastElementChild;
    expect(classTokens(metadataContainer)).toContain('min-h-[26px]');
    expect(view.container.querySelector('[data-testid="task-notes-preview"]')).toBeNull();

    view.unmount();
  });

  it('wraps full task titles, subtitles, and multi-line descriptions when showDetails is true', () => {
    const longTitle =
      'Inspect and replace all upstairs and downstairs HVAC air filters before the summer heat wave arrives';
    const multiLineNotes =
      'Line 1: use 16x25x1 MERV 11 filters\nLine 2: check airflow arrow direction';
    const task = makeTask('task-2', longTitle, {
      dueAt: '2026-05-22',
      notes: `  ${multiLineNotes}  `,
    });
    const view = mount(
      <TaskCard
        task={task}
        showDetails={true}
        subtitle="Every week on Friday until end of season"
        onComplete={vi.fn()}
      />
    );

    const title = view.container.querySelector('[data-testid="task-title"]');
    expect(title).toBeTruthy();
    expect(title!.textContent).toBe(longTitle);
    const titleClasses = classTokens(title);
    expect(titleClasses).not.toContain('truncate');
    expect(titleClasses).toContain('min-w-0');
    expect(titleClasses).toContain('wrap-break-word');
    expect(titleClasses).toContain('text-pretty');

    const foreground = title!.closest('.relative.z-10');
    const foregroundClasses = classTokens(foreground);
    expect(foregroundClasses).toContain('items-start');
    expect(foregroundClasses).not.toContain('items-center');

    const checkboxButton = foreground!.querySelector(':scope > button');
    expect(classTokens(checkboxButton)).toContain('mt-[2.5px]');

    const metadataContainer = foreground!.lastElementChild;
    expect(classTokens(metadataContainer)).toContain('min-h-[26px]');

    const notesPreview = view.container.querySelector('[data-testid="task-notes-preview"]');
    expect(notesPreview).toBeTruthy();
    expect(notesPreview!.textContent).toBe(multiLineNotes);
    const notesClasses = classTokens(notesPreview);
    expect(notesClasses).not.toContain('truncate');
    expect(notesClasses).toContain('whitespace-pre-wrap');
    expect(notesClasses).toContain('wrap-break-word');

    const subtitleEl = notesPreview!.previousElementSibling;
    expect(subtitleEl).toBeTruthy();
    expect(subtitleEl!.textContent).toBe('Every week on Friday until end of season');
    const subtitleClasses = classTokens(subtitleEl);
    expect(subtitleClasses).not.toContain('truncate');
    expect(subtitleClasses).toContain('wrap-break-word');
    expect(subtitleClasses).toContain('text-pretty');

    view.unmount();
  });

  it('wraps task titles while truncating notesSnippet and subtitle when showDetails is false', () => {
    const task = makeTask('task-2b', 'Check filters', {
      notes: 'Long notes text',
    });
    const view = mount(
      <TaskCard
        task={task}
        showDetails={false}
        subtitle="Every week on Friday"
        notesSnippet="...matching snippet..."
        onComplete={vi.fn()}
      />
    );

    const title = view.container.querySelector('[data-testid="task-title"]');
    expect(title).toBeTruthy();
    const titleClasses = classTokens(title);
    expect(titleClasses).not.toContain('truncate');
    expect(titleClasses).toContain('min-w-0');
    expect(titleClasses).toContain('wrap-break-word');
    expect(titleClasses).toContain('text-pretty');

    const notesPreview = view.container.querySelector('[data-testid="task-notes-preview"]');
    expect(notesPreview).toBeTruthy();
    const notesClasses = classTokens(notesPreview);
    expect(notesClasses).toContain('truncate');
    expect(notesClasses).not.toContain('whitespace-pre-wrap');
    expect(notesClasses).not.toContain('wrap-break-word');

    const subtitleEl = notesPreview!.previousElementSibling;
    expect(subtitleEl).toBeTruthy();
    const subtitleClasses = classTokens(subtitleEl);
    expect(subtitleClasses).toContain('truncate');
    expect(subtitleClasses).not.toContain('wrap-break-word');
    expect(subtitleClasses).not.toContain('text-pretty');

    view.unmount();
  });

  it('preserves search highlighting in wrapped titles and wraps notesSnippet when showDetails is true', () => {
    const longTitle =
      'Call regional HVAC contractor about annual maintenance plan and filter replacement schedule';
    const task = makeTask('task-3', longTitle, {
      notes: 'Full notes text that should be replaced by snippet',
    });
    const view = mount(
      <TaskCard
        task={task}
        showDetails={true}
        highlightTokens={['hvac', 'filter']}
        notesSnippet="...need 16x25x1 filter pack from hardware store..."
        onComplete={vi.fn()}
      />
    );

    const title = view.container.querySelector('[data-testid="task-title"]');
    expect(title).toBeTruthy();
    const titleClasses = classTokens(title);
    expect(titleClasses).not.toContain('truncate');
    expect(titleClasses).toContain('wrap-break-word');
    expect(titleClasses).toContain('text-pretty');

    const titleMarks = Array.from(title!.querySelectorAll('mark.tt-search-mark')).map(
      (m) => m.textContent
    );
    expect(titleMarks).toEqual(['HVAC', 'filter']);

    const previews = view.container.querySelectorAll('[data-testid="task-notes-preview"]');
    expect(previews.length).toBe(1);
    const previewClasses = classTokens(previews[0]);
    expect(previewClasses).not.toContain('truncate');
    expect(previewClasses).toContain('whitespace-pre-wrap');
    expect(previewClasses).toContain('wrap-break-word');
    expect(previews[0].querySelectorAll('mark.tt-search-mark').length).toBe(1);

    view.unmount();
  });
});

describe('RecurringTasksView showDetails wrapping', () => {
  it('always wraps titles in Approximately and On Fixed Interval while toggling subtitle and notes wrapping with showDetails', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 20, 12, 0));

    const approxTask = makeTask(
      'approx-1',
      'Flush hot water heater sediment valve and inspect sacrificial anode rod carefully',
      {
        notes: 'Check drain hose in utility closet',
        recurrence: {
          type: 'after_completion',
          intervalValue: 5,
          maxIntervalValue: 8,
          intervalUnit: 'days',
        },
        completionHistory: [new Date(2026, 4, 19, 10, 0).getTime()],
      }
    );

    const fixedTask = makeTask(
      'fixed-1',
      'Take recycling bins and compost container out to the curb before early morning pickup',
      {
        dueAt: '2026-05-22',
        startDate: '2026-05-01',
        notes: 'Friday pickup at 7am',
        recurrence: {
          type: 'fixed_interval',
          intervalValue: 1,
          intervalUnit: 'weeks',
          weekdays: [5],
        },
      }
    );

    const viewTrue = mount(
      <RecurringTasksView
        tasks={[approxTask, fixedTask]}
        showDetails={true}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const approxTrue = viewTrue.container.querySelector('section[aria-label="Approximately"]');
    const fixedTrue = viewTrue.container.querySelector('section[aria-label="On Fixed Interval"]');
    expect(approxTrue).toBeTruthy();
    expect(fixedTrue).toBeTruthy();

    for (const section of [approxTrue!, fixedTrue!]) {
      const titles = section.querySelectorAll('[data-testid="task-title"]');
      expect(titles.length).toBe(1);
      const classes = classTokens(titles[0]);
      expect(classes).not.toContain('truncate');
      expect(classes).toContain('min-w-0');
      expect(classes).toContain('wrap-break-word');
      expect(classes).toContain('text-pretty');
    }
    const fixedNotesTrue = fixedTrue!.querySelector('[data-testid="task-notes-preview"]');
    expect(fixedNotesTrue).toBeTruthy();
    const fixedSubtitleTrue = fixedNotesTrue!.previousElementSibling;
    expect(fixedSubtitleTrue).toBeTruthy();
    expect(classTokens(fixedSubtitleTrue)).not.toContain('truncate');
    expect(classTokens(fixedSubtitleTrue)).toContain('wrap-break-word');
    expect(classTokens(fixedSubtitleTrue)).toContain('text-pretty');
    viewTrue.unmount();

    const viewFalse = mount(
      <RecurringTasksView
        tasks={[approxTask, fixedTask]}
        showDetails={false}
        onClose={vi.fn()}
        onComplete={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />
    );

    const approxFalse = viewFalse.container.querySelector('section[aria-label="Approximately"]');
    const fixedFalse = viewFalse.container.querySelector('section[aria-label="On Fixed Interval"]');
    expect(approxFalse).toBeTruthy();
    expect(fixedFalse).toBeTruthy();

    for (const section of [approxFalse!, fixedFalse!]) {
      const titles = section.querySelectorAll('[data-testid="task-title"]');
      expect(titles.length).toBe(1);
      const classes = classTokens(titles[0]);
      expect(classes).not.toContain('truncate');
      expect(classes).toContain('min-w-0');
      expect(classes).toContain('wrap-break-word');
      expect(classes).toContain('text-pretty');
      expect(section.querySelector('[data-testid="task-notes-preview"]')).toBeNull();
    }
    const fixedTitleWrapperFalse = fixedFalse!.querySelector('[data-testid="task-title"]')!.parentElement!;
    const fixedSubtitleFalse = fixedTitleWrapperFalse.nextElementSibling;
    expect(fixedSubtitleFalse).toBeTruthy();
    expect(classTokens(fixedSubtitleFalse)).toContain('truncate');
    viewFalse.unmount();
  });
});
