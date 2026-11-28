import type { Task } from '../types/task';
import { TaskCard } from './TaskCard';
import { ReorderableTaskList } from './ReorderableTaskList';
import { TaskGroupHeader } from './shell/TaskGroupHeader';

interface TasksViewProps {
  periodicTasks: Task[];
  oneTimeTasks: Task[];
  showDetails: boolean;
  collapsedGroups: Record<string, boolean>;
  layoutMode?: 'stacked' | 'two-column';
  selectedTaskId?: string | null;
  surfaceClassName?: string;
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
  layoutMode = 'stacked',
  selectedTaskId = null,
  surfaceClassName,
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
  const useTwoColumns =
    layoutMode === 'two-column' && periodicTasks.length > 0 && oneTimeTasks.length > 0;

  const renderPeriodicList = () =>
    periodicTasks.map((t) => (
      <TaskCard
        key={t.id}
        task={t}
        selected={selectedTaskId === t.id}
        showDetails={showDetails}
        onSelect={onSelect}
        onComplete={onComplete}
        onUncomplete={onUncomplete}
        onEdit={onEdit}
        onDelete={onDelete}
        onRequestLogDate={onRequestLogDate}
        onRequestDelete={onRequestDelete}
      />
    ));

  const renderOneTimeList = () => (
    <ReorderableTaskList
      tasks={oneTimeTasks}
      enabled={true}
      onDragActiveChange={onDragActiveChange}
      onReorder={onReorderOneTime}
      renderRow={(t, dragProps) => (
        <TaskCard
          key={t.id}
          task={t}
          selected={selectedTaskId === t.id}
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
  );

  if (useTwoColumns) {
    return (
      <div
        className="flex-1 min-h-0 overflow-hidden grid grid-cols-2 divide-x divide-tt-border max-w-6xl mx-auto w-full"
        data-testid="tasks-view"
        data-layout="two-column"
      >
        <section aria-label="Recurring" className="min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 sm:px-4 pt-2">
            <TaskGroupHeader
              label="Recurring"
              count={periodicTasks.length}
              collapsed={!!collapsedGroups['tasks-periodic']}
              onToggle={() => onToggleGroup('tasks-periodic')}
              sticky={false}
              bgClassName={surfaceClassName}
            />
          </div>
          <div
            data-task-scroll-container="true"
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain tt-scroll-stable px-3 sm:px-4 pb-20 desktop:pb-6"
          >
            {!collapsedGroups['tasks-periodic'] && renderPeriodicList()}
          </div>
        </section>

        <section aria-label="One-Time" className="min-h-0 flex flex-col overflow-hidden">
          <div className="shrink-0 px-3 sm:px-4 pt-2">
            <TaskGroupHeader
              label="One-Time"
              count={oneTimeTasks.length}
              collapsed={!!collapsedGroups['tasks-onetime']}
              onToggle={() => onToggleGroup('tasks-onetime')}
              sticky={false}
              bgClassName={surfaceClassName}
            />
          </div>
          <div
            data-task-scroll-container="true"
            className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain tt-scroll-stable px-3 sm:px-4 pb-20 desktop:pb-6"
          >
            {!collapsedGroups['tasks-onetime'] && renderOneTimeList()}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div
      data-task-scroll-container="true"
      className="flex-1 overflow-y-auto overscroll-y-contain tt-scroll-stable min-h-0 px-3 sm:px-4 pt-2 pb-20 desktop:pb-6 space-y-2"
      data-testid="tasks-view"
      data-layout="stacked"
    >
      {isEmpty ? (
        <p className="text-sm text-tt-muted px-4 py-12 text-center">No undated or periodic tasks due</p>
      ) : (
        <div className={layoutMode === 'two-column' ? 'max-w-3xl mx-auto w-full space-y-2' : 'space-y-2'}>
          {periodicTasks.length > 0 && (
            <section aria-label="Recurring">
              <TaskGroupHeader
                label="Recurring"
                count={periodicTasks.length}
                collapsed={!!collapsedGroups['tasks-periodic']}
                onToggle={() => onToggleGroup('tasks-periodic')}
                sticky={false}
                bgClassName={surfaceClassName}
              />
              {!collapsedGroups['tasks-periodic'] && renderPeriodicList()}
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
                bgClassName={surfaceClassName}
              />
              {!collapsedGroups['tasks-onetime'] && renderOneTimeList()}
            </section>
          )}
        </div>
      )}
    </div>
  );
}
