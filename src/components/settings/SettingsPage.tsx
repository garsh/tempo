import { useState, type ReactNode } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Key,
  Keyboard,
  LogOut,
  RefreshCw,
  Sparkles,
  Trash2,
} from 'lucide-react';
import type { Task } from '../../types/task';
import {
  clearAllData,
  clearSampleTasks,
  db,
  isSampleId,
  loadSampleTasks,
  repairAndDeduplicateDatabase,
} from '../../db/db';
import {
  clearStoredToken,
  getDefaultClientId,
  getCustomClientId,
  getStoredClientId,
  isValidGoogleClientId,
  setStoredClientId,
  signOutGoogleSession,
} from '../../sync/googleAuth';
import {
  isAutoSyncEnabled,
  runDriveSync,
  setAutoSyncEnabled,
  type SyncStatusSnapshot,
} from '../../sync/autoSync';
import { setGoogleAccount } from '../../sync/googleAccount';
import { BUILD_ID, buildDiagnosticsSummary } from '../../domain/diagnostics';
import { usePrefs } from '../../prefs/prefs';
import { ConfirmDialog, Switch } from '../ui/Sheet';
import { summarizeAccount } from '../../sync/accountSummary';
import { MAX_SYNC_BYTES } from '../../domain/syncPayload';
import { exportJsonBackup, importCsv, importJsonBackup, readFileText } from './dataTransfer';
import { Avatar, Card, ControlRow, NavRow, Note, RadioRow, SectionLabel, SettingsHeader } from './settingsUi';
import {
  AppearanceIcon,
  CsvIcon,
  DateTimeIcon,
  DriveIcon,
  ExportIcon,
  GeneralIcon,
  GoogleGIcon,
  HelpIcon,
  ImportIcon,
  IntegrationsIcon,
} from './settingsIcons';

export type SettingsPageId =
  | 'root'
  | 'account'
  | 'appearance'
  | 'datetime'
  | 'general'
  | 'integrations';

export const FEEDBACK_URL = 'https://github.com/garsh/tempo/issues';

const TITLES: Record<SettingsPageId, string> = {
  root: 'Settings',
  account: 'Account & Sync',
  appearance: 'Appearance',
  datetime: 'Date & Time',
  general: 'General',
  integrations: 'Integrations & Import',
};

interface SettingsPageProps {
  isOpen: boolean;
  initialPage?: SettingsPageId;
  onClose: () => void;
  tasks: Task[];
  syncStatus: SyncStatusSnapshot;
  onSyncStatusChange: () => void;
  onShowShortcuts: () => void;
  diagnosticsContext?: Record<string, unknown>;
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

  useEscapeKey(
    isOpen,
    () => {
      if (page === 'root' || page === initialPage) onClose();
      else setPage('root');
    },
    { capture: true, stopPropagation: true }
  );

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
    case 'appearance':
      body = <AppearancePage />;
      break;
    case 'datetime':
      body = <DateTimePage />;
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
        <NavRow icon={<AppearanceIcon />} label="Appearance" onClick={() => go('appearance')} />
        <NavRow icon={<DateTimeIcon />} label="Date & Time" onClick={() => go('datetime')} />
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
  const [customClientId, setCustomClientId] = useState(() => getCustomClientId());
  const [isSyncing, setIsSyncing] = useState(false);
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const activeClientId = getStoredClientId();
  const defaultClientId = getDefaultClientId();
  const hasCustomClientId = Boolean(getCustomClientId());
  const hasActiveClientId = Boolean(activeClientId);
  const isSignedIn = Boolean(syncStatus.account);
  const activeSyncStatus: SyncStatusSnapshot = {
    ...syncStatus,
    phase: isSyncing ? 'syncing' : syncStatus.phase,
  };
  const summary = summarizeAccount(syncStatus.account, activeSyncStatus, hasActiveClientId);
  const lastSynced = syncStatus.lastSyncedAt ? new Date(syncStatus.lastSyncedAt).toLocaleString() : 'Never';

  const handleSaveCustomClientId = () => {
    const trimmed = customClientId.trim();
    if (trimmed && !isValidGoogleClientId(trimmed)) {
      setStatus({
        type: 'error',
        message:
          'Enter a Google Web client ID ending in .apps.googleusercontent.com. The previous ID was kept.',
      });
      return;
    }
    if (!setStoredClientId(trimmed)) {
      setStatus({ type: 'error', message: 'Could not save that Client ID. The previous ID was kept.' });
      return;
    }
    setStatus({
      type: 'success',
      message: trimmed
        ? 'Custom Client ID saved locally.'
        : defaultClientId
        ? 'Custom Client ID cleared. Restored application default Client ID.'
        : 'Custom Client ID removed.',
    });
    onSyncStatusChange();
  };

