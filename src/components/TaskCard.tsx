import { useState } from 'react';
import type { PeriodicTask } from '../types/task';
import { formatRecurrenceLabel, getDaysDifference, getTaskUrgency } from '../domain/recurrence';
import { Check, Clock, Calendar, RefreshCw, MoreVertical, Edit2, Trash2, RotateCcw } from 'lucide-react';

interface TaskCardProps {
  task: PeriodicTask;
  onComplete: (id: string) => void;
  onEdit: (task: PeriodicTask) => void;
  onDelete: (id: string) => void;
}

export const TaskCard: React.FC<TaskCardProps> = ({ task, onComplete, onEdit, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);
  const [justCompleted, setJustCompleted] = useState(false);

  const urgency = getTaskUrgency(task.dueDate);
  const diffDays = getDaysDifference(task.dueDate);

  const handleCheck = () => {
    setJustCompleted(true);
    setTimeout(() => {
      onComplete(task.id);
      setJustCompleted(false);
    }, 300);
  };

  const getUrgencyBadge = () => {
    switch (urgency) {
      case 'overdue':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <Clock className="w-3 h-3" />
            {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? 'day' : 'days'} overdue
          </span>
        );
      case 'due_today':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <Clock className="w-3 h-3" />
            Due today
          </span>
        );
      case 'upcoming':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <Calendar className="w-3 h-3" />
            Due in {diffDays} {diffDays === 1 ? 'day' : 'days'}
          </span>
        );
      case 'later':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-800 text-slate-400 border border-slate-700">
            <Calendar className="w-3 h-3" />
            {task.dueDate}
          </span>
        );
    }
  };

  const lastCompletedDate = task.completionHistory.length > 0
    ? new Date(task.completionHistory[task.completionHistory.length - 1]).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      })
    : null;

  return (
    <div
      className={`relative group bg-slate-900/80 hover:bg-slate-900 border rounded-2xl p-4 sm:p-5 transition-all duration-200 ${
        urgency === 'overdue'
          ? 'border-rose-900/40 hover:border-rose-700/60 shadow-lg shadow-rose-950/20'
          : urgency === 'due_today'
          ? 'border-amber-900/40 hover:border-amber-700/60 shadow-lg shadow-amber-950/20'
          : 'border-slate-800 hover:border-slate-700'
      } ${justCompleted ? 'scale-[0.98] opacity-60' : ''}`}
    >
      <div className="flex items-start gap-3.5">
        {/* Checkbox */}
        <button
          onClick={handleCheck}
          title="Mark complete for this period"
          className={`flex-shrink-0 mt-0.5 w-6 h-6 rounded-lg border-2 flex items-center justify-center transition-all ${
            justCompleted
              ? 'bg-emerald-500 border-emerald-500 text-white'
              : urgency === 'overdue'
              ? 'border-rose-500/60 hover:bg-rose-500/20 text-transparent hover:text-rose-400'
              : urgency === 'due_today'
              ? 'border-amber-500/60 hover:bg-amber-500/20 text-transparent hover:text-amber-400'
              : 'border-slate-600 hover:border-indigo-400 hover:bg-indigo-500/10 text-transparent hover:text-indigo-400'
          }`}
        >
          <Check className="w-3.5 h-3.5 stroke-[3]" />
        </button>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-slate-100 truncate pr-2">
              {task.title}
            </h3>

            {/* Menu button */}
            <div className="relative">
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                title="Options"
              >
                <MoreVertical className="w-4 h-4" />
              </button>

              {menuOpen && (
                <>
                  <div
                    className="fixed inset-0 z-10"
                    onClick={() => setMenuOpen(false)}
                  />
                  <div className="absolute right-0 mt-1 w-36 bg-slate-800 border border-slate-700 rounded-xl shadow-xl py-1 z-20">
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onEdit(task);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-slate-200 hover:bg-slate-700/60"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-indigo-400" />
                      Edit routine
                    </button>
                    <button
                      onClick={() => {
                        setMenuOpen(false);
                        onDelete(task.id);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs text-rose-400 hover:bg-rose-950/40"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-rose-400" />
                      Delete routine
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {task.notes && (
            <p className="text-xs text-slate-400 mt-1 line-clamp-2 leading-relaxed">
              {task.notes}
            </p>
          )}

          {/* Badges / Metadata */}
          <div className="flex flex-wrap items-center gap-2 mt-3 text-xs">
            {getUrgencyBadge()}

            {/* Recurrence Rule */}
            <span
              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border ${
                task.recurrenceType === 'after_completion'
                  ? 'bg-indigo-950/50 text-indigo-300 border-indigo-800/40'
                  : 'bg-cyan-950/50 text-cyan-300 border-cyan-800/40'
              }`}
              title={
                task.recurrenceType === 'after_completion'
                  ? 'Cadence recalculates from the exact date you complete this'
                  : 'Fixed schedule cadence'
              }
            >
              <RefreshCw className="w-2.5 h-2.5" />
              {formatRecurrenceLabel(
                task.recurrenceType,
                task.intervalValue,
                task.intervalUnit
              )}
            </span>

            {/* Completion count / last completed */}
            {task.completionHistory.length > 0 && (
              <span className="inline-flex items-center gap-1 text-slate-400 text-[11px]">
                <RotateCcw className="w-3 h-3 text-slate-500" />
                Done {task.completionHistory.length}x
                {lastCompletedDate && ` (last ${lastCompletedDate})`}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
