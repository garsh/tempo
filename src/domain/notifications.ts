import type { Task } from '../types/task';
import { getDueDeadline, hasDueTime, isCompleted, parseDate } from './recurrence';

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
  const entries = Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 200);
  localStorage.setItem(STORAGE_FIRED, JSON.stringify(Object.fromEntries(entries)));
}

/**
 * Key for a due occurrence so we don't re-notify the same deadline.
 */
export function notificationKey(task: Task): string {
  return `${task.id}::${task.dueAt ?? 'none'}`;
}

/**
 * When a task's reminder fires: at its due time, or — for date-only tasks — at
 * Settings › Date & Time › Default reminder time (HH:MM) on the due day. Without a
 * default time, date-only tasks fall back to the end of the due day.
 */
export function getReminderTime(dueAt: string, defaultReminderTime?: string): Date {
  if (hasDueTime(dueAt) || !defaultReminderTime) return getDueDeadline(dueAt);
  const [h, m] = defaultReminderTime.split(':').map((n) => parseInt(n, 10));
  if (Number.isNaN(h) || Number.isNaN(m)) return getDueDeadline(dueAt);
  const d = parseDate(dueAt);
  d.setHours(h, m, 0, 0);
  return d;
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
  fired: Record<string, number> = readFiredMap(),
  defaultReminderTime?: string
): Task[] {
  return tasks.filter((t) => {
    if (t.deletedAt || isCompleted(t) || !t.dueAt) return false;
    const deadline = getReminderTime(t.dueAt, defaultReminderTime);
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

/** Drop fired entries for a task (e.g. after complete or due change). */
export function clearFiredForTask(taskId: string): void {
  const map = readFiredMap();
  let changed = false;
  for (const key of Object.keys(map)) {
    if (key.startsWith(`${taskId}::`)) {
      delete map[key];
      changed = true;
    }
  }
  if (changed) writeFiredMap(map);
}

async function showViaServiceWorker(title: string, options: NotificationOptions): Promise<boolean> {
  if (!('serviceWorker' in navigator)) return false;
  try {
    const reg = await navigator.serviceWorker.getRegistration();
    if (!reg) return false;
    await reg.showNotification(title, options);
    return true;
  } catch {
    return false;
  }
}

/**
 * Show browser notifications for due tasks. Prefers the service worker
 * (more reliable for installed PWAs), falls back to `new Notification`.
 */
export function notifyDueTasks(tasks: Task[], defaultReminderTime?: string): number {
  if (!notificationsSupported()) return 0;
  if (Notification.permission !== 'granted') return 0;
  if (!isNotificationsEnabled()) return 0;

  const due = getTasksNeedingNotification(tasks, new Date(), readFiredMap(), defaultReminderTime);
  if (due.length === 0) return 0;

  // Fire async SW path without blocking; mark notified immediately to avoid duplicates
  markNotified(due);

  for (const task of due) {
    const body = task.dueAt
      ? `Due: ${task.dueAt.replace('T', ' ')}${task.notes ? ` — ${task.notes.slice(0, 80)}` : ''}`
      : task.notes?.slice(0, 100) || 'Task is due';
    const options: NotificationOptions = {
      body,
      tag: notificationKey(task),
      silent: false,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      // Keep notification until user interacts when supported
      requireInteraction: false,
      data: { taskId: task.id, url: '/' },
    };

    void (async () => {
      const viaSw = await showViaServiceWorker(`Tempo: ${task.title}`, options);
      if (viaSw) return;
      try {
        new Notification(`Tempo: ${task.title}`, options);
      } catch {
        /* insecure context / unsupported */
      }
    })();
  }

  return due.length;
}

/**
 * Milliseconds until the next future due deadline among open tasks, or null.
 */
export function msUntilNextDue(
  tasks: Task[],
  now: Date = new Date(),
  defaultReminderTime?: string
): number | null {
  let soonest: number | null = null;
  for (const t of tasks) {
    if (t.deletedAt || isCompleted(t) || !t.dueAt) continue;
    const deadline = getReminderTime(t.dueAt, defaultReminderTime).getTime();
    const delta = deadline - now.getTime();
    if (delta <= 0) continue;
    if (soonest === null || delta < soonest) soonest = delta;
  }
  return soonest;
}

/** Register a click handler so tapping a notification focuses Tempo. */
export function registerNotificationClickHandler(): void {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'NOTIFICATION_CLICK') {
      window.focus();
    }
  });
}