  const handleClearCustomClientId = () => {
    setStoredClientId('');
    setCustomClientId('');
    setStatus({
      type: 'success',
      message: defaultClientId
        ? 'Cleared custom Client ID. Using application default Client ID.'
        : 'Custom Client ID cleared.',
    });
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
    const targetClientId = getStoredClientId();
    if (!targetClientId) {
      setStatus({
        type: 'error',
        message: 'Google Sign-In is not configured yet. Configure VITE_GOOGLE_CLIENT_ID or provide a custom Client ID in Advanced Settings below.',
      });
      return;
    }
    setIsSyncing(true);
    setStatus(null);
    try {
      if (!syncStatus.account) {
        clearStoredToken();
      }
      const result = await runDriveSync({ allowInteractive: true, force: true });
      setIsSyncing(false);
      onSyncStatusChange();
      if (result?.success) {
        setStatus({
          type: 'success',
          message: `Synced ${result.tasksCount} tasks, ${result.listsCount} lists, ${result.foldersCount} folders!`,
        });
      }
    } catch (err: unknown) {
      setIsSyncing(false);
      onSyncStatusChange();
      setStatus({ type: 'error', message: `Sync failed: ${err instanceof Error ? err.message : String(err)}` });
    }
  };

  const handleSignOut = () => {
    void signOutGoogleSession();
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
        {hasCustomClientId && (
          <div className="mt-1 text-[12px] text-tt-icon-amber">Using a custom OAuth client on this device.</div>
        )}
      </div>

      {!hasActiveClientId && (
        <Card className="p-4 space-y-2 border border-amber-500/30 bg-amber-500/5 mb-3">
          <div className="flex items-start gap-2.5">
            <Key className="w-4 h-4 text-tt-icon-amber shrink-0 mt-0.5" />
            <div className="text-[13px] text-tt-text font-medium">Google Sign-In Setup Required</div>
          </div>
          <p className="text-[12px] text-tt-secondary leading-relaxed">
            To let users sign in with their Gmail accounts, Tempo needs an OAuth Client ID configured for this app.
            Set <code className="text-tt-text px-1 py-0.5 bg-tt-input rounded">VITE_GOOGLE_CLIENT_ID</code> in your environment, or expand <em>Advanced Settings</em> below to enter a Client ID.
          </p>
        </Card>
      )}

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
            className="w-full h-11 rounded-xl bg-tt-blue hover:bg-tt-blue-hover disabled:opacity-60 text-white font-semibold text-[15px] flex items-center justify-center gap-2.5 transition-colors"
          >
            {isSyncing ? (
              <>
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>{isSignedIn ? 'Syncing with Google Drive…' : 'Connecting to Google…'}</span>
              </>
            ) : isSignedIn ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync with Google Drive Now</span>
              </>
            ) : (
              <>
                <div className="w-5 h-5 bg-white rounded-full flex items-center justify-center shadow-xs">
                  <GoogleGIcon className="w-3.5 h-3.5" />
                </div>
                <span>Sign in with Google</span>
              </>
            )}
          </button>
        </div>
      </Card>
      <Note>
        Syncs privately to your Google Drive AppData folder. Your tasks and routines stay on your device and your personal Google account.
      </Note>

      {(syncStatus.account || syncStatus.lastSyncedAt) && (
        <Card>
          <NavRow icon={<LogOut className="w-5 h-5 text-tt-overdue" />} label="Sign out on this device" onClick={handleSignOut} chevron={false} danger />
        </Card>
      )}

