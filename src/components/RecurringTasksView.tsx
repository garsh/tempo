import { useMemo } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Task } from '../types/task';
import {
  formatRecurrenceLabel,
  formatRecurringDueSubtitle,
  getNextUncompletedOccurrenceDate,
  getWindowProgress,
  isFixedRecurring,
  isRecurrenceFinished,
  isWindowPeriodic,
  isWindowStopped,
  projectTaskForDate,
} from '../domain/recurrence';
import { sortRecurringByDueProximity, type RecurringSortEntry } from '../domain/sorting';
import { TaskCard } from './TaskCard';

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
 * Lists all active recurring tasks (Approximate min–max windows, Annual Time of Year windows,
 * and Fixed Interval schedules) in a unified flat list ordered by closeness to being due.
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
  const entries = useMemo(() => {
    const now = new Date();
    const items: RecurringSortEntry[] = [];

    for (const t of tasks) {
      if (t.deletedAt || !t.recurrence) continue;
      if (isWindowPeriodic(t)) {
        if (isWindowStopped(t, now)) continue;
        const progress = getWindowProgress(t, now);
        if (!progress || progress.stage === 'stopped') continue;
        items.push({
          kind: 'window',
          raw: t,
          progress,
          subtitle: formatRecurringDueSubtitle(t, progress, now),
        });
        continue;
      }
      if (isFixedRecurring(t) && !isRecurrenceFinished(t, now)) {
        const nextDate = getNextUncompletedOccurrenceDate(t, now);
        const projected = nextDate ? projectTaskForDate(t, nextDate) : { ...t, completedAt: null };
        items.push({
          kind: 'fixed',
          raw: t,
          projected,
          nextDate,
          subtitle: formatRecurrenceLabel(t.recurrence),
        });
      }
    }

    return sortRecurringByDueProximity(items, now);
  }, [tasks]);

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
            className="flex-1 overflow-y-auto overscroll-y-contain min-h-0 px-3 sm:px-5 pt-2 pb-20 xl:pb-4"
            data-testid="recurring-tasks-view"
          >
            {entries.length === 0 ? (
              <p className="text-sm text-tt-muted px-4 py-12 text-center">No active recurring tasks</p>
            ) : (
              entries.map((entry) =>
                entry.kind === 'window' ? (
                  <TaskCard
                    key={entry.raw.id}
                    task={entry.raw}
                    showDetails={showDetails}
                    subtitle={entry.subtitle}
                    onSelect={() => onEdit(entry.raw)}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onRequestLogDate={onRequestLogDate}
                    onRequestDelete={onRequestDelete}
                  />
                ) : (
                  <TaskCard
                    key={entry.raw.id}
                    task={entry.projected}
                    showDetails={showDetails}
                    subtitle={entry.subtitle}
                    occurrenceDateStr={entry.nextDate ?? undefined}
                    onSelect={() => onEdit(entry.projected)}
                    onComplete={onComplete}
                    onUncomplete={onUncomplete}
                    onEdit={() => onEdit(entry.projected)}
                    onDelete={onDelete}
                    onRequestChangeDate={onRequestChangeDate}
                    onRequestSkipOccurrence={onRequestSkipOccurrence}
                    onRequestDelete={() => onRequestDelete?.(entry.raw)}
                  />
                )
              )
            )}
          </div>
        </main>
      </div>
    </>
  );
}
