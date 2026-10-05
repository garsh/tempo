import type { Folder, Task, TaskList } from '../types/task';

type Mergeable = {
  id: string;
  updatedAt: number;
  deletedAt?: number | null;
};

function mergeEntities<T extends Mergeable>(
  localItems: T[],
  remoteItems: T[],
  mergeExtras?: (local: T, remote: T, winner: T) => T
): T[] {
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
      mergedMap.set(local.id, { ...local });
      continue;
    }

    const merged = resolveConflict(local, remote, mergeExtras);
    mergedMap.set(local.id, merged);
  }

  for (const remote of remoteItems) {
    if (!localIds.has(remote.id)) {
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

export function mergeTasks(localTasks: Task[], remoteTasks: Task[]): Task[] {
  return mergeEntities(localTasks, remoteTasks, (local, remote, winner) => {
    const allCompletions = Array.from(
      new Set([...(local.completionHistory || []), ...(remote.completionHistory || [])])
    ).sort((a, b) => a - b);

    return {
      ...winner,
      completionHistory: allCompletions,
    };
  });
}

export function resolveTaskConflict(local: Task, remote: Task): Task {
  return mergeTasks([local], [remote])[0];
}

export function mergeLists(localLists: TaskList[], remoteLists: TaskList[]): TaskList[] {
  return mergeEntities(localLists, remoteLists);
}

export function resolveListConflict(local: TaskList, remote: TaskList): TaskList {
  return mergeLists([local], [remote])[0];
}

export function mergeFolders(localFolders: Folder[], remoteFolders: Folder[]): Folder[] {
  return mergeEntities(localFolders, remoteFolders);
}

export function resolveFolderConflict(local: Folder, remote: Folder): Folder {
  return mergeFolders([local], [remote])[0];
}
