import { useEffect, useRef } from 'react';
import type { Task } from '../types/task';
import {
  isNotificationsEnabled,
  msUntilNextDue,
  notifyDueTasks,
} from '../domain/notifications';

const POLL_MS = 60_000;

/**
 * While the app is open (and notifications are enabled), fire due reminders
 * immediately, on an interval, when the tab becomes visible, and shortly
 * before the next timed due.
 */
export function useDueNotifications(tasks: Task[]): void {
  const tasksRef = useRef(tasks);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const run = () => {
      if (!isNotificationsEnabled()) return;
      notifyDueTasks(tasksRef.current);
    };

    const scheduleNext = () => {
      clearTimer();
      if (!isNotificationsEnabled()) return;

      const until = msUntilNextDue(tasksRef.current);
      const delay =
        until !== null ? Math.min(Math.max(until + 250, 1000), POLL_MS) : POLL_MS;
      timerRef.current = setTimeout(() => {
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

    const poll = setInterval(() => {
      run();
      scheduleNext();
    }, POLL_MS);

    return () => {
      clearTimer();
      clearInterval(poll);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [tasks]);
}
