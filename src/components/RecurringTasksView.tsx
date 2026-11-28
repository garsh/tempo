import { useCallback, useMemo, useRef, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { Task } from '../types/task';
import {
  formatRecurrenceLabel,
  formatRecurringDueSubtitle,
  getNextUncompletedOccurrenceDate,
  getWindowProgress,
  isAnnualWindow,
  isFixedRecurring,
  isRecurrenceFinished,
  isWindowPeriodic,
  isWindowStopped,
  parseDate,
  projectTaskForDate,
} from '../domain/recurrence';
import { sortRecurringByDueProximity, type RecurringSortEntry } from '../domain/sorting';
import { useTodayKey } from '../hooks/useTodayKey';
import { TaskCard } from './TaskCard';

type RecurringFilter = 'all' | 'fixed' | 'approx' | 'annual';

const FILTER_OPTIONS: ReadonlyArray<{ id: RecurringFilter; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'fixed', label: 'Fixed' },
  { id: 'approx', label: 'Approx' },
  { id: 'annual', label: 'Yearly' },
];

interface RecurringTasksViewProps {
  tasks: Task[];
  showDetails: boolean;
  embedded?: boolean;
  selectedTaskId?: string | null;
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
 * Full-screen management view opened from Overflow (⋮) → Recurring (or embedded in desktop workspace).
 * Lists all active recurring tasks (Approximate min–max windows, Annual Time of Year windows,
 * and Fixed Interval schedules) in a unified flat list ordered by closeness to being due.
 */
export function RecurringTasksView({
  tasks,
  showDetails,
  embedded = false,
  selectedTaskId = null,
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
  const [filter, setFilter] = useState<RecurringFilter>('all');
  const todayKey = useTodayKey();

  const entries = useMemo(() => {
    const now = parseDate(todayKey);
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
  }, [tasks, todayKey]);

  const rawByIdRef = useRef<Map<string, Task>>(new Map());
  rawByIdRef.current = new Map(entries.map((entry) => [entry.raw.id, entry.raw]));

  const handleDeleteRaw = useCallback(
    (task: Task) => {
      onRequestDelete?.(rawByIdRef.current.get(task.id) ?? task);
    },
    [onRequestDelete]
  );

  const filteredEntries = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((entry) => {
      if (filter === 'fixed') return entry.kind === 'fixed';
      if (filter === 'annual') return entry.kind === 'window' && isAnnualWindow(entry.raw);
      return entry.kind === 'window' && !isAnnualWindow(entry.raw);
    });
  }, [entries, filter]);

  return (
    <>
      <header className="shrink-0 flex items-center justify-between gap-2 h-14 sm:h-16 compact-landscape:h-12 desktop:h-14 px-2.5 sm:px-5 bg-tt-bg desktop:bg-tt-surface border-b border-tt-border text-tt-text z-20">
        <div className="flex items-center gap-2 shrink-0">
          {!embedded && (
            <button
              type="button"
              onClick={onClose}
              aria-label="Back"
              title="Back"
              className="shrink-0 w-9 h-9 sm:w-10 sm:h-10 compact-landscape:w-8 compact-landscape:h-8 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-sidebar transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-5 h-5" strokeWidth={2} />
            </button>
          )}
          <h1 className="text-[20px] sm:text-[22px] desktop:text-[18px] font-bold tracking-tight text-tt-text truncate">
            Recurring
          </h1>
          {entries.length > 0 && (
            <span className="text-xs font-medium text-tt-muted tabular-nums">
              {filteredEntries.length}
            </span>
          )}
        </div>

        {entries.length > 0 && (
          <div
            role="group"
            aria-label="Filter recurring tasks"
            className="flex items-center gap-1 overflow-x-auto min-w-0"
          >
            {FILTER_OPTIONS.map((opt) => {
              const active = filter === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setFilter(opt.id)}
                  className={`shrink-0 whitespace-nowrap px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    active
                      ? 'bg-tt-blue-soft text-tt-blue dark:text-blue-300'
                      : 'text-tt-secondary hover:text-tt-text hover:bg-tt-hover'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        )}
      </header>

      <div className="flex-1 flex min-h-0 relative">
        <main className="flex-1 min-w-0 flex flex-col min-h-0 bg-tt-bg desktop:bg-tt-surface">
          <div
            data-task-scroll-container="true"
            className="flex-1 overflow-y-auto overscroll-y-contain tt-scroll-stable min-h-0 px-3 sm:px-5 pt-2 pb-20 desktop:pb-6"
          >
            <div className="max-w-3xl mx-auto w-full" data-testid="recurring-tasks-view">
              {entries.length === 0 ? (
                <p className="text-sm text-tt-muted px-4 py-12 text-center">No active recurring tasks</p>
              ) : filteredEntries.length === 0 ? (
                <p className="text-sm text-tt-muted px-4 py-12 text-center">
                  No matching recurring tasks
                </p>
              ) : (
                filteredEntries.map((entry) =>
                  entry.kind === 'window' ? (
                    <TaskCard
                      key={entry.raw.id}
                      task={entry.raw}
                      selected={selectedTaskId === entry.raw.id}
                      showDetails={showDetails}
                      subtitle={entry.subtitle}
                      onSelect={onEdit}
                      onComplete={onComplete}
                      onUncomplete={onUncomplete}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRequestLogDate={onRequestLogDate}
                      onRequestDelete={onRequestDelete ? handleDeleteRaw : undefined}
                    />
                  ) : (
                    <TaskCard
                      key={entry.raw.id}
                      task={entry.projected}
                      selected={selectedTaskId === entry.raw.id}
                      showDetails={showDetails}
                      subtitle={entry.subtitle}
                      occurrenceDateStr={entry.nextDate ?? undefined}
                      onSelect={onEdit}
                      onComplete={onComplete}
                      onUncomplete={onUncomplete}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      onRequestChangeDate={onRequestChangeDate}
                      onRequestSkipOccurrence={onRequestSkipOccurrence}
                      onRequestDelete={onRequestDelete ? handleDeleteRaw : undefined}
                    />
                  )
                )
              )}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
