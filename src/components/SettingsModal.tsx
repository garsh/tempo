import { useState } from 'react';
import { db, ensureInboxList } from '../db/db';
import {
  getStoredClientId,
  setStoredClientId,
  loadGoogleScript,
  requestGoogleAccessToken,
  clearStoredToken,
} from '../sync/googleAuth';
import { SYNC_VERSION, syncWithGoogleDrive } from '../sync/googleDrive';
import {
  isAutoSyncEnabled,
  setAutoSyncEnabled,
  recordSyncSuccess,
} from '../sync/autoSync';
import type { Folder, SavedFilter, SyncData, Task, TaskList } from '../types/task';
import { mergeFolders, mergeLists, mergeSavedFilters, mergeTasks } from '../domain/merge';
import { importTasksFromCsv } from '../domain/ticktickImport';
import { computeTempoStats } from '../domain/stats';
import {
  getNotificationPermission,
  isNotificationsEnabled,
  notificationsSupported,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../domain/notifications';
import {
  X,
  Cloud,
  HardDrive,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Key,
  ExternalLink,
  Bell,
  FileSpreadsheet,
  BarChart3,
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
  tasks?: Task[];
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSyncComplete,
  tasks = [],
}) => {
  const [clientId, setClientId] = useState<string>(() => getStoredClientId());
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    const saved = localStorage.getItem('tempo_last_synced_at');
    return saved ? new Date(parseInt(saved)).toLocaleString() : null;
  });
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const [notificationsOn, setNotificationsOn] = useState(() => isNotificationsEnabled());
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());

  if (!isOpen) return null;

  const stats = computeTempoStats(tasks);

  const handleSaveClientId = () => {
    setStoredClientId(clientId.trim());
    setSyncStatus({ type: 'success', message: 'Client ID saved locally.' });
  };

  const handleToggleAutoSync = () => {
    const next = !autoSync;
    setAutoSyncEnabled(next);
    setAutoSync(next);
    setSyncStatus({
      type: 'success',
      message: next
        ? 'Background sync on — Tempo will sync on startup and every ~10 minutes while open.'
        : 'Background sync off. Manual sync still available.',
    });
  };

  const handleToggleNotifications = async () => {
    if (!notificationsSupported()) {
      setSyncStatus({ type: 'error', message: 'Notifications are not supported in this browser.' });
      return;
    }
    if (!notificationsOn) {
      const perm = await requestNotificationPermission();
      setNotifPermission(perm);
      if (perm !== 'granted') {
        setSyncStatus({
          type: 'error',
          message: 'Notification permission was not granted. Check browser site settings.',
        });
        setNotificationsOn(false);
        return;
      }
      setNotificationsEnabled(true);
      setNotificationsOn(true);
      setSyncStatus({
        type: 'success',
        message:
          'Due-task reminders enabled. Installed PWA + service worker improve reliability.',
      });
      try {
        new Notification('Tempo reminders on', {
          body: 'You will get a notification when a task becomes due while Tempo is open.',
          icon: '/pwa-192x192.png',
        });
      } catch {
        /* ignore */
      }
    } else {
      setNotificationsEnabled(false);
      setNotificationsOn(false);
      setSyncStatus({ type: 'success', message: 'Reminders disabled.' });
    }
  };

  const handleGoogleSync = async () => {
    const trimmedId = clientId.trim();
    if (!trimmedId) {
      setSyncStatus({ type: 'error', message: 'Please enter your Google OAuth Client ID below.' });
      return;
    }

    setStoredClientId(trimmedId);
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      await loadGoogleScript();
      clearStoredToken();
      const token = await requestGoogleAccessToken(trimmedId, 'interactive');
      const result = await syncWithGoogleDrive(token);

      if (result.success) {
        recordSyncSuccess(result.syncedAt);
        const timeStr = new Date(result.syncedAt).toLocaleString();
        setLastSynced(timeStr);
        setSyncStatus({
          type: 'success',
          message: `Synced ${result.tasksCount} tasks, ${result.listsCount} lists, ${result.foldersCount} folders, ${result.filtersCount} filters!`,
        });
        if (onSyncComplete) onSyncComplete();
      }
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      setSyncStatus({
        type: 'error',
        message: `Sync failed: ${errorMsg}`,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleExportJson = async () => {
    await ensureInboxList();
    const allTasks = await db.tasks.toArray();
    const lists = await db.lists.toArray();
    const folders = await db.folders.toArray();
    const savedFilters = await db.savedFilters.toArray();
    const data: SyncData = {
      version: SYNC_VERSION,
      exportedAt: Date.now(),
      tasks: allTasks,
      lists,
      folders,
      savedFilters,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `tempo-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const parsed = JSON.parse(content) as SyncData | Task[];
        const incomingTasks: Task[] = Array.isArray(parsed) ? parsed : parsed.tasks || [];
        const incomingLists: TaskList[] = Array.isArray(parsed) ? [] : parsed.lists || [];
        const incomingFolders: Folder[] = Array.isArray(parsed) ? [] : parsed.folders || [];
        const incomingFilters: SavedFilter[] = Array.isArray(parsed)
          ? []
          : parsed.savedFilters || [];

        if (!Array.isArray(incomingTasks)) {
          throw new Error('Invalid format: tasks array missing.');
        }

        const localTasks = await db.tasks.toArray();
        const localLists = await db.lists.toArray();
        const localFolders = await db.folders.toArray();
        const localFilters = await db.savedFilters.toArray();
        const mergedTasks = mergeTasks(localTasks, incomingTasks);
        const mergedLists = mergeLists(localLists, incomingLists);
        const mergedFolders = mergeFolders(localFolders, incomingFolders);
        const mergedFilters = mergeSavedFilters(localFilters, incomingFilters);

        await db.transaction('rw', db.tasks, db.lists, db.folders, db.savedFilters, async () => {
          await db.tasks.bulkPut(mergedTasks);
          if (mergedLists.length > 0) {
            await db.lists.bulkPut(mergedLists);
          }
          if (mergedFolders.length > 0) {
            await db.folders.bulkPut(mergedFolders);
          }
          if (mergedFilters.length > 0) {
            await db.savedFilters.bulkPut(mergedFilters);
          }
        });
        await ensureInboxList();

        setSyncStatus({
          type: 'success',
          message: `Imported ${incomingTasks.length} tasks, ${incomingLists.length} lists, ${incomingFolders.length} folders, ${incomingFilters.length} filters!`,
        });
        if (onSyncComplete) onSyncComplete();
      } catch (err) {
        setSyncStatus({
          type: 'error',
          message: `Import failed: ${(err as Error).message}`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleImportCsv = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        const result = importTasksFromCsv(content);
        if (result.format === 'unknown' || result.tasks.length === 0) {
          throw new Error(
            'Unrecognized CSV. Export from TickTick (CSV) or use columns: title, list, due, priority, tags, notes, status.'
          );
        }

        await ensureInboxList();
        await db.transaction('rw', db.tasks, db.lists, async () => {
          if (result.lists.length) await db.lists.bulkPut(result.lists);
          if (result.tasks.length) await db.tasks.bulkPut(result.tasks);
        });

        setSyncStatus({
          type: 'success',
          message: `Imported ${result.tasks.length} tasks from ${result.format} CSV` +
            (result.lists.length ? ` (${result.lists.length} lists)` : '') +
            (result.skipped ? `, skipped ${result.skipped}` : '') +
            '.',
        });
        if (onSyncComplete) onSyncComplete();
      } catch (err) {
        setSyncStatus({
          type: 'error',
          message: `CSV import failed: ${(err as Error).message}`,
        });
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-white border border-tt-border rounded-3xl shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-tt-border">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-tt-blue-soft text-tt-blue">
              <Cloud className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-tt-text">Settings & Sync</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-tt-secondary hover:text-tt-text rounded-xl hover:bg-tt-sidebar transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {syncStatus && (
          <div
            className={`mt-4 p-3 rounded-2xl flex items-center gap-2.5 text-xs ${
              syncStatus.type === 'success'
                ? 'bg-emerald-950/50 border border-emerald-800/60 text-emerald-300'
                : 'bg-rose-950/50 border border-rose-800/60 text-rose-300'
            }`}
          >
            {syncStatus.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
            ) : (
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            )}
            <span className="flex-1">{syncStatus.message}</span>
          </div>
        )}

        <div className="mt-5 space-y-6">
          <div className="p-4 rounded-2xl bg-tt-sidebar border border-tt-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-tt-blue flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                Google Drive AppData Sync
              </span>
              {lastSynced && (
                <span className="text-[11px] text-tt-secondary">Last: {lastSynced}</span>
              )}
            </div>

            <p className="text-xs text-tt-text/80 leading-relaxed">
              Syncs privately to Drive AppData. Startup + periodic background sync stays silent when
              your session token is still valid; conflicts (412) re-merge automatically.
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-tt-secondary mb-1">
                Google OAuth Client ID
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxxxxxxxxxx-xxxx.apps.googleusercontent.com"
                    className="w-full px-3 py-2 bg-tt-sidebar border border-tt-border rounded-xl text-xs text-tt-text placeholder-tt-muted focus:outline-none focus:border-tt-blue"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveClientId}
                  className="px-3 py-2 bg-tt-sidebar hover:bg-black/[0.06] text-tt-text text-xs font-medium rounded-xl transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-tt-secondary leading-snug">
                Background sync (startup / ~10 min / on return)
              </div>
              <button
                type="button"
                onClick={handleToggleAutoSync}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors shrink-0 ${
                  autoSync
                    ? 'bg-tt-blue hover:bg-tt-blue-hover text-white'
                    : 'bg-tt-sidebar hover:bg-black/[0.06] text-tt-text'
                }`}
              >
                {autoSync ? 'Auto On' : 'Auto Off'}
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleGoogleSync}
                className="w-full py-2.5 px-4 rounded-xl bg-tt-blue hover:bg-tt-blue-hover disabled:bg-tt-blue-soft disabled:text-tt-blue text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-tt-blue/20 active:scale-98"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing with Google Drive...' : 'Sign In with Google & Sync Now'}
              </button>
            </div>

            <div className="pt-2 border-t border-tt-border/80">
              <details className="text-[11px] text-tt-secondary cursor-pointer">
                <summary className="hover:text-tt-text/80 font-medium flex items-center gap-1">
                  <Key className="w-3 h-3 text-tt-secondary" />
                  How do I get a Google Client ID? (2 min setup)
                </summary>
                <div className="mt-2 space-y-1.5 pl-2 text-tt-secondary border-l border-tt-border">
                  <p>
                    1. Go to{' '}
                    <a
                      href="https://console.cloud.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-tt-blue underline inline-flex items-center gap-0.5"
                    >
                      Google Cloud Console <ExternalLink className="w-2.5 h-2.5" />
                    </a>{' '}
                    and create a project.
                  </p>
                  <p>
                    2. Enable the <strong>Google Drive API</strong>.
                  </p>
                  <p>
                    3. In <strong>Credentials</strong>, create an <strong>OAuth Client ID</strong> for
                    a <em>Web Application</em>.
                  </p>
                  <p>
                    4. Add your app&apos;s origin URL (e.g.{' '}
                    <code className="text-tt-text/80">http://localhost:5180</code>) to{' '}
                    <strong>Authorized JavaScript Origins</strong>.
                  </p>
                  <p>5. Paste the Client ID above and click Sign In.</p>
                </div>
              </details>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-tt-sidebar border border-tt-border space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              Due Reminders
            </span>
            <p className="text-xs text-tt-secondary leading-relaxed">
              Fires when a due date/time is reached while Tempo is open, on focus, when you come
              back online, and via the service worker when installed as a PWA.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-tt-muted">
                Permission: <span className="text-tt-text/80">{notifPermission}</span>
              </div>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  notificationsOn
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-tt-sidebar hover:bg-black/[0.06] text-tt-text'
                }`}
              >
                {notificationsOn ? 'Reminders On' : 'Enable Reminders'}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-tt-sidebar border border-tt-border space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <BarChart3 className="w-3.5 h-3.5" />
              Quick stats
            </span>
            <div className="grid grid-cols-5 gap-1.5 text-center">
              {[
                ['Open', stats.openCount],
                ['Overdue', stats.overdueCount],
                ['Today', stats.dueTodayCount],
                ['Done/wk', stats.completedThisWeek],
                ['Streak', stats.completionStreakDays],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-xl bg-tt-sidebar border border-tt-border py-2">
                  <div className="text-sm font-bold text-tt-text tabular-nums">{value}</div>
                  <div className="text-[9px] text-tt-muted">{label}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-tt-sidebar border border-tt-border space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-tt-secondary flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              Offline File Backup & Restore
            </span>
            <p className="text-xs text-tt-secondary">
              Export tasks and lists as JSON, or restore from a previous backup.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-tt-sidebar hover:bg-black/[0.06] text-tt-text text-xs font-medium rounded-xl transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-tt-blue" />
                Export JSON
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 bg-tt-sidebar hover:bg-black/[0.06] text-tt-text text-xs font-medium rounded-xl cursor-pointer transition-colors">
                <Upload className="w-3.5 h-3.5 text-emerald-400" />
                Import JSON
                <input
                  type="file"
                  accept=".json,application/json"
                  onChange={handleImportJson}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-tt-sidebar border border-tt-border space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
              <FileSpreadsheet className="w-3.5 h-3.5" />
              Import TickTick / CSV
            </span>
            <p className="text-xs text-tt-secondary leading-relaxed">
              Optional one-shot import from a TickTick CSV export, or a simple CSV with{' '}
              <code className="text-tt-text/80">title, list, due, priority, tags, notes, status</code>.
            </p>
            <label className="flex items-center justify-center gap-1.5 py-2.5 px-3 bg-tt-sidebar hover:bg-black/[0.06] text-tt-text text-xs font-medium rounded-xl cursor-pointer transition-colors">
              <Upload className="w-3.5 h-3.5 text-cyan-400" />
              Choose CSV file
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={handleImportCsv}
                className="hidden"
              />
            </label>
          </div>
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-tt-sidebar hover:bg-black/[0.06] text-tt-text transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
