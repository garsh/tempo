import type { Task, TaskList } from '../types/task';
import { getTaskUrgency, isCompleted } from '../domain/recurrence';
import { INBOX_LIST_ID } from '../types/task';

export type BoardMode = 'status' | 'list';

type Column = {
  id: string;
  title: string;
  tasks: Task[];
};

interface KanbanBoardProps {
  tasks: Task[];
  lists: TaskList[];
  mode: BoardMode;
  selectedTaskId?: string | null;
  onSelectTask: (task: Task) => void;
  onMoveToList?: (taskId: string, listId: string) => void;
}

function statusColumns(tasks: Task[]): Column[] {
  const open = tasks.filter((t) => !t.deletedAt && !isCompleted(t));
  const buckets: Record<string, Task[]> = {
    overdue: [],
    due_today: [],
    upcoming: [],
    later: [],
    none: [],
  };
  for (const t of open) {
    const u = getTaskUrgency(t.dueAt);
    buckets[u]?.push(t);
  }
  return [
    { id: 'overdue', title: 'Overdue', tasks: buckets.overdue },
    { id: 'due_today', title: 'Today', tasks: buckets.due_today },
    { id: 'upcoming', title: 'Upcoming', tasks: buckets.upcoming },
    { id: 'later', title: 'Later', tasks: buckets.later },
    { id: 'none', title: 'No due', tasks: buckets.none },
  ];
}

function listColumns(tasks: Task[], lists: TaskList[]): Column[] {
  const open = tasks.filter((t) => !t.deletedAt && !isCompleted(t));
  const active = lists.filter((l) => !l.deletedAt);
  // Ensure inbox first
  const ordered = [
    ...active.filter((l) => l.id === INBOX_LIST_ID),
    ...active.filter((l) => l.id !== INBOX_LIST_ID),
  ];
  return ordered.map((list) => ({
    id: list.id,
    title: list.name,
    tasks: open.filter((t) => t.listId === list.id),
  })).concat(
    // orphaned list ids
    (() => {
      const known = new Set(ordered.map((l) => l.id));
      const orphans = open.filter((t) => !known.has(t.listId));
      if (orphans.length === 0) return [];
      return [{ id: '_other', title: 'Other', tasks: orphans }];
    })()
  );
}

export function KanbanBoard({
  tasks,
  lists,
  mode,
  selectedTaskId,
  onSelectTask,
  onMoveToList,
}: KanbanBoardProps) {
  const columns = mode === 'status' ? statusColumns(tasks) : listColumns(tasks, lists);

  return (
    <div className="flex gap-3 overflow-x-auto pb-2 min-h-[20rem]">
      {columns.map((col) => (
        <div
          key={col.id}
          className="w-64 shrink-0 flex flex-col rounded-2xl border border-slate-800 bg-slate-900/40"
        >
          <div className="px-3 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-200">{col.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400">
              {col.tasks.length}
            </span>
          </div>
          <div className="flex-1 p-2 space-y-2 overflow-y-auto max-h-[calc(100dvh-16rem)]">
            {col.tasks.length === 0 ? (
              <p className="text-[11px] text-slate-600 px-1 py-3 text-center">Empty</p>
            ) : (
              col.tasks.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-xl border p-2.5 cursor-pointer transition-colors ${
                    selectedTaskId === t.id
                      ? 'border-indigo-500 bg-indigo-950/40'
                      : 'border-slate-800 bg-slate-950/60 hover:border-slate-700'
                  }`}
                  onClick={() => onSelectTask(t)}
                  draggable={mode === 'list' && !!onMoveToList}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/task-id', t.id);
                  }}
                >
                  <div className="text-sm font-semibold text-slate-100 line-clamp-2">{t.title}</div>
                  {t.priority && t.priority !== 'none' && (
                    <div className="text-[10px] text-slate-500 mt-1 capitalize">{t.priority}</div>
                  )}
                  {t.tags && t.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {t.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400"
                        >
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
          {mode === 'list' && onMoveToList && col.id !== '_other' && (
            <div
              className="m-2 mt-0 rounded-xl border border-dashed border-slate-800 px-2 py-2 text-[10px] text-slate-600 text-center"
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                const id = e.dataTransfer.getData('text/task-id');
                if (id) onMoveToList(id, col.id);
              }}
            >
              Drop to move here
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
