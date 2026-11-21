import type { Dispatch, RefObject, SetStateAction } from 'react';
import { Trash2 } from 'lucide-react';
import type { IntervalUnit, RecurrenceType, Weekday } from '../../types/task';
import { WEEKDAY_LABELS } from '../../types/task';
import {
  completionTimestampForDate,
  formatDate,
  parseDate,
  startOfDay,
} from '../../domain/recurrence';

export type EndMode = 'never' | 'on_date' | 'after_count';

const ALL_WEEKDAYS: Weekday[] = [0, 1, 2, 3, 4, 5, 6];

export interface RepeatPanelProps {
  recurrenceType: RecurrenceType;
  intervalValue: number;
  setIntervalValue: (value: number) => void;
  maxIntervalValue: number;
  setMaxIntervalValue: (value: number) => void;
  minInput: string;
  setMinInput: (value: string) => void;
  maxInput: string;
  setMaxInput: (value: string) => void;
  intervalUnit: IntervalUnit;
  setIntervalUnit: (unit: IntervalUnit) => void;
  weekdays: Weekday[];
  toggleWeekday: (day: Weekday) => void;
  useMonthDay: boolean;
  setUseMonthDay: (checked: boolean) => void;
  monthDay: number;
  setMonthDay: (day: number) => void;
  setWeekdays: (days: Weekday[]) => void;
  endMode: EndMode;
  setEndMode: (mode: EndMode) => void;
  endOnDate: string;
  setEndOnDate: (date: string) => void;
  endAfterCount: string;
  setEndAfterCount: (count: string) => void;
  initialTaskId?: string;
  todayStr: string;
  localHistory: number[];
  setLocalHistory: Dispatch<SetStateAction<number[]>>;
  historySectionRef: RefObject<HTMLDivElement | null>;
  onLogCompletionDate?: (taskId: string, dateStr: string) => Promise<void> | void;
  onRemoveCompletionTimestamp?: (taskId: string, timestamp: number) => Promise<void> | void;
}

/**
 * Recurrence editor panel rendered inside QuickAddSheet for both fixed-interval
 * calendar repeats and approximate min–max periodic routines (with completion history).
 */
