import { useEffect, useRef } from 'react';
import type { Task } from '../types/task';
import {
  isNotificationsEnabled,
  msUntilNextDue,
  notifyDueTasks,
  registerNotificationClickHandler,
} from '../domain/notifications';
import { getPrefs } from '../prefs/prefs';

const POLL_MS = 60_000;

/**
 * While the app is open (and notifications are enabled), fire due reminders
 * immediately, on an interval, when the tab becomes visible / online,
 * and shortly before the next timed due.
 */
export function useDueNotifications(tasks: Task[]): void {
  const tasksRef = useRef(tasks);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    registerNotificationClickHandler();

    let timer: ReturnType<typeof setTimeout> | null = null;

    const clearTimer = () => {
      if (timer) {
        clearTimeout(timer);
        timer = null;
      }
    };

    const run = () => {
      if (!isNotificationsEnabled()) return;
      notifyDueTasks(tasksRef.current, getPrefs().defaultReminderTime);
    };

    const scheduleNext = () => {
      clearTimer();
      if (!isNotificationsEnabled()) return;

      const until = msUntilNextDue(tasksRef.current, new Date(), getPrefs().defaultReminderTime);
      const delay =
        until !== null ? Math.min(Math.max(until + 250, 1000), POLL_MS) : POLL_MS;
      timer = setTimeout(() => {
        run();
        scheduleNext();
      }, delay);
    };

    run();
    scheduleNext();

    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        run();
        scheduleNext();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    const onOnline = () => {
      run();
      scheduleNext();
    };
    window.addEventListener('online', onOnline);

    const onFocus = () => {
      run();
      scheduleNext();
    };
    window.addEventListener('focus', onFocus);

    const poll = setInterval(() => {
      run();
      scheduleNext();
    }, POLL_MS);

    return () => {
      clearTimer();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onFocus);
    };
    // Stable once — tasks read via ref so we don't thrash timers on every Dexie update
  }, []);
}
