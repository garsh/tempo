import type { Task } from '../types/task';
import { getDueDatePart, getTaskUrgency, isCompleted } from './recurrence';
import { formatDate } from './recurrence';

export type TaskGroupId = 'overdue' | 'today' | 'tomorrow' | 'later' | 'nodate' | 'completed';

export interface TaskGroup {
  id: TaskGroupId;
  label: string;
  tasks: Task[];
}

/**
 * Group open tasks into TickTick-style sections for list views.
 * Completed one-offs go in a trailing Completed group when `includeCompleted` is true.
 */
export function groupTasksForListView(
  tasks: Task[],
  opts: { includeCompleted?: boolean; todayKey?: string } = {}
): TaskGroup[] {
  const todayKey = opts.todayKey ?? formatDate(new Date());
  const open: Task[] = [];
  const completed: Task[] = [];

  for (const t of tasks) {
    if (isCompleted(t)) completed.push(t);
    else open.push(t);
  }

  const overdue: Task[] = [];
  const today: Task[] = [];
  const tomorrow: Task[] = [];
  const later: Task[] = [];
  const nodate: Task[] = [];

  for (const t of open) {
    if (!t.dueAt) {
      nodate.push(t);
      continue;
    }
    const urgency = getTaskUrgency(t.dueAt);
    if (urgency === 'overdue') {
      overdue.push(t);
      continue;
    }
    const datePart = getDueDatePart(t.dueAt);
    if (datePart === todayKey) {
      today.push(t);
      continue;
    }
    // tomorrow / later within remaining
    const d = new Date(todayKey + 'T12:00:00');
    d.setDate(d.getDate() + 1);
    const tomKey = formatDate(d);
    if (datePart === tomKey) tomorrow.push(t);
    else later.push(t);
  }

  const groups: TaskGroup[] = [];
  if (overdue.length) groups.push({ id: 'overdue', label: 'Overdue', tasks: overdue });
  if (today.length) groups.push({ id: 'today', label: 'Today', tasks: today });
  if (tomorrow.length) groups.push({ id: 'tomorrow', label: 'Tomorrow', tasks: tomorrow });
  if (later.length) groups.push({ id: 'later', label: 'Later', tasks: later });
  if (nodate.length) groups.push({ id: 'nodate', label: 'No Date', tasks: nodate });
  if (opts.includeCompleted && completed.length) {
    groups.push({ id: 'completed', label: 'Completed', tasks: completed });
  }
  return groups;
}
