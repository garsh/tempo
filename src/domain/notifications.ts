import type { Task } from '../types/task';
import { getDueDeadline, isCompleted } from './recurrence';

const STORAGE_ENABLED = 'tempo_notifications_enabled';
const STORAGE_FIRED = 'tempo_notifications_fired';

export type NotificationPermissionState = NotificationPermission | 'unsupported';

export function notificationsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window;
}

export function getNotificationPermission(): NotificationPermissionState {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.permission;
}

export function isNotificationsEnabled(): boolean {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem(STORAGE_ENABLED) === '1';
}

export function setNotificationsEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_ENABLED, enabled ? '1' : '0');
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (!notificationsSupported()) return 'unsupported';
  const result = await Notification.requestPermission();
  if (result === 'granted') {
    setNotificationsEnabled(true);
  }
  return result;
}

function readFiredMap(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_FIRED);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, number>;
  } catch {
    return {};
  }
}

function writeFiredMap(map: Record<string, number>): void {
  // Cap size to avoid unbounded growth
  const entries = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 200);
  localStorage.setItem(STORAGE_FIRED, JSON.stringify(Object.fromEntries(entries)));
}

/**
 * Key for a due occurrence so we don't re-notify the same deadline.
 */
export function notificationKey(task: Task): string {
  return `${task.id}::${task.dueAt ?? 'none'}`;
}

/**
 * Tasks that should fire a due reminder right now:
 * - open (not completed one-off, not deleted)
 * - has dueAt
 * - deadline <= now
 * - not already notified for this dueAt
 */
export function getTasksNeedingNotification(
  tasks: Task[],
  now: Date = new Date(),
  fired: Record<string, number> = readFiredMap()
): Task[] {
  return tasks.filter((t) => {
    if (t.deletedAt || isCompleted(t) || !t.dueAt) return false;
    const deadline = getDueDeadline(t.dueAt);
    if (deadline.getTime() > now.getTime()) return false;
    const key = notificationKey(t);
    return !fired[key];
  });
}

export function markNotified(tasks: Task[]): void {
  const map = readFiredMap();
  const now = Date.now();
  for (const t of tasks) {
    map[notificationKey(t)] = now;
  }
  writeFiredMap(map);
}

/**
 * Show browser notifications for due tasks. Returns how many were shown.
 */
export function notifyDueTasks(tasks: Task[]): number {
  if (!notificationsSupported()) return 0;
  if (Notification.permission !== 'granted') return 0;
  if (!isNotificationsEnabled()) return 0;

  const due = getTasksNeedingNotification(tasks);
  if (due.length === 0) return 0;

  for (const task of due) {
    const body = task.dueAt
      ? `Due: ${task.dueAt.replace('T', ' ')}${task.notes ? ` — ${task.notes.slice(0, 80)}` : ''}`
      : task.notes?.slice(0, 100) || 'Task is due';
    try {
      new Notification(`Tempo: ${task.title}`, {
        body,
        tag: notificationKey(task),
        silent: false,
      });
    } catch {
      // Ignore — some browsers require service worker for Notification in insecure contexts
    }
  }

  markNotified(due);
  return due.length;
}

/**
 * Milliseconds until the next future due deadline among open tasks, or null.
 * Used to schedule a wake-up timer while the app is open.
 */
export function msUntilNextDue(tasks: Task[], now: Date = new Date()): number | null {
  let soonest: number | null = null;
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t) || !t.dueAt) continue;
    const deadline = getDueDeadline(t.dueAt).getTime();
    const delta = deadline - now.getTime();
    if (delta <= 0) continue;
    if (soonest === null || delta < soonest) soonest = delta;
  }
  return soonest;
}
