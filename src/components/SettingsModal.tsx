import { useState } from 'react';
import { db, ensureInboxList } from '../db/db';
import { loadGoogleScript, requestGoogleAccessToken } from '../sync/googleAuth';
import { SYNC_VERSION, syncWithGoogleDrive } from '../sync/googleDrive';
import type { Folder, SyncData, Task, TaskList } from '../types/task';
import { mergeFolders, mergeLists, mergeTasks } from '../domain/merge';
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
} from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSyncComplete?: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose, onSyncComplete }) => {
  const [clientId, setClientId] = useState<string>(() => {
    return localStorage.getItem('tempo_google_client_id') || '';
  });
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(
    null
  );
  const [lastSynced, setLastSynced] = useState<string | null>(() => {
    const saved = localStorage.getItem('tempo_last_synced_at');
    return saved ? new Date(parseInt(saved)).toLocaleString() : null;
  });
  const [notificationsOn, setNotificationsOn] = useState(() => isNotificationsEnabled());
  const [notifPermission, setNotifPermission] = useState(() => getNotificationPermission());

  if (!isOpen) return null;

  const handleSaveClientId = () => {
    localStorage.setItem('tempo_google_client_id', clientId.trim());
    setSyncStatus({ type: 'success', message: 'Client ID saved locally.' });
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
      setSyncStatus({ type: 'success', message: 'Due-task reminders enabled.' });
      try {
        new Notification('Tempo reminders on', {
          body: 'You will get a notification when a task becomes due while Tempo is open.',
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

    localStorage.setItem('tempo_google_client_id', trimmedId);
    setIsSyncing(true);
    setSyncStatus(null);

    try {
      await loadGoogleScript();
      const token = await requestGoogleAccessToken(trimmedId);
      const result = await syncWithGoogleDrive(token);

      if (result.success) {
        const timeStr = new Date(result.syncedAt).toLocaleString();
        localStorage.setItem('tempo_last_synced_at', String(result.syncedAt));
        setLastSynced(timeStr);
        setSyncStatus({
          type: 'success',
          message: `Synced ${result.tasksCount} tasks, ${result.listsCount} lists, ${result.foldersCount} folders!`,
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
    const tasks = await db.tasks.toArray();
    const lists = await db.lists.toArray();
    const folders = await db.folders.toArray();
    const data: SyncData = {
      version: SYNC_VERSION,
      exportedAt: Date.now(),
      tasks,
      lists,
      folders,
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

        if (!Array.isArray(incomingTasks)) {
          throw new Error('Invalid format: tasks array missing.');
        }

        const localTasks = await db.tasks.toArray();
        const localLists = await db.lists.toArray();
        const localFolders = await db.folders.toArray();
        const mergedTasks = mergeTasks(localTasks, incomingTasks);
        const mergedLists = mergeLists(localLists, incomingLists);
        const mergedFolders = mergeFolders(localFolders, incomingFolders);

        await db.transaction('rw', db.tasks, db.lists, db.folders, async () => {
          await db.tasks.bulkPut(mergedTasks);
          if (mergedLists.length > 0) {
            await db.lists.bulkPut(mergedLists);
          }
          if (mergedFolders.length > 0) {
            await db.folders.bulkPut(mergedFolders);
          }
        });
        await ensureInboxList();

        setSyncStatus({
          type: 'success',
          message: `Imported ${incomingTasks.length} tasks, ${incomingLists.length} lists, ${incomingFolders.length} folders!`,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-150">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-400">
              <Cloud className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-100">Settings & Sync</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 rounded-xl hover:bg-slate-800 transition-colors"
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
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                <Cloud className="w-3.5 h-3.5" />
                Google Drive AppData Sync
              </span>
              {lastSynced && (
                <span className="text-[11px] text-slate-400">Last: {lastSynced}</span>
              )}
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Syncs tasks and lists to your private Google Drive hidden application folder (
              <code className="text-indigo-300 bg-indigo-950/40 px-1 py-0.5 rounded">drive.appdata</code>
              ).
            </p>

            <div>
              <label className="block text-[11px] font-semibold text-slate-400 mb-1">
                Google OAuth Client ID
              </label>
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="xxxxxxxxxxxx-xxxx.apps.googleusercontent.com"
                    className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSaveClientId}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
                >
                  Save
                </button>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                disabled={isSyncing}
                onClick={handleGoogleSync}
                className="w-full py-2.5 px-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-950 disabled:text-indigo-400 text-white font-semibold text-xs flex items-center justify-center gap-2 transition-all shadow-md shadow-indigo-600/20 active:scale-98"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                {isSyncing ? 'Syncing with Google Drive...' : 'Sign In with Google & Sync Now'}
              </button>
            </div>

            <div className="pt-2 border-t border-slate-800/80">
              <details className="text-[11px] text-slate-400 cursor-pointer">
                <summary className="hover:text-slate-300 font-medium flex items-center gap-1">
                  <Key className="w-3 h-3 text-slate-400" />
                  How do I get a Google Client ID? (2 min setup)
                </summary>
                <div className="mt-2 space-y-1.5 pl-2 text-slate-400 border-l border-slate-800">
                  <p>
                    1. Go to{' '}
                    <a
                      href="https://console.cloud.google.com"
                      target="_blank"
                      rel="noreferrer"
                      className="text-indigo-400 underline inline-flex items-center gap-0.5"
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
                    <code className="text-slate-300">http://localhost:5180</code>) to{' '}
                    <strong>Authorized JavaScript Origins</strong>.
                  </p>
                  <p>5. Paste the Client ID above and click Sign In.</p>
                </div>
              </details>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <Bell className="w-3.5 h-3.5" />
              Due Reminders
            </span>
            <p className="text-xs text-slate-400 leading-relaxed">
              Browser notifications when a task&apos;s due date/time is reached while Tempo is open
              (or when you return to the tab). Works for date-only and timed dues.
            </p>
            <div className="flex items-center justify-between gap-3">
              <div className="text-[11px] text-slate-500">
                Permission: <span className="text-slate-300">{notifPermission}</span>
              </div>
              <button
                type="button"
                onClick={handleToggleNotifications}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
                  notificationsOn
                    ? 'bg-amber-600 hover:bg-amber-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                }`}
              >
                {notificationsOn ? 'Reminders On' : 'Enable Reminders'}
              </button>
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <HardDrive className="w-3.5 h-3.5" />
              Offline File Backup & Restore
            </span>
            <p className="text-xs text-slate-400">
              Export tasks and lists as JSON, or restore from a previous backup.
            </p>

            <div className="grid grid-cols-2 gap-2.5 pt-1">
              <button
                type="button"
                onClick={handleExportJson}
                className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-indigo-400" />
                Export JSON
              </button>

              <label className="flex items-center justify-center gap-1.5 py-2 px-3 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl cursor-pointer transition-colors">
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
        </div>

        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
