import type { PeriodicTask } from '../types/task';

/**
 * Merges local and remote tasks using Item-Level Last-Write-Wins (LWW)
 * and Set Union for completion histories.
 */
export function mergeTasks(
  localTasks: PeriodicTask[],
  remoteTasks: PeriodicTask[]
): PeriodicTask[] {
  const mergedMap = new Map<string, PeriodicTask>();

  const remoteMap = new Map<string, PeriodicTask>();
  for (const remote of remoteTasks) {
    remoteMap.set(remote.id, remote);
  }

  const localIds = new Set<string>();

  // Process all local tasks
  for (const local of localTasks) {
    localIds.add(local.id);
    const remote = remoteMap.get(local.id);

    if (!remote) {
      // Exists only locally
      mergedMap.set(local.id, { ...local });
      continue;
    }

    // Exists in both: resolve conflicts
    const merged = resolveTaskConflict(local, remote);
    mergedMap.set(local.id, merged);
  }

  // Process tasks that only exist in remote
  for (const remote of remoteTasks) {
    if (!localIds.has(remote.id)) {
      mergedMap.set(remote.id, { ...remote });
    }
  }

  return Array.from(mergedMap.values());
}

/**
 * Resolves conflict between a local and remote representation of the exact same task
 */
export function resolveTaskConflict(
  local: PeriodicTask,
  remote: PeriodicTask
): PeriodicTask {
  // 1. Merge completion history (Set Union)
  const allCompletions = Array.from(
    new Set([...(local.completionHistory || []), ...(remote.completionHistory || [])])
  ).sort((a, b) => a - b);

  // 2. Handle deletion tombstones
  const localDeleted = !!local.deletedAt;
  const remoteDeleted = !!remote.deletedAt;

  if (localDeleted || remoteDeleted) {
    // If both are deleted, take the later deletion
    if (localDeleted && remoteDeleted) {
      const winner = local.deletedAt! >= remote.deletedAt! ? local : remote;
      return {
        ...winner,
        completionHistory: allCompletions,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      };
    }

    // One is deleted, one is not
    const deletedTask = localDeleted ? local : remote;
    const activeTask = localDeleted ? remote : local;

    // If the active task was updated AFTER the deletion occurred, revive it!
    // Otherwise, the deletion tombstone wins.
    if (activeTask.updatedAt > deletedTask.deletedAt!) {
      return {
        ...activeTask,
        deletedAt: null,
        completionHistory: allCompletions,
      };
    } else {
      return {
        ...deletedTask,
        completionHistory: allCompletions,
        updatedAt: Math.max(local.updatedAt, remote.updatedAt),
      };
    }
  }

  // 3. Both are active: Last-Write-Wins based on updatedAt
  const winner = local.updatedAt >= remote.updatedAt ? local : remote;

  return {
    ...winner,
    completionHistory: allCompletions,
    updatedAt: Math.max(local.updatedAt, remote.updatedAt),
  };
}
