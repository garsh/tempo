import { useEffect, useState, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  CheckCircle2,
  ExternalLink,
  Key,
  Keyboard,
  LogOut,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Task, TaskList } from '../../types/task';
import { clearSampleTasks, isSampleId, loadSampleTasks } from '../../db/db';
import {
  clearStoredToken,
  getStoredClientId,
  loadGoogleScript,
  requestGoogleAccessToken,
  setStoredClientId,
} from '../../sync/googleAuth';
import { syncWithGoogleDrive } from '../../sync/googleDrive';
import {
  isAutoSyncEnabled,
  recordSyncSuccess,
  refreshGoogleAccount,
  setAutoSyncEnabled,
  type SyncStatusSnapshot,
} from '../../sync/autoSync';
import { setGoogleAccount } from '../../sync/googleAccount';
import { computeTempoStats } from '../../domain/stats';
import { formatClockTime } from '../../domain/recurrence';
import {
  getNotificationPermission,
  isNotificationsEnabled,
  notificationsSupported,
  requestNotificationPermission,
  setNotificationsEnabled,
} from '../../domain/notifications';
import {
  ALL_TABS,
  MAX_TABS,
  MIN_TABS,
  TAB_LABELS,
  moveTab,
  toggleTab,
  usePrefs,
  type TabId,
} from '../../prefs/prefs';
import { Switch } from '../ui/Sheet';
import { Avatar } from '../drawer/drawerBits';
import { summarizeAccount } from '../../sync/accountSummary';
import { exportJsonBackup, importCsv, importJsonBackup, readFileText } from './dataTransfer';
import { Card, ControlRow, NavRow, Note, RadioRow, SectionLabel, SettingsHeader } from './settingsUi';
import {
  AppearanceIcon,
  CsvIcon,
  DateTimeIcon,
  DriveIcon,
  ExportIcon,
  GeneralIcon,
  HelpIcon,
  ImportIcon,
  IntegrationsIcon,
  SoundsIcon,
  TabBarIcon,
} from './settingsIcons';

export type SettingsPageId =
  | 'root'
  | 'account'
  | 'tabbar'
  | 'appearance'
  | 'datetime'
  | 'notifications'
  | 'general'
  | 'integrations';

export const FEEDBACK_URL = 'https://github.com/garsh/tempo/issues';

const TITLES: Record<SettingsPageId, string> = {
  root: 'Settings',
  account: 'Account & Sync',
  tabbar: 'Tab Bar',
  appearance: 'Appearance',
  datetime: 'Date & Time',
  notifications: 'Sounds & Notifications',
  general: 'General',
  integrations: 'Integrations & Import',
};

interface SettingsPageProps {
  isOpen: boolean;
  initialPage?: SettingsPageId;
  onClose: () => void;
  tasks: Task[];
  lists: TaskList[];
  syncStatus: SyncStatusSnapshot;
  onSyncStatusChange: () => void;
  onShowShortcuts: () => void;
}

type Status = { type: 'success' | 'error'; message: string } | null;

/**
 * Mount fresh per open (App keys it) so the page stack + banner reset each time.
 *
 * TickTick-style Settings: a full page on phones (← Settings, grouped white cards on
 * the gray page), a centered panel on desktop. Sub-pages hold every setting that used
 * to live in the old Settings & Sync modal.
 */