      <details className="mt-4 text-[13px] text-tt-secondary group">
        <summary className="cursor-pointer font-medium flex items-center justify-between p-2 rounded-lg hover:bg-tt-hover text-tt-secondary hover:text-tt-text transition-colors">
          <span className="flex items-center gap-1.5">
            <Key className="w-3.5 h-3.5" />
            Advanced: OAuth Client ID
          </span>
          <span className="text-[11px] font-normal uppercase tracking-wider text-tt-muted">
            {hasCustomClientId ? 'Custom' : defaultClientId ? 'App Default' : 'None'}
          </span>
        </summary>
        <Card className="mt-2 p-4 space-y-3">
          <p className="text-[12px] text-tt-secondary leading-relaxed">
            {defaultClientId
              ? 'This deployment has a built-in Google Client ID. You can optionally override it with your own Google Cloud Web Client ID.'
              : 'Enter a Google Cloud OAuth Client ID (Web Application) to connect Google Drive on this device.'}
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              value={customClientId}
              onChange={(e) => setCustomClientId(e.target.value)}
              placeholder={defaultClientId ? `App default (${defaultClientId.slice(0, 12)}…)` : 'xxxxxxxxxxxx-xxxx.apps.googleusercontent.com'}
              aria-label="Google OAuth Client ID"
              className="flex-1 min-w-0 px-3 py-2.5 bg-tt-input rounded-xl text-[13px] text-tt-text placeholder:text-tt-muted outline-none focus:ring-1 focus:ring-tt-blue"
            />
            <button
              type="button"
              onClick={handleSaveCustomClientId}
              className="px-4 rounded-xl bg-tt-input text-[14px] font-medium text-tt-text hover:bg-tt-hover shrink-0"
            >
              Save
            </button>
            {hasCustomClientId && (
              <button
                type="button"
                onClick={handleClearCustomClientId}
                className="px-3 rounded-xl bg-tt-input text-[13px] font-medium text-tt-overdue hover:bg-tt-hover shrink-0"
                title="Reset to application default"
              >
                Clear
              </button>
            )}
          </div>
          <div className="text-[12px] text-tt-muted">
            Active ID:{' '}
            <code className="text-tt-secondary font-mono select-all">
              {activeClientId ? `${activeClientId.slice(0, 14)}…${activeClientId.slice(-20)}` : 'None'}
            </code>
            {hasCustomClientId && <span className="ml-2 text-tt-icon-amber">(custom override)</span>}
          </div>
          <details className="text-[12px] text-tt-secondary">
            <summary className="cursor-pointer font-medium flex items-center gap-1 hover:text-tt-text">
              How do I get a Google Client ID? (Google Cloud setup)
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
                3. Under <strong>Credentials</strong>, create an <strong>OAuth Client ID</strong> for a <em>Web Application</em>.
              </p>
              <p>
                4. Add your app&apos;s origin URL (e.g. <code className="text-tt-text">https://tempo.bot.nu</code> or <code className="text-tt-text">http://localhost:5180</code>) to{' '}
                <strong>Authorized JavaScript Origins</strong> (Google requires a public TLD or <code className="text-tt-text">localhost</code>; private domains like <code className="text-tt-text">.lan</code> are not allowed).
              </p>
              <p>5. Set it in <code className="text-tt-text">.env</code> as <code className="text-tt-text">VITE_GOOGLE_CLIENT_ID</code> or paste it above.</p>
            </div>
          </details>
        </Card>
      </details>
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
    </>
  );
}

/* ───────────────────────────── General ───────────────────────────── */

