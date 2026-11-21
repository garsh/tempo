import type { Task } from '../types/task';
import { TaskCard } from './TaskCard';
import { ReorderableTaskList } from './ReorderableTaskList';
import { TaskGroupHeader } from './shell/TaskGroupHeader';

interface TasksViewProps {
  periodicTasks: Task[];
  oneTimeTasks: Task[];
  showDetails: boolean;
  collapsedGroups: Record<string, boolean>;
  onToggleGroup: (id: string) => void;
  onReorderOneTime: (orderedIds: string[]) => void;
  onDragActiveChange?: (active: boolean) => void;
  onSelect: (task: Task) => void;
  onComplete: (id: string, dateStr?: string) => void;
  onUncomplete?: (id: string, dateStr?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onRequestChangeDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestLogDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestDelete?: (task: Task) => void;
}

/**
 * Off-calendar Tasks view displaying:
 * 1. Recurring: approximate window routines currently inside/past their window (or "Not done yet").
 * 2. One-Time: undated one-time tasks in user-defined drag-to-reorder order.
 */
export function TasksView({
  periodicTasks,
  oneTimeTasks,
  showDetails,
  collapsedGroups,
  onToggleGroup,
  onReorderOneTime,
  onDragActiveChange,
  onSelect,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
  onRequestChangeDate,
  onRequestLogDate,
  onRequestDelete,
}: TasksViewProps) {
  const isEmpty = periodicTasks.length === 0 && oneTimeTasks.length === 0;

  return (
    <div
      className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 px-3 sm:px-5 pt-2 pb-20 xl:pb-4 space-y-2"
      data-testid="tasks-view"
    >
      {isEmpty ? (
        <p className="text-sm text-tt-muted px-4 py-12 text-center">No undated or periodic tasks due</p>
      ) : (
        <>
          {periodicTasks.length > 0 && (
            <section aria-label="Recurring">
              <TaskGroupHeader
                label="Recurring"
                count={periodicTasks.length}
                collapsed={!!collapsedGroups['tasks-periodic']}
                onToggle={() => onToggleGroup('tasks-periodic')}
                sticky={false}
              />
              {!collapsedGroups['tasks-periodic'] &&
                periodicTasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    showDetails={showDetails}
                    onSelect={onSelect}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRequestLogDate={onRequestLogDate}
                    onRequestDelete={onRequestDelete}
                  />
                ))}
            </section>
          )}

          {oneTimeTasks.length > 0 && (
            <section aria-label="One-Time">
              <TaskGroupHeader
                label="One-Time"
                count={oneTimeTasks.length}
                collapsed={!!collapsedGroups['tasks-onetime']}
                onToggle={() => onToggleGroup('tasks-onetime')}
                sticky={false}
              />
              {!collapsedGroups['tasks-onetime'] && (
                <ReorderableTaskList
                  tasks={oneTimeTasks}
                  enabled={true}
                  onDragActiveChange={onDragActiveChange}
                  onReorder={onReorderOneTime}
                  renderRow={(t, dragProps) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      showDetails={showDetails}
                      onSelect={onSelect}
                      onComplete={onComplete}
                      onUncomplete={onUncomplete}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRequestChangeDate={onRequestChangeDate}
                      onRequestDelete={onRequestDelete}
                      {...dragProps}
                    />
                  )}
                />
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}