export function RepeatPanel({
  recurrenceType,
  intervalValue,
  setIntervalValue,
  maxIntervalValue,
  setMaxIntervalValue,
  minInput,
  setMinInput,
  maxInput,
  setMaxInput,
  intervalUnit,
  setIntervalUnit,
  weekdays,
  toggleWeekday,
  useMonthDay,
  setUseMonthDay,
  monthDay,
  setMonthDay,
  setWeekdays,
  endMode,
  setEndMode,
  endOnDate,
  setEndOnDate,
  endAfterCount,
  setEndAfterCount,
  initialTaskId,
  todayStr,
  localHistory,
  setLocalHistory,
  historySectionRef,
  onLogCompletionDate,
  onRemoveCompletionTimestamp,
}: RepeatPanelProps) {
  const sortedDesc = [...localHistory].sort((a, b) => b - a);
  const count = sortedDesc.length;
  let avgText = '';
  if (count >= 2) {
    const firstDay = startOfDay(new Date(sortedDesc[count - 1]));
    const lastDay = startOfDay(new Date(sortedDesc[0]));
    const span = Math.max(0, Math.round((lastDay.getTime() - firstDay.getTime()) / 86400000));
    const avg = Math.round(span / (count - 1));
    avgText = ` · Avg every ${avg}d`;
  }

  return (
    <div className="px-4 pb-4 space-y-3.5 border-t border-tt-border/80 pt-3 animate-in fade-in duration-150">
      <div className="space-y-3.5 p-3.5 sm:p-4 rounded-2xl bg-tt-sidebar/60 border border-tt-border">
        {recurrenceType === 'fixed_interval' ? (
          <>
            {/* Repeat Every & Unit at the top */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="repeat-interval-input"
                  className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                >
                  Repeat Every
                </label>
                <input
                  id="repeat-interval-input"
                  type="number"
                  min="1"
                  max="999"
                  value={minInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMinInput(v);
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n) && n >= 1) {
                      setIntervalValue(Math.min(999, n));
                    }
                  }}
                  onBlur={() => setMinInput(String(intervalValue))}
                  className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="repeat-unit-select"
                  className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
                >
                  Unit
                </label>
                <select
                  id="repeat-unit-select"
                  value={intervalUnit}
                  onChange={(e) => {
                    const u = e.target.value as IntervalUnit;
                    setIntervalUnit(u);
                    if (u !== 'weeks') setWeekdays([]);
                    if (u !== 'months') setUseMonthDay(false);
                  }}
                  className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>

            {/* Weekdays selection (for Weeks, or quick M/W/F pick when every 1 day) */}
            {(intervalUnit === 'weeks' || (intervalUnit === 'days' && intervalValue === 1)) && (
              <div>
                <label className="block text-base sm:text-[17px] font-bold text-tt-text mb-1.5">
                  On Weekdays (Optional)
                </label>
                <div className="grid grid-cols-7 gap-1.5">
                  {ALL_WEEKDAYS.map((d) => {
                    const sel = weekdays.includes(d);
                    return (
                      <button
                        key={d}
                        type="button"
                        aria-pressed={sel}
                        onClick={() => toggleWeekday(d)}
                        className={`h-10 sm:h-11 rounded-xl text-sm sm:text-base font-bold border transition-all flex items-center justify-center cursor-pointer ${
                          sel
                            ? 'bg-tt-blue text-white border-tt-blue shadow-sm shadow-tt-blue/25 ring-1 ring-tt-blue'
                            : 'bg-tt-elevated text-tt-text border-tt-border hover:bg-tt-hover active:scale-95'
                        }`}
                      >
                        {WEEKDAY_LABELS[d]}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Month Day selection */}
            {intervalUnit === 'months' && (
              <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl bg-tt-elevated border border-tt-border">
                <label className="inline-flex items-center gap-2.5 text-base sm:text-[17px] font-semibold text-tt-text cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useMonthDay}
                    onChange={(e) => setUseMonthDay(e.target.checked)}
                    className="w-5 h-5 rounded border-tt-border accent-tt-blue cursor-pointer"
                  />
                  On Day of Month
                </label>
                {useMonthDay && (
                  <div className="inline-flex items-center gap-2">
                    <input
                      type="number"
                      min="1"
                      max="31"
                      value={monthDay}
                      aria-label="Day of month"
                      onChange={(e) =>
                        setMonthDay(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))
                      }
                      className="w-20 h-10 px-3 bg-tt-sidebar border border-tt-border rounded-xl text-tt-text text-base sm:text-lg font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                    />
                    <span className="text-sm sm:text-base text-tt-text/90 font-medium">
                      of each month
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* End Recurrence Selection */}
            <div className="pt-2 border-t border-tt-border/80">
              <label
                htmlFor="end-mode-select"
                className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
              >
                Ends
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                <select
                  id="end-mode-select"
                  value={endMode}
                  onChange={(e) => {
                    const mode = e.target.value as EndMode;
                    setEndMode(mode);
                    if (mode === 'never') {
                      setEndOnDate('');
                      setEndAfterCount('');
                    }
                  }}
                  className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                >
                  <option value="never">Never (repeats indefinitely)</option>
                  <option value="on_date">On specific date</option>
                  <option value="after_count">After number of occurrences</option>
                </select>

                {endMode === 'on_date' && (
                  <input
                    id="end-on-date-input"
                    type="date"
                    aria-label="End date"
                    value={endOnDate}
                    onChange={(e) => setEndOnDate(e.target.value)}
                    className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                  />
                )}

                {endMode === 'after_count' && (
                  <div className="flex items-center gap-2">
                    <input
                      id="end-after-count-input"
                      type="number"
                      min="1"
                      aria-label="Number of occurrences"
                      placeholder="e.g. 10"
                      value={endAfterCount}
                      onChange={(e) => setEndAfterCount(e.target.value)}
                      className="w-28 h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                    />
                    <span className="text-sm sm:text-base font-semibold text-tt-text/80">
                      occurrences
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        ) : (
          <>
            {/* Approximately: Min, Max, Unit */}
            <div className="grid grid-cols-3 gap-2.5">
              <div>
                <label
                  htmlFor="repeat-min-input"
                  className="block text-sm sm:text-base font-bold text-tt-text mb-1"
                >
                  Min
                </label>
                <input
                  id="repeat-min-input"
                  type="number"
                  min="1"
                  max="999"
                  value={minInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMinInput(v);
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n) && n >= 1) {
                      setIntervalValue(Math.min(999, n));
                    }
                  }}
                  onBlur={() => {
                    setMinInput(String(intervalValue));
                    if (maxIntervalValue < intervalValue) {
                      setMaxIntervalValue(intervalValue);
                      setMaxInput(String(intervalValue));
                    }
                  }}
                  className="w-full h-11 sm:h-12 px-3 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="repeat-max-input"
                  className="block text-sm sm:text-base font-bold text-tt-text mb-1"
                >
                  Max
                </label>
                <input
                  id="repeat-max-input"
                  type="number"
                  min={intervalValue}
                  max="999"
                  value={maxInput}
                  onChange={(e) => {
                    const v = e.target.value;
                    setMaxInput(v);
                    const n = parseInt(v, 10);
                    if (!Number.isNaN(n) && n >= 1) {
                      setMaxIntervalValue(Math.min(999, Math.max(intervalValue, n)));
                    }
                  }}
                  onBlur={() => {
                    const clamped = Math.max(intervalValue, maxIntervalValue);
                    setMaxIntervalValue(clamped);
                    setMaxInput(String(clamped));
                  }}
                  className="w-full h-11 sm:h-12 px-3 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-lg sm:text-xl font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors"
                />
              </div>
              <div>
                <label
                  htmlFor="repeat-unit-select"
                  className="block text-sm sm:text-base font-bold text-tt-text mb-1"
                >
                  Unit
                </label>
                <select
                  id="repeat-unit-select"
                  value={intervalUnit}
                  onChange={(e) => setIntervalUnit(e.target.value as IntervalUnit)}
                  className="w-full h-11 sm:h-12 px-2.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-lg font-bold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                >
                  <option value="days">Days</option>
                  <option value="weeks">Weeks</option>
                  <option value="months">Months</option>
                  <option value="years">Years</option>
                </select>
              </div>
            </div>

            {/* Ends (Never or On specific date) */}
            <div className="pt-2 border-t border-tt-border/80">
              <label
                htmlFor="end-mode-select"
                className="block text-base sm:text-[17px] font-bold text-tt-text mb-1"
              >
                Ends
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 items-center">
                <select
                  id="end-mode-select"
                  value={endMode === 'on_date' ? 'on_date' : 'never'}
                  onChange={(e) => {
                    const mode = e.target.value as 'never' | 'on_date';
                    setEndMode(mode);
                    if (mode === 'never') {
                      setEndOnDate('');
                    }
                  }}
                  className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue transition-colors cursor-pointer"
                >
                  <option value="never">Never (repeats indefinitely)</option>
                  <option value="on_date">On specific date</option>
                </select>

                {endMode === 'on_date' && (
                  <input
                    id="end-on-date-input"
                    type="date"
                    aria-label="End date"
                    value={endOnDate}
                    onChange={(e) => setEndOnDate(e.target.value)}
                    className="w-full h-11 sm:h-12 px-3.5 bg-tt-elevated border border-tt-border rounded-xl text-tt-text text-base sm:text-[17px] font-semibold outline-none focus:border-tt-blue focus:ring-1 focus:ring-tt-blue"
                  />
                )}
              </div>
            </div>

            {/* Completion History Panel (when editing) */}
            {initialTaskId && (
              <div
                ref={historySectionRef}
                data-testid="completion-history-panel"
                className="pt-2.5 border-t border-tt-border/80 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs sm:text-sm font-semibold text-tt-secondary">
                    {`Done ${count} ${count === 1 ? 'time' : 'times'}${avgText}`}
                  </div>
                  {onLogCompletionDate && (
                    <label className="relative inline-flex items-center gap-1 text-xs sm:text-sm font-semibold text-tt-blue hover:text-tt-blue-hover cursor-pointer px-2 py-1 rounded-lg hover:bg-tt-blue-soft/60">
                      <span>+ Log date</span>
                      <input
                        type="date"
                        aria-label="Log past completion date"
                        max={todayStr}
                        value=""
                        onChange={(e) => {
                          const val = e.target.value;
                          if (!val) return;
                          const ts = completionTimestampForDate(val);
                          setLocalHistory((prev) =>
                            prev.some((p) => formatDate(new Date(p)) === val)
                              ? prev
                              : [...prev, ts].sort((a, b) => a - b)
                          );
                          void onLogCompletionDate(initialTaskId, val);
                        }}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                    </label>
                  )}
                </div>

                {sortedDesc.length > 0 && (
                  <ul className="max-h-36 overflow-y-auto space-y-1 pr-1">
                    {sortedDesc.map((ts) => {
                      const dStr = formatDate(new Date(ts));
                      const label =
                        dStr === todayStr
                          ? 'Today'
                          : parseDate(dStr).toLocaleDateString(undefined, {
                              month: 'short',
                              day: 'numeric',
                              year: 'numeric',
                            });
                      return (
                        <li
                          key={ts}
                          className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-tt-elevated border border-tt-border/70 text-sm text-tt-text"
                        >
                          <span>{label}</span>
                          {onRemoveCompletionTimestamp && (
                            <button
                              type="button"
                              aria-label={`Remove completion on ${dStr}`}
                              onClick={() => {
                                setLocalHistory((prev) => prev.filter((p) => p !== ts));
                                void onRemoveCompletionTimestamp(initialTaskId, ts);
                              }}
                              className="p-1 text-tt-muted hover:text-red-500 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
