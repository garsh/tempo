import type { Task } from '../types/task';
import { isWindowPeriodic } from './recurrence';
import { MAX_HISTORY } from './syncPayload';

/** Default retention window for soft-delete tombstones before automatic pruning during Drive sync. */
export const TOMBSTONE_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export interface MergePruneOptions {
  /** Drop tombstones (deletedAt != null) with deletedAt <= prunedBefore. */
  prunedBefore?: number;
  /**
   * Timestamp of this device's last successful sync against the same Drive file.
   * When `hasRemote` is true and `prunedBefore > 0`, a local-only active item with
   * `updatedAt <= localSyncedBefore && updatedAt <= prunedBefore`
   * was already synced before the prune and deleted+pruned remotely, so drop it.
   */
  localSyncedBefore?: number | null;
  /** True when remote data came from an actual Drive backup (not null/empty). */
  hasRemote?: boolean;
}

export function hasExpiredTombstones(
  items: ReadonlyArray<{ deletedAt?: number | null }>,
  cutoff: number
): boolean {
  if (!Number.isFinite(cutoff) || cutoff <= 0) return false;
  return items.some(
    (item) => typeof item.deletedAt === 'number' && item.deletedAt > 0 && item.deletedAt <= cutoff
  );
}

function capTail<T>(items: T[]): T[] {
  return items.length > MAX_HISTORY ? items.slice(-MAX_HISTORY) : items;
}

type Mergeable = {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
};

function mergeEntities<T extends Mergeable>(
  localItems: T[],
  remoteItems: T[],
  mergeExtras?: (local: T, remote: T, winner: T) => T,
  options?: MergePruneOptions
): T[] {
  const prunedBefore =
    options?.prunedBefore && Number.isFinite(options.prunedBefore) && options.prunedBefore > 0
      ? options.prunedBefore
      : 0;
  const canDropStaleActive = Boolean(
    options?.hasRemote &&
      prunedBefore > 0 &&
      options?.localSyncedBefore != null &&
      Number.isFinite(options.localSyncedBefore) &&
      options.localSyncedBefore > 0
  );
  const syncedBefore = canDropStaleActive ? options!.localSyncedBefore! : 0;
  const shouldPruneTombstone = (item: Mergeable): boolean =>
    Boolean(item.deletedAt && prunedBefore > 0 && item.deletedAt <= prunedBefore);

  const mergedMap = new Map<string, T>();
  const remoteMap = new Map<string, T>();
  for (const remote of remoteItems) {
    remoteMap.set(remote.id, remote);
  }

  const localIds = new Set<string>();

  for (const local of localItems) {
    localIds.add(local.id);
    const remote = remoteMap.get(local.id);

    if (!remote) {
      if (local.deletedAt) {
        if (shouldPruneTombstone(local)) continue;
      } else if (
        canDropStaleActive &&
        local.updatedAt <= syncedBefore &&
        local.updatedAt <= prunedBefore
      ) {
        continue;
      }
      mergedMap.set(local.id, { ...local });
      continue;
    }

    const merged = resolveConflict(local, remote, mergeExtras);
    if (shouldPruneTombstone(merged)) continue;
    mergedMap.set(local.id, merged);
  }

  for (const remote of remoteItems) {
    if (!localIds.has(remote.id)) {
      if (shouldPruneTombstone(remote)) continue;
      mergedMap.set(remote.id, { ...remote });
    }
  }

  return Array.from(mergedMap.values());
}

function resolveConflict<T extends Mergeable>(
  local: T,
  remote: T,
  mergeExtras?: (local: T, remote: T, winner: T) => T
): T {
  const localDeleted = !!local.deletedAt;
  const remoteDeleted = !!remote.deletedAt;

  let base: T;

  if (localDeleted || remoteDeleted) {
    if (localDeleted && remoteDeleted) {
      const winner = local.deletedAt! >= remote.deletedAt! ? local : remote;
      base = {
        ...winner,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      };
    } else {
      const deletedItem = localDeleted ? local : remote;
      const activeItem = localDeleted ? remote : local;

      if (activeItem.updatedAt > deletedItem.deletedAt!) {
        base = {
          ...activeItem,
          deletedAt: null,
        };
      } else {
        base = {
          ...deletedItem,
          updatedAt: Math.max(local.updatedAt, remote.updatedAt),
        };
      }
    }
  } else {
    const winner = local.updatedAt >= remote.updatedAt ? local : remote;
    base = {
      ...winner,
      updatedAt: Math.max(local.updatedAt, remote.updatedAt),
    };
  }

  return mergeExtras ? mergeExtras(local, remote, base) : base;
}

