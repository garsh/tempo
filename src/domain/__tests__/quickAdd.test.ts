import { describe, it, expect } from 'vitest';
import { buildQuickAddTask, resetAfterQuickAdd, titleEnterShouldSubmit } from '../quickAdd';
import { dueAtForSelectedDay } from '../calendarUi';
import { INBOX_LIST_ID } from '../../types/task';

const base = {
  title: '  Buy milk  ',
  notes: '2%',
  dueAt: '2026-10-06' as string | null,
  priority: 'high' as const,
  listId: INBOX_LIST_ID,
  tags: ['errand'],
};

describe('quick-add submit', () => {
  it('builds a task with dueDate = selected day; blank title is a no-op', () => {
    const task = buildQuickAddTask(base);
    expect(task).toMatchObject({
      title: 'Buy milk',
      notes: '2%',
      dueAt: '2026-10-06',
      priority: 'high',
      tags: ['errand'],
    });
    expect(buildQuickAddTask({ ...base, title: '   ' })).toBeNull();
  });

  it('Enter on title submits; Enter on notes does not', () => {
    expect(titleEnterShouldSubmit('Enter', 'title')).toBe(true);
    expect(titleEnterShouldSubmit('Enter', 'notes')).toBe(false);
    expect(titleEnterShouldSubmit('a', 'title')).toBe(false);
  });

  it('stays open: clears title+notes, keeps due/list/priority/tags', () => {
    const next = resetAfterQuickAdd(base);
    expect(next).toEqual({
      title: '',
      notes: '',
      dueAt: '2026-10-06',
      priority: 'high',
      listId: INBOX_LIST_ID,
      tags: ['errand'],
    });
  });

  it('calendar FAB dueDate equals the selected day', () => {
    expect(dueAtForSelectedDay('2026-10-09', '2026-10-06')).toBe('2026-10-09');
    const task = buildQuickAddTask({
      ...base,
      dueAt: dueAtForSelectedDay('2026-10-09'),
      title: 'From cal',
      notes: '',
      tags: [],
    });
    expect(task?.dueAt).toBe('2026-10-09');
  });
});