function GeneralPage({
  tasks,
  onShowShortcuts,
  setStatus,
}: SettingsPageProps & { setStatus: (s: Status) => void }) {
  const hasSampleTasks = tasks.some((t) => isSampleId(t.id) && !t.deletedAt);

  return (
    <>
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
  disabled,
  onFile,
}: {
  icon: ReactNode;
  label: string;
  accept: string;
  disabled?: boolean;
  onFile: (file: File) => void;
}) {
  return (
    <label
      className={`w-full min-h-[50px] flex items-center pl-4 pr-[18px] gap-3 ${
        disabled ? 'opacity-50 pointer-events-none' : 'cursor-pointer hover:bg-tt-hover'
      }`}
    >
      <span className="w-5 h-5 shrink-0 flex items-center justify-center">{icon}</span>
      <span className="flex-1 text-[17px] text-tt-text">{label}</span>
      <input
        type="file"
        accept={accept}
        disabled={disabled}
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
  tasks,
  syncStatus,
  diagnosticsContext,
  setStatus,
  go,
}: SettingsPageProps & { setStatus: (s: Status) => void; go: (p: SettingsPageId) => void }) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const diag = buildDiagnosticsSummary(tasks, [], diagnosticsContext);

  const run = async (label: string, fn: () => Promise<string>, failPrefix: string) => {
    if (busyLabel) return;
    setStatus(null);
    setBusyLabel(label);
    try {
      await new Promise((r) => setTimeout(r, 16));
      const message = await fn();
      setStatus({ type: 'success', message });
    } catch (err: unknown) {
      setStatus({
        type: 'error',
        message: `${failPrefix}: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyLabel(null);
    }
  };

  const handleCopyDiagnostics = async () => {
    const [idbTasks, idbLists, idbFolders] = await Promise.all([
      db.tasks.toArray().catch(() => []),
      db.lists.toArray().catch(() => []),
      db.folders.toArray().catch(() => []),
    ]);
    const reportTasks = idbTasks.length > 0 && tasks.length === 0 ? idbTasks : tasks;
    const report = buildDiagnosticsSummary(reportTasks, idbLists, {
      ...diagnosticsContext,
      origin: typeof window !== 'undefined' ? window.location.origin : '',
      liveQueryTaskCount: tasks.length,
      idbTaskCount: idbTasks.length,
      idbLists: idbLists.map((l) => ({
        id: l.id,
        name: l.name,
        deletedAt: l.deletedAt ?? null,
      })),
      idbFolderCount: idbFolders.length,
      sync: {
        hasClientId: Boolean(getStoredClientId()),
        autoSyncEnabled: syncStatus.autoSyncEnabled,
        lastSyncedAt: syncStatus.lastSyncedAt,
        lastError: syncStatus.lastError,
      },
    });
    const json = JSON.stringify(report, null, 2);
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(json);
        setStatus({ type: 'success', message: 'Copied diagnostics JSON to clipboard.' });
        return;
      }
    } catch {
      /* fallback below when clipboard permission is unavailable */
    }
    setStatus({
      type: 'error',
      message: `Clipboard unavailable. Build ${report.buildId}: ${report.counts.openTasks} open, ${report.counts.recurringTasks} recurring, ${report.counts.completedTasks} completed, ${report.counts.tombstonedTasks} tombstones, ${report.counts.duplicateOpenExtraCount} duplicate open.`,
    });
  };

  return (
    <>
      {busyLabel && (
        <div
          role="status"
          className="mx-4 mb-4 p-3 rounded-xl flex items-center gap-2.5 text-[13px] bg-tt-blue/10 text-tt-blue"
        >
          <RefreshCw className="w-4 h-4 shrink-0 animate-spin" />
          <span className="flex-1">{busyLabel}</span>
        </div>
      )}
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
          disabled={!!busyLabel}
          onFile={(f) =>
            void run('Importing TickTick / CSV…', () => readFileText(f).then(importCsv), 'CSV import failed')
          }
        />
        <FileRow
          icon={<ImportIcon />}
          label="Restore JSON backup"
          accept=".json,application/json"
          disabled={!!busyLabel}
          onFile={(f) => {
            if (f.size > MAX_SYNC_BYTES) {
              setStatus({ type: 'error', message: 'Import failed: Backup is too large.' });
              return;
            }
            void run('Restoring JSON backup…', () => readFileText(f).then(importJsonBackup), 'Import failed');
          }}
        />
        <NavRow
          icon={<Trash2 className="w-[18px] h-[18px] text-tt-overdue" strokeWidth={1.8} />}
          label={<span className="text-tt-overdue">Clear all current data</span>}
          chevron={false}
          onClick={() => !busyLabel && setConfirmClear(true)}
        />
      </Card>
      <Note>
        One-shot import from a TickTick CSV export, or a simple CSV with title, list, due, priority, tags, notes, status.
        JSON restores merge with existing tasks.
      </Note>
      <SectionLabel>Export</SectionLabel>
      <Card>
        <NavRow
          icon={<ExportIcon />}
          label="Export JSON backup"
          chevron={false}
          onClick={() => void run('Exporting JSON backup…', exportJsonBackup, 'Export failed')}
        />
      </Card>
      <SectionLabel>Diagnostics &amp; Repair</SectionLabel>
      <Card>
        <div className="px-4 py-3 text-[13px] text-tt-secondary space-y-1">
          <div className="font-medium text-tt-text">Build {BUILD_ID}</div>
          <div>
            {diag.counts.openTasks} open ({diag.counts.recurringTasks} recurring) · {diag.counts.completedTasks}{' '}
            completed · {diag.counts.tombstonedTasks} tombstones · {diag.counts.duplicateOpenExtraCount} duplicate open
          </div>
        </div>
        <NavRow
          icon={
            <RefreshCw
              className={`w-[18px] h-[18px] text-tt-blue ${busyLabel ? 'animate-spin' : ''}`}
              strokeWidth={1.8}
            />
          }
          label="Repair & Deduplicate Tasks"
          chevron={false}
          onClick={() =>
            void run(
              'Repairing & deduplicating tasks…',
              async () => {
                const r = await repairAndDeduplicateDatabase();
                return `Repaired database: deduplicated ${r.deduplicatedTasks} task(s), merged ${r.mergedLists} list(s), purged ${r.purgedTombstones} tombstone(s).`;
              },
              'Repair failed',
            )
          }
        />
        <NavRow
          icon={<Copy className="w-[18px] h-[18px] text-tt-secondary" strokeWidth={1.8} />}
          label="Copy Diagnostics Report"
          chevron={false}
          onClick={() => !busyLabel && void handleCopyDiagnostics()}
        />
      </Card>
      <ConfirmDialog
        open={confirmClear}
        title="Clear all current data?"
        message="This will remove all tasks, lists, and folders from Tempo (keeping Inbox). If Google Drive sync is enabled, this removal will also sync to Drive."
        confirmLabel="Clear all data"
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false);
          void run(
            'Clearing current data…',
            () =>
              clearAllData().then((n) =>
                n > 0 ? `Cleared ${n} task${n === 1 ? '' : 's'} and all custom lists.` : 'Cleared all current data.'
              ),
            'Clear failed',
          );
        }}
      />
    </>
  );
}
