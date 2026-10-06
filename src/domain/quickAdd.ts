import type { TaskInput, TaskPriority } from '../types/task';

export type QuickAddDraft = {
  title: string;
  notes: string;
  dueAt: string | null;
  priority: TaskPriority;
  listId: string;
  tags: string[];
};

/**
 * Build the TaskInput for a quick-add submit. Returns null when the title is blank
 * (Enter / paper-plane should no-op).
 */
export function buildQuickAddTask(draft: QuickAddDraft): TaskInput | null {
  const title = draft.title.trim();
  if (!title) return null;
  return {
    title,
    notes: draft.notes.trim() || undefined,
    listId: draft.listId,
    dueAt: draft.dueAt,
    priority: draft.priority,
    tags: draft.tags.length ? draft.tags : undefined,
    recurrence: null,
  };
}

/**
 * TickTick stays in add mode after submit: clear title + description, keep the
 * date / priority / list / tags so the next task on the same day is one Enter away.
 */
export function resetAfterQuickAdd(draft: QuickAddDraft): QuickAddDraft {
  return { ...draft, title: '', notes: '' };
}

/**
 * Title field Enter / enterKeyHint=done: never insert a newline; treat as submit.
 * Description still allows Enter for newlines.
 */
export function titleEnterShouldSubmit(key: string, field: 'title' | 'notes'): boolean {
  return field === 'title' && key === 'Enter';
}