export function mergeTasks(
  localTasks: Task[],
  remoteTasks: Task[],
  options?: MergePruneOptions
): Task[] {
  return mergeEntities(
    localTasks,
    remoteTasks,
    (local, remote, winner) => {
      const allRemoved = capTail(
        Array.from(
          new Set([...(local.removedCompletions || []), ...(remote.removedCompletions || [])])
        ).sort((a, b) => a - b)
      );
      const removedSet = new Set(allRemoved);

      const allCompletions = capTail(
        Array.from(new Set([...(local.completionHistory || []), ...(remote.completionHistory || [])]))
          .filter((ts) => !removedSet.has(ts))
          .sort((a, b) => a - b)
      );

      const localSkippedSet = new Set(local.skippedDates || []);
      const remoteSkippedSet = new Set(remote.skippedDates || []);
      const localRemovedSkippedSet = new Set(local.removedSkippedDates || []);
      const remoteRemovedSkippedSet = new Set(remote.removedSkippedDates || []);
      const allSkipDateKeys = Array.from(
        new Set([
          ...localSkippedSet,
          ...remoteSkippedSet,
          ...localRemovedSkippedSet,
          ...remoteRemovedSkippedSet,
        ])
      ).sort();

      const skippedList: string[] = [];
      const removedSkippedList: string[] = [];
      const mergedSkippedUpdatedAtEntries: [string, number][] = [];

      for (const d of allSkipDateKeys) {
        const lTs = local.skippedDateUpdatedAt?.[d] ?? 0;
        const rTs = remote.skippedDateUpdatedAt?.[d] ?? 0;
        const maxTs = Math.max(lTs, rTs);
        let isSkipped: boolean;

        if (lTs > rTs) {
          isSkipped = localSkippedSet.has(d);
        } else if (rTs > lTs) {
          isSkipped = remoteSkippedSet.has(d);
        } else {
          // Equal or absent per-date timestamps (legacy data): tombstones win.
          const isRemoved = localRemovedSkippedSet.has(d) || remoteRemovedSkippedSet.has(d);
          isSkipped = !isRemoved && (localSkippedSet.has(d) || remoteSkippedSet.has(d));
        }

        if (isSkipped) {
          skippedList.push(d);
        } else if (localRemovedSkippedSet.has(d) || remoteRemovedSkippedSet.has(d)) {
          removedSkippedList.push(d);
        }
        if (maxTs > 0) {
          mergedSkippedUpdatedAtEntries.push([d, maxTs]);
        }
      }

      const allSkipped = capTail(skippedList);
      const allRemovedSkipped = capTail(removedSkippedList);
      const cappedSkippedUpdatedAt = capTail(mergedSkippedUpdatedAtEntries);

      const isWindow = isWindowPeriodic(winner);
      const isFixed = !isWindow && !!winner.recurrence;

      return {
        ...winner,
        startDate: isFixed ? winner.startDate || local.startDate || remote.startDate || null : null,
        completionHistory: allCompletions,
        ...(allRemoved.length > 0 ? { removedCompletions: allRemoved } : { removedCompletions: undefined }),
        skippedDates: allSkipped,
        ...(isWindow || allRemovedSkipped.length === 0
          ? { removedSkippedDates: undefined }
          : { removedSkippedDates: allRemovedSkipped }),
        ...(isWindow || cappedSkippedUpdatedAt.length === 0
          ? { skippedDateUpdatedAt: undefined }
          : { skippedDateUpdatedAt: Object.fromEntries(cappedSkippedUpdatedAt) }),
        ...(isFixed && winner.rescheduledDates
          ? { rescheduledDates: winner.rescheduledDates }
          : { rescheduledDates: undefined }),
        ...(isFixed && winner.scheduleHistory && winner.scheduleHistory.length > 0
          ? { scheduleHistory: winner.scheduleHistory }
          : { scheduleHistory: undefined }),
      };
    },
    options
  );
}
