import type {
  DueFilterBucket,
  FilterCriteria,
  SavedFilter,
  Task,
  TaskPriority,
} from '../types/task';
import { getDaysDifference, getTaskUrgency, isCompleted } from './recurrence';

export function dueBucketForTask(task: Task, now: Date = new Date()): DueFilterBucket {
  if (!task.dueAt) return 'none';
  const urgency = getTaskUrgency(task.dueAt, now);
  if (urgency === 'overdue') return 'overdue';
  if (urgency === 'due_today') return 'today';
  const diff = getDaysDifference(task.dueAt, now);
  if (diff === 1) return 'tomorrow';
  if (diff >= 2 && diff <= 6) return 'next7';
  if (diff > 6) return 'later';
  // upcoming within 3 days that's not tomorrow — still next7-ish
  if (urgency === 'upcoming') return 'next7';
  return 'later';
}

function matchesTags(task: Task, tags: string[]): boolean {
  if (tags.length === 0) return true;
  const taskTags = task.tags || [];
  return tags.some((t) => taskTags.includes(t));
}

function matchesPriorities(task: Task, priorities: TaskPriority[]): boolean {
  if (priorities.length === 0) return true;
  const p = task.priority ?? 'none';
  return priorities.includes(p);
}

function matchesDueBuckets(task: Task, buckets: DueFilterBucket[], now: Date): boolean {
  if (buckets.length === 0) return true;
  return buckets.includes(dueBucketForTask(task, now));
}

function matchesLists(task: Task, listIds: string[]): boolean {
  if (listIds.length === 0) return true;
  return listIds.includes(task.listId);
}

function matchesQuery(task: Task, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if (task.title.toLowerCase().includes(q)) return true;
  if (task.notes?.toLowerCase().includes(q)) return true;
  if (task.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  return false;
}

/**
 * Evaluate whether a single task matches criteria under AND or OR semantics.
 * - AND: every *non-empty* criterion group must match.
 * - OR: at least one *non-empty* criterion group must match (if none set, match all).
 */
export function taskMatchesCriteria(
  task: Task,
  criteria: FilterCriteria,
  match: 'and' | 'or',
  now: Date = new Date()
): boolean {
  const checks: boolean[] = [];

  if (criteria.tags && criteria.tags.length > 0) {
    checks.push(matchesTags(task, criteria.tags));
  }
  if (criteria.priorities && criteria.priorities.length > 0) {
    checks.push(matchesPriorities(task, criteria.priorities));
  }
  if (criteria.dueBuckets && criteria.dueBuckets.length > 0) {
    checks.push(matchesDueBuckets(task, criteria.dueBuckets, now));
  }
  if (criteria.listIds && criteria.listIds.length > 0) {
    checks.push(matchesLists(task, criteria.listIds));
  }
  if (criteria.query && criteria.query.trim()) {
    checks.push(matchesQuery(task, criteria.query));
  }
  if (criteria.pinnedOnly) {
    checks.push(!!task.pinned);
  }

  if (checks.length === 0) return true;
  return match === 'and' ? checks.every(Boolean) : checks.some(Boolean);
}

export function applySavedFilter(
  tasks: Task[],
  filter: Pick<SavedFilter, 'criteria' | 'match'>,
  now: Date = new Date(),
  includeCompleted: boolean = false
): Task[] {
  return tasks.filter((t) => {
    if (t.deletedAt) return false;
    if (!includeCompleted && isCompleted(t)) return false;
    return taskMatchesCriteria(t, filter.criteria, filter.match, now);
  });
}
