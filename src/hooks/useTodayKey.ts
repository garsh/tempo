import { useSyncExternalStore } from 'react';
import { formatDate } from '../domain/recurrence';

let currentKey = formatDate(new Date());
const listeners = new Set<() => void>();
let midnightTimer: ReturnType<typeof setTimeout> | null = null;
let listenersAttached = false;

function clearMidnightTimer() {
  if (midnightTimer !== null) {
    clearTimeout(midnightTimer);
    midnightTimer = null;
  }
}

function checkForDayChange() {
  const nextKey = formatDate(new Date());
  if (nextKey !== currentKey) {
    currentKey = nextKey;
    for (const listener of listeners) {
      listener();
    }
  }
  if (listeners.size > 0) {
    scheduleMidnightCheck();
  }
}

function scheduleMidnightCheck() {
  clearMidnightTimer();
  const now = new Date();
  // Fire 500ms past next local midnight so formatDate(new Date()) is safely on the new day.
  const nextMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() + 1,
    0,
    0,
    0,
    500
  );
  const delayMs = Math.max(1_000, nextMidnight.getTime() - now.getTime());
  midnightTimer = setTimeout(checkForDayChange, delayMs);
}

function handleVisibilityChange() {
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
    return;
  }
  checkForDayChange();
}

function handleWindowFocusOrPageShow() {
  checkForDayChange();
}

function attachGlobalListeners() {
  if (listenersAttached) return;
  listenersAttached = true;
  if (typeof window !== 'undefined') {
    window.addEventListener('focus', handleWindowFocusOrPageShow);
    window.addEventListener('pageshow', handleWindowFocusOrPageShow);
  }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', handleVisibilityChange);
  }
}

function detachGlobalListeners() {
  if (!listenersAttached) return;
  listenersAttached = false;
  if (typeof window !== 'undefined') {
    window.removeEventListener('focus', handleWindowFocusOrPageShow);
    window.removeEventListener('pageshow', handleWindowFocusOrPageShow);
  }
  if (typeof document !== 'undefined') {
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  }
}

function subscribe(listener: () => void): () => void {
  const wasEmpty = listeners.size === 0;
  listeners.add(listener);
  if (wasEmpty) {
    currentKey = formatDate(new Date());
    attachGlobalListeners();
    scheduleMidnightCheck();
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) {
      clearMidnightTimer();
      detachGlobalListeners();
    }
  };
}

function getSnapshot(): string {
  const actual = formatDate(new Date());
  if (actual !== currentKey) {
    currentKey = actual;
  }
  return currentKey;
}

/**
 * Returns today's local YYYY-MM-DD key and updates all subscribers at local midnight
 * or when the app wakes / regains focus on a new calendar day.
 */
export function useTodayKey(): string {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
