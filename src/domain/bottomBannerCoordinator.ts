import { useLayoutEffect, useSyncExternalStore } from 'react';

export type BottomBannerId = 'undo' | 'pwa-update' | 'sync-reconnect' | 'install';

const PRIORITY_ORDER: readonly BottomBannerId[] = [
  'undo',
  'pwa-update',
  'sync-reconnect',
  'install',
];

const activeBanners = new Set<BottomBannerId>();
const listeners = new Set<() => void>();
let currentWinner: BottomBannerId | null = null;

function computeWinner(): BottomBannerId | null {
  for (const id of PRIORITY_ORDER) {
    if (activeBanners.has(id)) return id;
  }
  return null;
}

function notifyIfChanged() {
  const next = computeWinner();
  if (next !== currentWinner) {
    currentWinner = next;
    for (const listener of listeners) {
      listener();
    }
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): BottomBannerId | null {
  return currentWinner;
}

/**
 * Coordinates mutually exclusive bottom-centered floating banners so lower-priority
 * prompts yield without visual overlap when a higher-priority banner is active.
 */
export function useBottomBannerSlot(id: BottomBannerId, active: boolean): boolean {
  useLayoutEffect(() => {
    if (!active) return;
    activeBanners.add(id);
    notifyIfChanged();
    return () => {
      activeBanners.delete(id);
      notifyIfChanged();
    };
  }, [id, active]);

  const winner = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  return active && winner === id;
}

export function resetBottomBannerCoordinator(): void {
  activeBanners.clear();
  notifyIfChanged();
}
