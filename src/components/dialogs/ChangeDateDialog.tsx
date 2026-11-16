import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X, Clock } from 'lucide-react';
import type { Task } from '../../types/task';
import {
  buildMonthGrid,
  monthLabel,
  shiftMonth,
  weekdayLabels,
} from '../../domain/calendar';
import {
  formatDate,
  parseDate,
  splitDueAt,
  combineDueAt,
  addDays,
} from '../../domain/recurrence';
import { usePrefs } from '../../prefs/prefs';

interface ChangeDateDialogProps {
  isOpen: boolean;
  task: Task | null;
  onClose: () => void;
  onSave: (taskId: string, newDueAt: string | null) => Promise<void> | void;
}

export const ChangeDateDialog: React.FC<ChangeDateDialogProps> = ({
  isOpen,
  task,
  onClose,
  onSave,
}) => {
  const [prefs] = usePrefs();
  const today = new Date();
  const todayStr = formatDate(today);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [includeTime, setIncludeTime] = useState(false);
  const [viewYear, setViewYear] = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());

  useEffect(() => {
    if (!isOpen || !task) return;
    if (task.dueAt) {
      const parts = splitDueAt(task.dueAt);
      setSelectedDate(parts.date);
      setSelectedTime(parts.time);
      setIncludeTime(Boolean(parts.time));
      const parsed = parseDate(parts.date);
      if (!isNaN(parsed.getTime())) {
        setViewYear(parsed.getFullYear());
        setViewMonth(parsed.getMonth());
      }
    } else {
      setSelectedDate(todayStr);
      setSelectedTime(null);
      setIncludeTime(false);
      setViewYear(today.getFullYear());
      setViewMonth(today.getMonth());
    }
  }, [isOpen, task]);

  // Handle ESC key to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !task) return null;

  const monthGrid = buildMonthGrid(viewYear, viewMonth, today, prefs.weekStart);
  const headers = weekdayLabels(prefs.weekStart);

  const handlePrevMonth = () => {
    const shifted = shiftMonth(viewYear, viewMonth, -1);
    setViewYear(shifted.year);
    setViewMonth(shifted.monthIndex);
  };

  const handleNextMonth = () => {
    const shifted = shiftMonth(viewYear, viewMonth, 1);
    setViewYear(shifted.year);
    setViewMonth(shifted.monthIndex);
  };

  const handleGoToday = () => {
    setViewYear(today.getFullYear());
    setViewMonth(today.getMonth());
    setSelectedDate(todayStr);
  };

  const handleApplyPreset = (preset: 'today' | 'tomorrow' | 'nextWeek' | 'clear') => {
    if (preset === 'clear') {
      setSelectedDate(null);
      setSelectedTime(null);
      return;
    }
    let target: Date;
    if (preset === 'today') {
      target = today;
    } else if (preset === 'tomorrow') {
      target = addDays(today, 1);
    } else {
      target = addDays(today, 7);
    }
    const dStr = formatDate(target);
    setSelectedDate(dStr);
    setViewYear(target.getFullYear());
    setViewMonth(target.getMonth());
  };

  const handleConfirm = async () => {
    if (!selectedDate) {
      await onSave(task.id, null);
    } else {
      const timeToSave = includeTime && selectedTime ? selectedTime : null;
      const combined = combineDueAt(selectedDate, timeToSave);
      await onSave(task.id, combined);
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="change-date-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-tt-elevated border border-tt-border rounded-3xl shadow-2xl p-6 sm:p-8 overflow-hidden text-tt-text space-y-5">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-tt-border">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="p-3 rounded-2xl bg-amber-500/15 text-amber-500 shrink-0">
              <CalendarIcon className="w-6 h-6 sm:w-7 sm:h-7" />
            </div>
            <div className="min-w-0">
              <h2 id="change-date-title" className="text-xl sm:text-2xl font-bold text-tt-text truncate">
                Change Date
              </h2>
              <p className="text-base sm:text-lg text-tt-secondary font-medium truncate" title={task.title}>
                {task.title}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="p-2 rounded-xl text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Quick Presets */}
        <div className="grid grid-cols-4 gap-2 text-[15px] sm:text-[17px]">
          <button
            type="button"
            onClick={() => handleApplyPreset('today')}
            className={`py-2.5 px-2 rounded-2xl border text-center transition-colors font-bold ${
              selectedDate === todayStr
                ? 'bg-tt-blue-soft text-tt-blue border-tt-blue/40'
                : 'bg-tt-sidebar text-tt-text border-tt-border hover:bg-tt-hover'
            }`}
          >
            Today
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('tomorrow')}
            className={`py-2.5 px-2 rounded-2xl border text-center transition-colors font-bold ${
              selectedDate === formatDate(addDays(today, 1))
                ? 'bg-tt-blue-soft text-tt-blue border-tt-blue/40'
                : 'bg-tt-sidebar text-tt-text border-tt-border hover:bg-tt-hover'
            }`}
          >
            Tomorrow
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('nextWeek')}
            className={`py-2.5 px-2 rounded-2xl border text-center transition-colors font-bold ${
              selectedDate === formatDate(addDays(today, 7))
                ? 'bg-tt-blue-soft text-tt-blue border-tt-blue/40'
                : 'bg-tt-sidebar text-tt-text border-tt-border hover:bg-tt-hover'
            }`}
          >
            +1 Week
          </button>
          <button
            type="button"
            onClick={() => handleApplyPreset('clear')}
            className={`py-2.5 px-2 rounded-2xl border text-center transition-colors font-bold ${
              selectedDate === null
                ? 'bg-red-500/15 text-red-500 border-red-500/40'
                : 'bg-tt-sidebar text-tt-secondary border-tt-border hover:bg-tt-hover'
            }`}
          >
            No Date
          </button>
        </div>

        {/* Month Navigation */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2.5">
            <span className="text-[18px] sm:text-[20px] font-bold text-tt-text">
              {monthLabel(viewYear, viewMonth)}
            </span>
            <button
              type="button"
              onClick={handleGoToday}
              className="text-sm sm:text-base text-tt-blue font-bold hover:underline px-2 py-0.5 rounded"
            >
              Today
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              aria-label="Previous month"
              className="p-2 rounded-xl hover:bg-tt-hover text-tt-secondary hover:text-tt-text transition-colors"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <button
              type="button"
              onClick={handleNextMonth}
              aria-label="Next month"
              className="p-1.5 rounded-xl hover:bg-tt-hover text-tt-secondary hover:text-tt-text transition-colors"
            >
              <ChevronRight className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Calendar Grid */}
        <div>
          {/* Weekday headers */}
          <div className="grid grid-cols-7 mb-1.5 text-center">
            {headers.map((h, i) => (
              <span key={i} className="text-xs sm:text-sm font-bold text-tt-muted py-1 uppercase tracking-wider">
                {h}
              </span>
            ))}
          </div>

          {/* Month Day Cells */}
          <div className="grid grid-cols-7 gap-1.5">
            {monthGrid.map((cell) => {
              const isSelected = selectedDate === cell.dateStr;
              const isCurrentDay = cell.dateStr === todayStr;

              return (
                <button
                  key={cell.dateStr}
                  type="button"
                  onClick={() => setSelectedDate(cell.dateStr)}
                  className={`relative h-10 sm:h-11 flex items-center justify-center text-[16px] sm:text-[18px] rounded-2xl transition-all ${
                    isSelected
                      ? 'bg-tt-blue text-white font-bold shadow-md'
                      : !cell.inCurrentMonth
                        ? 'text-tt-muted/35 hover:bg-tt-hover hover:text-tt-muted'
                        : isCurrentDay
                          ? 'border-2 border-tt-blue text-tt-blue font-bold hover:bg-tt-hover'
                          : 'text-tt-text hover:bg-tt-hover font-semibold'
                  }`}
                >
                  {cell.date.getDate()}
                  {isCurrentDay && !isSelected && (
                    <span className="absolute bottom-1 w-1.5 h-1.5 rounded-full bg-tt-blue" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Time option */}
        <div className="pt-3 border-t border-tt-border flex items-center justify-between text-[16px] sm:text-[18px]">
          <label className="flex items-center gap-2.5 cursor-pointer select-none text-tt-secondary hover:text-tt-text font-semibold">
            <input
              type="checkbox"
              checked={includeTime}
              onChange={(e) => {
                setIncludeTime(e.target.checked);
                if (e.target.checked && !selectedTime) {
                  setSelectedTime('09:00');
                }
              }}
              className="rounded text-tt-blue focus:ring-0 focus:outline-none w-5 h-5"
            />
            <Clock className="w-5 h-5 text-tt-muted" />
            <span>Time</span>
          </label>

          {includeTime && (
            <input
              type="time"
              value={selectedTime || '09:00'}
              onChange={(e) => setSelectedTime(e.target.value)}
              className="px-3 py-1.5 text-[16px] sm:text-[18px] bg-tt-sidebar border border-tt-border rounded-xl text-tt-text font-semibold focus:outline-none focus:border-tt-blue"
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-tt-border">
          <button
            type="button"
            onClick={onClose}
            className="px-6 py-3 text-[17px] sm:text-[18px] font-semibold text-tt-secondary hover:text-tt-text hover:bg-tt-hover rounded-2xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className="px-7 py-3 text-[17px] sm:text-[18px] font-bold bg-tt-blue hover:bg-tt-blue-hover text-white rounded-2xl shadow-lg transition-colors active:scale-95"
          >
            Save Date
          </button>
        </div>
      </div>
    </div>
  );
};

export default ChangeDateDialog;
