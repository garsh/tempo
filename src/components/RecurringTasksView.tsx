import { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Task } from '../types/task';
import {
  formatRecurrenceLabel,
  getNextUncompletedOccurrenceDate,
  isFixedRecurring,
  isRecurrenceFinished,
  isWindowPeriodic,
  isWindowStopped,
  projectTaskForDate,
} from '../domain/recurrence';
import { sortWindowTasks } from '../domain/sorting';
import { TaskCard } from './TaskCard';
import { TaskGroupHeader } from './shell/TaskGroupHeader';

interface RecurringTasksViewProps {
  tasks: Task[];
  showDetails: boolean;
  onClose: () => void;
  onComplete: (id: string, dateStr?: string) => void;
  onUncomplete?: (id: string, dateStr?: string) => void;
  onEdit: (task: Task) => void;
  onDelete: (id: string) => void;
  onRequestChangeDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestLogDate?: (task: Task, anchorRect?: DOMRect) => void;
  onRequestSkipOccurrence?: (task: Task) => void;
  onRequestDelete?: (task: Task) => void;
}

/**
 * Full-screen management view opened from Overflow (⋮) → Recurring.
 * Lists all active recurring tasks (both Approximate min–max windows and Fixed Interval schedules)
 * so the user can inspect and adjust any existing series, including not-yet-due ones.
 */
export function RecurringTasksView({
  tasks,
  showDetails,
  onClose,
  onComplete,
  onUncomplete,
  onEdit,
  onDelete,
  onRequestChangeDate,
  onRequestLogDate,
  onRequestSkipOccurrence,
  onRequestDelete,
}: RecurringTasksViewProps) {
  const [approxCollapsed, setApproxCollapsed] = useState(false);
  const [fixedCollapsed, setFixedCollapsed] = useState(false);

  const { approxTasks, fixedEntries } = useMemo(() => {
    const now = new Date();
    const approx: Task[] = [];
    const fixed: { raw: Task; projected: Task; nextDate: string | null; label: string }[] = [];

    for (const t of tasks) {
      if (t.deletedAt || !t.recurrence) continue;
      if (isWindowPeriodic(t)) {
        if (!isWindowStopped(t, now)) {
          approx.push(t);
        }
        continue;
      }
      if (isFixedRecurring(t) && !isRecurrenceFinished(t, now)) {
        const nextDate = getNextUncompletedOccurrenceDate(t, now);
        const projected = nextDate ? projectTaskForDate(t, nextDate) : { ...t, completedAt: null };
        fixed.push({
          raw: t,
          projected,
          nextDate,
          label: formatRecurrenceLabel(t.recurrence),
        });
      }
    }

    fixed.sort((a, b) => {
      const da = a.nextDate ?? '9999-99-99';
      const db = b.nextDate ?? '9999-99-99';
      if (da !== db) return da.localeCompare(db);
      return a.raw.title.localeCompare(b.raw.title);
    });

    return {
      approxTasks: sortWindowTasks(approx, now),
      fixedEntries: fixed,
    };
  }, [tasks]);

  const isEmpty = approxTasks.length === 0 && fixedEntries.length === 0;

  return (
    <>
      <header className="shrink-0 flex items-center gap-2 h-14 sm:h-16 px-2.5 sm:px-5 bg-tt-bg xl:bg-tt-surface border-b border-tt-border text-tt-text z-20">
        <button
          type="button"
          onClick={onClose}
          aria-label="Back"
          title="Back"
          className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" strokeWidth={2} />
        </button>
        <h1 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-tt-text">
          Recurring
        </h1>
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg xl:bg-tt-surface">
          <div
            className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 px-3 sm:px-5 pt-2 pb-20 xl:pb-4 space-y-2"
            data-testid="recurring-tasks-view"
          >
            {isEmpty ? (
              <p className="text-sm text-tt-muted px-4 py-12 text-center">No active recurring tasks</p>
            ) : (
              <>
                {approxTasks.length > 0 && (
                  <section aria-label="Approximately">
                    <TaskGroupHeader
                      label="Approximately"
                      count={approxTasks.length}
                      collapsed={approxCollapsed}
                      onToggle={() => setApproxCollapsed((prev) => !prev)}
                      sticky={false}
                    />
                    {!approxCollapsed &&
                      approxTasks.map((t) => (
                        <TaskCard
                          key={t.id}
                          task={t}
                          showDetails={showDetails}
                          onSelect={() => onEdit(t)}
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

                {fixedEntries.length > 0 && (
                  <section aria-label="On Fixed Interval">
                    <TaskGroupHeader
                      label="On Fixed Interval"
                      count={fixedEntries.length}
                      collapsed={fixedCollapsed}
                      onToggle={() => setFixedCollapsed((prev) => !prev)}
                      sticky={false}
                    />
                    {!fixedCollapsed &&
                      fixedEntries.map(({ raw, projected, nextDate, label }) => (
                        <TaskCard
                          key={raw.id}
                          task={projected}
                          showDetails={false}
                          subtitle={label}
                          occurrenceDateStr={nextDate ?? undefined}
                          onSelect={() => onEdit(raw)}
                          onComplete={onComplete}
                          onUncomplete={onUncomplete}
                          onEdit={() => onEdit(raw)}
                          onDelete={onDelete}
                          onRequestChangeDate={onRequestChangeDate}
                          onRequestSkipOccurrence={onRequestSkipOccurrence}
                          onRequestDelete={() => onRequestDelete?.(raw)}
                        />
                      ))}
                  </section>
                )}
              </>
            )}
          </div>
        </main>
      </div>
    </>
  );
}