export function SettingsPage(props: SettingsPageProps) {
  const { isOpen, initialPage = 'root', onClose } = props;
  const [page, setPage] = useState<SettingsPageId>(initialPage);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      if (page === 'root' || page === initialPage) onClose();
      else setPage('root');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [isOpen, page, initialPage, onClose]);

  if (!isOpen) return null;

  const go = (p: SettingsPageId) => {
    setStatus(null);
    setPage(p);
  };
  const back = () => (page === 'root' || page === initialPage ? onClose() : go('root'));

  let body: ReactNode;
  switch (page) {
    case 'root':
      body = <RootPage {...props} go={go} />;
      break;
    case 'account':
      body = <AccountPage {...props} setStatus={setStatus} />;
      break;
    case 'tabbar':
      body = <TabBarPage />;
      break;
    case 'appearance':
      body = <AppearancePage />;
      break;
    case 'datetime':
      body = <DateTimePage />;
      break;
    case 'notifications':
      body = <NotificationsPage setStatus={setStatus} go={go} />;
      break;
    case 'general':
      body = <GeneralPage {...props} setStatus={setStatus} />;
      break;
    case 'integrations':
      body = <IntegrationsPage {...props} setStatus={setStatus} go={go} />;
      break;
  }

  return (
    <div
      className="fixed inset-0 z-[55] bg-tt-bg lg:bg-tt-scrim lg:flex lg:items-center lg:justify-center lg:p-6"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="settings-page"
      data-settings-page={page}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[page]}
        className="h-full w-full lg:h-[min(780px,92vh)] lg:max-w-[520px] lg:rounded-2xl lg:shadow-2xl bg-tt-bg flex flex-col overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <SettingsHeader title={TITLES[page]} onBack={back} backLabel={page === 'root' ? 'Close settings' : 'Back'} />
        <div className="flex-1 min-h-0 overflow-y-auto pb-6" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {status && (
            <div
              role="status"
              className={`mx-4 mb-4 p-3 rounded-xl flex items-start gap-2.5 text-[13px] ${
                status.type === 'success' ? 'bg-tt-success/10 text-tt-success' : 'bg-tt-overdue/10 text-tt-overdue'
              }`}
            >
              {status.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-px" />
              ) : (
                <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
              )}
              <span className="flex-1">{status.message}</span>
            </div>
          )}
          {body}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Root ───────────────────────────── */

function RootPage({ syncStatus, go }: SettingsPageProps & { go: (p: SettingsPageId) => void }) {
  const summary = summarizeAccount(syncStatus.account, syncStatus, !!getStoredClientId());
  return (
    <>
      <button
        type="button"
        onClick={() => go('account')}
        className="w-full flex items-center gap-[17px] pl-4 pr-[18px] mb-5 text-left"
        aria-label={`Account: ${summary.title}`}
      >
        <Avatar account={syncStatus.account} size={74} />
        <span className="flex-1 min-w-0">
          <span className="block text-[19px] font-bold text-tt-text truncate">{summary.title}</span>
          <span className={`flex items-center gap-1.5 mt-1 text-[13px] ${summary.warn ? 'text-tt-icon-amber' : 'text-tt-secondary'}`}>
            <DriveIcon />
            <span className="truncate">{summary.subtitle}</span>
          </span>
        </span>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden className="text-tt-chevron shrink-0">
          <path d="M6 3.5 10.5 8 6 12.5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      <Card>
        <NavRow icon={<TabBarIcon />} label="Tab Bar" onClick={() => go('tabbar')} />
      </Card>
      <Card>
        <NavRow icon={<AppearanceIcon />} label="Appearance" onClick={() => go('appearance')} />
        <NavRow icon={<DateTimeIcon />} label="Date & Time" onClick={() => go('datetime')} />
        <NavRow icon={<SoundsIcon />} label="Sounds & Notifications" onClick={() => go('notifications')} />
        <NavRow icon={<GeneralIcon />} label="General" onClick={() => go('general')} />
      </Card>
      <Card>
        <NavRow icon={<IntegrationsIcon />} label="Integrations & Import" onClick={() => go('integrations')} />
      </Card>
      <Card>
        <NavRow icon={<HelpIcon />} label="Help & Feedback" href={FEEDBACK_URL} />
      </Card>
    </>
  );
}

/* ───────────────────────── Account & Drive sync ───────────────────────── */

