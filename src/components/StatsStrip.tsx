import type { TempoStats } from '../domain/stats';

interface StatsStripProps {
  stats: TempoStats;
}

export function StatsStrip({ stats }: StatsStripProps) {
  const cells = [
    { label: 'Open', value: stats.openCount },
    { label: 'Overdue', value: stats.overdueCount, warn: stats.overdueCount > 0 },
    { label: 'Today', value: stats.dueTodayCount },
    { label: 'Done/wk', value: stats.completedThisWeek },
    { label: 'Streak', value: stats.completionStreakDays },
  ];

  return (
    <div className="px-2 py-2 border-t border-slate-800/80">
      <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold px-1 mb-1.5">
        This week
      </p>
      <div className="grid grid-cols-5 gap-1">
        {cells.map((c) => (
          <div
            key={c.label}
            className="rounded-lg bg-slate-900/70 border border-slate-800 px-1 py-1.5 text-center"
            title={c.label}
          >
            <div
              className={`text-sm font-bold tabular-nums ${
                c.warn ? 'text-rose-400' : 'text-slate-100'
              }`}
            >
              {c.value}
            </div>
            <div className="text-[9px] text-slate-500 truncate">{c.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