function AccountPage({
  syncStatus,
  onSyncStatusChange,
  setStatus,
}: SettingsPageProps & { setStatus: (s: Status) => void }) {
  const [clientId, setClientId] = useState(() => getStoredClientId());
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const summary = summarizeAccount(syncStatus.account, syncStatus, !!getStoredClientId());
  const lastSynced = syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleString() : 'Never';

  const handleSaveClientId = () => {
    setStoredClientId(clientId.trim());
    setStatus({ type: 'success', message: 'Client ID saved locally.' });
    onSyncStatusChange();
  };
  const handleToggleAutoSync = (next: boolean) => {
    setAutoSyncEnabled(next);
    setAutoSync(next);
    setStatus({
      type: 'success',
      message: next
        ? 'Background sync on — Tempo will sync on startup and every ~10 minutes while open.'
        : 'Background sync off. Manual sync still available.',
    });
    onSyncStatusChange();
  };
  const handleGoogleSync = async () => {
    const trimmedId = clientId.trim();
    if (!trimmedId) {
      setStatus({ type: 'error', message: 'Please enter your Google OAuth Client ID below.' });
      return;
    }
    setStoredClientId(trimmedId);
    setIsSyncing(true);
    setStatus(null);
    try {
      await loadGoogleScript();
      clearStoredToken();
      const token = await requestGoogleAccessToken(trimmedId, 'interactive');
      const result = await syncWithGoogleDrive(token);
      if (result.success) {
        recordSyncSuccess(result.syncedAt);
        await refreshGoogleAccount(token);
        setStatus({
          type: 'success',
          message: `Synced ${result.tasksCount} tasks, ${result.listsCount} lists, ${result.foldersCount} folders, ${result.filtersCount} filters!`,
        });
      }
    } catch (err: unknown) {
      setStatus({ type: 'error', message: `Sync failed: ${err instanceof Error ? err.message : String(err)}` });
    } finally {
      setIsSyncing(false);
      onSyncStatusChange();
    }
  };
  const handleSignOut = () => {
    clearStoredToken();
    setGoogleAccount(null);
    setStatus({ type: 'success', message: 'Signed out on this device. Local tasks are kept.' });
    onSyncStatusChange();
  };

  return (
    <>
      <div className="flex flex-col items-center pt-2 pb-5">
        <Avatar account={syncStatus.account} size={74} />
        <div className="mt-3 text-[19px] font-bold text-tt-text">{summary.title}</div>
        <div className={`text-[13px] ${summary.warn ? 'text-tt-icon-amber' : 'text-tt-secondary'}`}>{summary.subtitle}</div>
      </div>

      <SectionLabel>Google Drive sync</SectionLabel>
      <Card>
        <ControlRow icon={<DriveIcon />} label="Last synced" sub="Private Drive AppData folder">
          <span className="text-[14px] text-tt-secondary">{lastSynced}</span>
        </ControlRow>
        <ControlRow label="Background sync" sub="Startup, every ~10 min and on return">
          <Switch checked={autoSync} onChange={handleToggleAutoSync} label="Background sync" />
        </ControlRow>
        <div className="px-4 pb-4 pt-1">
          <button
            type="button"
            disabled={isSyncing}
            onClick={() => void handleGoogleSync()}
            className="w-full h-11 rounded-xl bg-tt-blue hover:bg-tt-blue-hover disabled:opacity-60 text-white font-semibold text-[15px] flex items-center justify-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Syncing with Google Drive…' : 'Sign In with Google & Sync Now'}
          </button>
        </div>
      </Card>
      <Note>
        Syncs privately to Drive AppData. Startup + periodic background sync stays silent when your session token
        is still valid; conflicts (412) re-merge automatically.
      </Note>

      <SectionLabel>Google OAuth Client ID</SectionLabel>
      <Card className="p-4 space-y-3">
        <div className="flex gap-2">
          <input
            type="text"
            value={clientId}
            onChange={(e) => setClientId(e.target.value)}
            placeholder="xxxxxxxxxxxx-xxxx.apps.googleusercontent.com"
            aria-label="Google OAuth Client ID"
            className="flex-1 min-w-0 px-3 py-2.5 bg-tt-input rounded-xl text-[13px] text-tt-text placeholder:text-tt-muted outline-none focus:ring-1 focus:ring-tt-blue"
          />
          <button type="button" onClick={handleSaveClientId} className="px-4 rounded-xl bg-tt-input text-[14px] font-medium text-tt-text hover:bg-tt-hover">
            Save
          </button>
        </div>
        <details className="text-[13px] text-tt-secondary">
          <summary className="cursor-pointer font-medium flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            How do I get a Google Client ID? (2 min setup)
          </summary>
          <div className="mt-2 space-y-1.5 pl-3 border-l border-tt-border">
            <p>
              1. Go to{' '}
              <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-tt-blue underline inline-flex items-center gap-0.5">
                Google Cloud Console <ExternalLink className="w-3 h-3" />
              </a>{' '}
              and create a project.
            </p>
            <p>
              2. Enable the <strong>Google Drive API</strong>.
            </p>
            <p>
              3. In <strong>Credentials</strong>, create an <strong>OAuth Client ID</strong> for a <em>Web Application</em>.
            </p>
            <p>
              4. Add your app&apos;s origin URL (e.g. <code className="text-tt-text">http://localhost:5180</code>) to{' '}
              <strong>Authorized JavaScript Origins</strong>.
            </p>
            <p>5. Paste the Client ID above and tap Sign In.</p>
          </div>
        </details>
      </Card>

      {(syncStatus.account || syncStatus.lastSyncedAt) && (
        <Card>
          <NavRow icon={<LogOut className="w-5 h-5 text-tt-overdue" />} label="Sign out on this device" onClick={handleSignOut} chevron={false} danger />
        </Card>
      )}
    </>
  );
}

/* ───────────────────────────── Tab Bar ───────────────────────────── */

function TabBarPage() {
  const [prefs, update] = usePrefs();
  const tabs = prefs.tabs;
  const hidden = ALL_TABS.filter((t) => !tabs.includes(t));
  const row = (tab: TabId, on: boolean, idx: number) => (
    <div key={tab} className="min-h-[50px] flex items-center pl-4 pr-[18px] gap-2" data-tab-row={tab}>
      <span className="flex-1 text-[17px] text-tt-text">
        {TAB_LABELS[tab]}
        {tab === 'tasks' && <span className="ml-2 text-[12px] text-tt-secondary">Required</span>}
      </span>
      {on && (
        <>
          <button
            type="button"
            aria-label={`Move ${TAB_LABELS[tab]} left`}
            disabled={idx === 0}
            onClick={() => update({ tabs: moveTab(tabs, tab, -1) })}
            className="w-9 h-9 flex items-center justify-center text-tt-secondary disabled:opacity-25"
          >
            <ArrowUp className="w-[18px] h-[18px]" />
          </button>
          <button
            type="button"
            aria-label={`Move ${TAB_LABELS[tab]} right`}
            disabled={idx === tabs.length - 1}
            onClick={() => update({ tabs: moveTab(tabs, tab, 1) })}
            className="w-9 h-9 flex items-center justify-center text-tt-secondary disabled:opacity-25"
          >
            <ArrowDown className="w-[18px] h-[18px]" />
          </button>
        </>
      )}
      <Switch
        checked={on}
        label={`Show ${TAB_LABELS[tab]} tab`}
        disabled={tab === 'tasks' || (on && tabs.length <= MIN_TABS) || (!on && tabs.length >= MAX_TABS)}
        onChange={() => update({ tabs: toggleTab(tabs, tab) })}
      />
    </div>
  );
  return (
    <>
      <SectionLabel>Shown (in order)</SectionLabel>
      <Card>{tabs.map((t, i) => row(t, true, i))}</Card>
      {hidden.length > 0 && (
        <>
          <SectionLabel>Hidden</SectionLabel>
          <Card>{hidden.map((t, i) => row(t, false, i))}</Card>
        </>
      )}
      <Note>
        Choose {MIN_TABS}–{MAX_TABS} tabs for the bottom bar on phones. Tasks is always shown. Default: Tasks, Calendar,
        Settings.
      </Note>
      <Card>
        <NavRow
          label="Reset to default"
          chevron={false}
          onClick={() => update({ tabs: ['tasks', 'calendar', 'settings'] })}
        />
      </Card>
    </>
  );
}

/* ──────────────────────────── Appearance ──────────────────────────── */

function AppearancePage() {
  const [prefs, update] = usePrefs();
  return (
    <>
      <SectionLabel>Theme</SectionLabel>
      <Card>
        <div role="radiogroup" aria-label="Theme">
          <RadioRow label="System" sub="Follow the device light / dark setting" checked={prefs.theme === 'system'} onSelect={() => update({ theme: 'system' })} />
          <RadioRow label="Light" checked={prefs.theme === 'light'} onSelect={() => update({ theme: 'light' })} />
          <RadioRow label="Dark" checked={prefs.theme === 'dark'} onSelect={() => update({ theme: 'dark' })} />
        </div>
      </Card>
      <Note>Light or Dark overrides the device setting on this device only.</Note>
    </>
  );
}

/* ──────────────────────────── Date & Time ──────────────────────────── */

function DateTimePage() {
  const [prefs, update] = usePrefs();
  return (
    <>
      <SectionLabel>Week starts on</SectionLabel>
      <Card>
        <div role="radiogroup" aria-label="Week starts on">
          {([
            [0, 'Sunday'],
            [1, 'Monday'],
            [6, 'Saturday'],
          ] as const).map(([v, label]) => (
            <RadioRow key={v} label={label} checked={prefs.weekStart === v} onSelect={() => update({ weekStart: v })} />
          ))}
        </div>
      </Card>
      <SectionLabel>Time format</SectionLabel>
      <Card>
        <div role="radiogroup" aria-label="Time format">
          <RadioRow label="12-hour" sub="5:30 PM" checked={prefs.timeFormat === '12h'} onSelect={() => update({ timeFormat: '12h' })} />
          <RadioRow label="24-hour" sub="17:30" checked={prefs.timeFormat === '24h'} onSelect={() => update({ timeFormat: '24h' })} />
        </div>
      </Card>
      <SectionLabel>Reminders</SectionLabel>
      <Card>
        <ControlRow
          label="Default reminder time"
          sub={`Tasks with only a date remind at ${formatClockTime(prefs.defaultReminderTime, prefs.timeFormat)}`}
        >
          <input
            type="time"
            value={prefs.defaultReminderTime}
            onChange={(e) => e.target.value && update({ defaultReminderTime: e.target.value })}
            aria-label="Default reminder time"
            className="px-2 py-1.5 rounded-lg bg-tt-input text-[15px] text-tt-text outline-none"
          />
        </ControlRow>
      </Card>
    </>
  );
}

/* ─────────────────────── Sounds & Notifications ─────────────────────── */

function NotificationsPage({ setStatus, go }: { setStatus: (s: Status) => void; go: (p: SettingsPageId) => void }) {
  const [prefs] = usePrefs();
  const [on, setOn] = useState(() => isNotificationsEnabled());
  const [permission, setPermission] = useState(() => getNotificationPermission());

  const toggle = async (next: boolean) => {
    if (!notificationsSupported()) {
      setStatus({ type: 'error', message: 'Notifications are not supported in this browser.' });
      return;
    }
    if (next) {
      const perm = await requestNotificationPermission();
      setPermission(perm);
      if (perm !== 'granted') {
        setStatus({ type: 'error', message: 'Notification permission was not granted. Check browser site settings.' });
        setOn(false);
        return;
      }
      setNotificationsEnabled(true);
      setOn(true);
      setStatus({ type: 'success', message: 'Due-task reminders enabled. Installed PWA + service worker improve reliability.' });
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
      setOn(false);
      setStatus({ type: 'success', message: 'Reminders disabled.' });
    }
  };

  return (
    <>
      <Card>
        <ControlRow icon={<SoundsIcon />} label="Due reminders" sub="Notify when a task becomes due">
          <Switch checked={on} onChange={(v) => void toggle(v)} label="Due reminders" />
        </ControlRow>
        <ControlRow label="Permission">
          <span className="text-[14px] text-tt-secondary">{permission}</span>
        </ControlRow>
        <NavRow
          label="Default reminder time"
          value={formatClockTime(prefs.defaultReminderTime, prefs.timeFormat)}
          onClick={() => go('datetime')}
        />
      </Card>
      <Note>
        Fires when a due date/time is reached while Tempo is open, on focus, when you come back online, and via the
        service worker when installed as a PWA.
      </Note>
    </>
  );
}

/* ───────────────────────────── General ───────────────────────────── */

function GeneralPage({
  tasks,
  lists,
  onShowShortcuts,
  setStatus,
}: SettingsPageProps & { setStatus: (s: Status) => void }) {
  const [prefs, update] = usePrefs();
  const stats = computeTempoStats(tasks);
  const hasSampleTasks = tasks.some((t) => isSampleId(t.id) && !t.deletedAt);
  const defaultListValid = lists.some((l) => l.id === prefs.defaultListId);

  return (
    <>
      <SectionLabel>New tasks</SectionLabel>
      <Card>
        <ControlRow label="Default list" sub="Used outside a specific list">
          <select
            value={defaultListValid ? prefs.defaultListId : 'inbox'}
            onChange={(e) => update({ defaultListId: e.target.value })}
            aria-label="Default list for new tasks"
            className="max-w-[45%] px-2 py-1.5 rounded-lg bg-tt-input text-[15px] text-tt-text outline-none"
          >
            {lists.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        </ControlRow>
      </Card>

      <SectionLabel>Sample tasks</SectionLabel>
      <Card>
        <div data-tempo-sample-tasks="1">
          <NavRow
            icon={<Sparkles className="w-5 h-5 text-tt-blue" />}
            label="Load sample tasks"
            chevron={false}
            onClick={() =>
              void loadSampleTasks().then((n) => setStatus({ type: 'success', message: `Loaded ${n} sample tasks.` }))
            }
          />
          <NavRow
            icon={<Trash2 className={`w-5 h-5 ${hasSampleTasks ? 'text-tt-overdue' : 'text-tt-muted'}`} />}
            label={<span className={hasSampleTasks ? '' : 'text-tt-muted'}>Clear sample tasks</span>}
            chevron={false}
            onClick={() =>
              void clearSampleTasks().then((n) =>
                setStatus({ type: 'success', message: n ? `Removed ${n} sample tasks.` : 'No sample tasks to remove.' })
              )
            }
          />
        </div>
      </Card>
      <Note>New installs start empty. Sample lists and tasks help you explore; clearing removes only sample items.</Note>

      <SectionLabel>Quick stats</SectionLabel>
      <Card className="p-3">
        <div className="grid grid-cols-5 gap-1.5 text-center">
          {([
            ['Open', stats.openCount],
            ['Overdue', stats.overdueCount],
            ['Today', stats.dueTodayCount],
            ['Done/wk', stats.completedThisWeek],
            ['Streak', stats.completionStreakDays],
          ] as const).map(([label, value]) => (
            <div key={label} className="rounded-xl bg-tt-input py-2">
              <div className="text-[15px] font-bold text-tt-text tabular-nums">{value}</div>
              <div className="text-[10px] text-tt-secondary">{label}</div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <NavRow icon={<Keyboard className="w-5 h-5 text-tt-blue" />} label="Keyboard shortcuts" onClick={onShowShortcuts} />
      </Card>
    </>
  );
}

/* ─────────────────────── Integrations & Import ─────────────────────── */

function FileRow({
  icon,
  label,
  accept,
  onFile,
}: {
  icon: ReactNode;
  label: string;
  accept: string;
  onFile: (file: File) => void;
}) {
  return (
    <label className="w-full min-h-[50px] flex items-center pl-4 pr-[18px] gap-3 cursor-pointer hover:bg-tt-hover">
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-[17px] text-tt-text">{label}</span>
      <input
        type="file"
        accept={accept}
        className="sr-only"
        aria-label={label}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </label>
  );
}

function IntegrationsPage({
  syncStatus,
  setStatus,
  go,
}: SettingsPageProps & { setStatus: (s: Status) => void; go: (p: SettingsPageId) => void }) {
  const run = (fn: () => Promise<string>, failPrefix: string) =>
    void fn()
      .then((message) => setStatus({ type: 'success', message }))
      .catch((err: unknown) =>
        setStatus({ type: 'error', message: `${failPrefix}: ${err instanceof Error ? err.message : String(err)}` })
      );
  return (
    <>
      <SectionLabel>Sync</SectionLabel>
      <Card>
        <NavRow
          icon={<DriveIcon />}
          label="Google Drive sync"
          value={syncStatus.lastSyncedAt ? (syncStatus.autoSyncEnabled ? 'On' : 'Manual') : 'Off'}
          onClick={() => go('account')}
        />
      </Card>
      <SectionLabel>Import</SectionLabel>
      <Card>
        <FileRow
          icon={<CsvIcon />}
          label="Import TickTick / CSV"
          accept=".csv,text/csv"
          onFile={(f) => run(() => readFileText(f).then(importCsv), 'CSV import failed')}
        />
        <FileRow
          icon={<ImportIcon />}
          label="Restore JSON backup"
          accept=".json,application/json"
          onFile={(f) => run(() => readFileText(f).then(importJsonBackup), 'Import failed')}
        />
      </Card>
      <Note>
        One-shot import from a TickTick CSV export, or a simple CSV with title, list, due, priority, tags, notes, status.
        JSON restores merge with existing tasks.
      </Note>
      <SectionLabel>Export</SectionLabel>
      <Card>
        <NavRow icon={<ExportIcon />} label="Export JSON backup" chevron={false} onClick={() => run(exportJsonBackup, 'Export failed')} />
      </Card>
    </>
  );
}
