import { useMemo, useState, type ReactNode } from 'react';
import { useEscapeKey } from '../../hooks/useEscapeKey';
import { useLayoutMode } from '../../hooks/useLayoutMode';
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
  X,
} from 'lucide-react';
import type { Task } from '../../types/task';
import {
  clearAllData,
  clearSampleTasks,
  cleanupImportedAndTombstones,
  db,
  findImportedCompletedTaskIds,
  getClearAllDataPreview,
  getStorageCleanupPreview,
  isSampleId,
  loadSampleTasks,
  repairAndDeduplicateDatabase,
  type ClearAllDataPreview,
  type StorageCleanupPreview,
} from '../../db/db';
import {
  clearStoredToken,
  getDefaultClientId,
  getCustomClientId,
  getStoredClientId,
  isPopupBlockedError,
  isValidGoogleClientId,
  setStoredClientId,
  signOutGoogleSession,
} from '../../sync/googleAuth';
import {
  clearSyncAuthPrompt,
  clearSyncError,
  formatSyncErrorMessage,
  isAutoSyncEnabled,
  runDriveSync,
  setAutoSyncEnabled,
  type SyncStatusSnapshot,
} from '../../sync/autoSync';
import { setGoogleAccount } from '../../sync/googleAccount';
import { clearSyncWatermarkState } from '../../sync/syncWatermark';
import { BUILD_ID, buildDiagnosticsSummary } from '../../domain/diagnostics';
import {
  usePrefs,
  type Hemisphere,
  type NewTaskPosition,
  type ThemePref,
  type TimeFormat,
  type WeekStart,
} from '../../prefs/prefs';
import { ConfirmDialog, Switch } from '../ui/Sheet';
import { summarizeAccount } from '../../sync/accountSummary';
import { formatByteSize, MAX_SYNC_BYTES } from '../../domain/syncPayload';
import {
  exportJsonBackup,
  importJsonBackup,
  previewJsonBackup,
  readFileText,
  type JsonImportPreview,
} from './dataTransfer';
import { Avatar, Card, ControlRow, NavRow, Note, SectionLabel, SelectRow, SettingsHeader } from './settingsUi';
import {
  AccountIcon,
  DriveIcon,
  ExportIcon,
  GeneralIcon,
  GoogleGIcon,
  ImportIcon,
  IntegrationsIcon,
} from './settingsIcons';

export type SettingsPageId = 'root' | 'account' | 'general' | 'data';

const TITLES: Record<SettingsPageId, string> = {
  root: 'Settings',
  account: 'Account',
  general: 'General',
  data: 'Backup & Diagnostics',
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
  const layout = useLayoutMode();
  const isTwoPane = layout.isSplit;
  const [page, setPage] = useState<SettingsPageId>(initialPage);
  const [status, setStatus] = useState<Status>(null);

  useEscapeKey(
    isOpen,
    () => {
      if (isTwoPane || page === 'root' || page === initialPage) onClose();
      else setPage('root');
    },
    { capture: true, stopPropagation: true }
  );

  if (!isOpen) return null;

  const activePage: SettingsPageId = isTwoPane && page === 'root' ? 'general' : page;

  const go = (p: SettingsPageId) => {
    setStatus(null);
    setPage(p);
  };
  const back = () => (page === 'root' || page === initialPage ? onClose() : go('root'));

  let body: ReactNode;
  switch (activePage) {
    case 'root':
      body = <RootPage {...props} go={go} />;
      break;
    case 'account':
      body = <AccountPage {...props} setStatus={setStatus} suppressLastErrorBanner={status?.type === 'error'} />;
      break;
    case 'general':
      body = <GeneralPage {...props} />;
      break;
    case 'data':
      body = <DataDiagnosticsPage {...props} setStatus={setStatus} />;
      break;
  }

  const statusBanner = status && (
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
  );

  if (isTwoPane) {
    const navItems: ReadonlyArray<{ id: Exclude<SettingsPageId, 'root'>; icon: ReactNode; label: string }> = [
      { id: 'general', icon: <GeneralIcon />, label: 'General' },
      { id: 'account', icon: <AccountIcon />, label: 'Account' },
      { id: 'data', icon: <IntegrationsIcon />, label: 'Backup & Diagnostics' },
    ];

    return (
      <div
        className="fixed inset-0 z-[55] bg-tt-scrim flex items-center justify-center p-4 compact-landscape:p-0"
        onClick={(e) => e.target === e.currentTarget && onClose()}
        data-testid="settings-page"
        data-settings-page={activePage}
        data-settings-layout="two-pane"
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label={TITLES[activePage]}
          className="w-full max-w-[820px] h-[min(680px,86dvh)] rounded-2xl shadow-2xl border border-tt-border bg-tt-bg flex flex-col overflow-hidden compact-landscape:max-w-none compact-landscape:h-full compact-landscape:rounded-none compact-landscape:border-0 tt-safe-x"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <header className="shrink-0 h-14 compact-landscape:h-12 px-5 border-b border-tt-border bg-tt-surface flex items-center justify-between">
            <h1 className="text-[19px] font-bold text-tt-text">Settings</h1>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close settings"
              className="w-9 h-9 flex items-center justify-center rounded-lg text-tt-secondary hover:text-tt-text hover:bg-tt-hover transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 min-h-0 flex overflow-hidden">
            <nav
              aria-label="Settings categories"
              className="w-[220px] compact-landscape:w-[190px] shrink-0 border-r border-tt-border bg-tt-sidebar overflow-y-auto p-2.5 space-y-1"
            >
              {navItems.map((item) => {
                const selected = activePage === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => go(item.id)}
                    aria-current={selected ? 'page' : undefined}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-[14px] text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-tt-blue-soft text-tt-blue font-semibold'
                        : 'text-tt-text hover:bg-tt-hover font-medium'
                    }`}
                  >
                    <span className="w-5 h-5 shrink-0 flex items-center justify-center">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>

            <div
              className="flex-1 min-w-0 overflow-y-auto tt-scroll-stable py-4 compact-landscape:py-2.5"
              style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}
            >
              <h2 className="px-4 pb-3 text-[18px] font-bold text-tt-text">{TITLES[activePage]}</h2>
              {statusBanner}
              {body}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-[55] bg-tt-bg flex flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      data-testid="settings-page"
      data-settings-page={activePage}
      data-settings-layout="drilldown"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[activePage]}
        className="h-full w-full bg-tt-bg flex flex-col overflow-hidden"
        style={{ paddingTop: 'env(safe-area-inset-top)' }}
      >
        <SettingsHeader title={TITLES[activePage]} onBack={back} backLabel={activePage === 'root' ? 'Close settings' : 'Back'} />
        <div className="flex-1 min-h-0 overflow-y-auto pb-6" style={{ paddingBottom: 'max(24px, env(safe-area-inset-bottom))' }}>
          {statusBanner}
          {body}
        </div>
      </div>
    </div>
  );
}

/* ───────────────────────────── Root ───────────────────────────── */

function RootPage({ onShowShortcuts, go }: SettingsPageProps & { go: (p: SettingsPageId) => void }) {
  return (
    <>
      <PreferencesSections />
      <Card>
        <NavRow icon={<AccountIcon />} label="Account" onClick={() => go('account')} />
        <NavRow icon={<IntegrationsIcon />} label="Backup & Diagnostics" onClick={() => go('data')} />
        <NavRow icon={<Keyboard className="w-5 h-5 text-tt-blue" />} label="Keyboard shortcuts" onClick={onShowShortcuts} />
      </Card>
    </>
  );
}

/* ───────────────────────────── Account ───────────────────────────── */

function AccountPage({
  syncStatus,
  onSyncStatusChange,
  setStatus,
  suppressLastErrorBanner = false,
}: SettingsPageProps & { setStatus: (s: Status) => void; suppressLastErrorBanner?: boolean }) {
  const [customClientId, setCustomClientId] = useState(() => getCustomClientId());
  const [isSyncing, setIsSyncing] = useState(false);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
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
          message: `Synced ${result.tasksCount} task${result.tasksCount === 1 ? '' : 's'}!`,
        });
      }
    } catch (err: unknown) {
      setIsSyncing(false);
      onSyncStatusChange();
      const message = formatSyncErrorMessage(err);
      setStatus({
        type: 'error',
        message: isPopupBlockedError(err) ? message : `Sync failed: ${message}`,
      });
    }
  };

  const handleSignOut = () => {
    void signOutGoogleSession();
    setGoogleAccount(null);
    clearSyncWatermarkState();
    clearSyncAuthPrompt();
    clearSyncError();
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

      {syncStatus.lastError && !isSyncing && !suppressLastErrorBanner && (
        <div
          role="alert"
          className="mx-4 mb-4 p-3 rounded-xl flex items-start gap-2.5 text-[13px] border border-tt-overdue/30 bg-tt-overdue/10 text-tt-overdue"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span className="flex-1 break-words">Last sync failed: {syncStatus.lastError}</span>
        </div>
      )}

      {syncStatus.authPrompt && !syncStatus.lastError && !isSyncing && !suppressLastErrorBanner && (
        <div
          role="status"
          className="mx-4 mb-4 p-3 rounded-xl flex items-start gap-2.5 text-[13px] border border-amber-500/30 bg-amber-500/10 text-tt-icon-amber"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-px" />
          <span className="flex-1 break-words">
            {syncStatus.authPrompt.reason === 'popup_blocked_interactive'
              ? 'Your browser blocked the Google sign-in popup. Allow popups for this site in your browser settings, then tap Sync Now below.'
              : syncStatus.authPrompt.reason === 'popup_blocked'
                ? 'Background sync is paused because your browser blocked the popup window. Tap Sync Now below to reconnect.'
                : 'Google Drive sign-in expired. Tap Sync Now below to reconnect.'}
          </span>
        </div>
      )}

      <Card>
        <ControlRow icon={<DriveIcon />} label="Last synced">
          <span className="text-[14px] text-tt-secondary">{lastSynced}</span>
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
                <span>{isSignedIn ? 'Syncing…' : 'Connecting to Google…'}</span>
              </>
            ) : isSignedIn ? (
              <>
                <RefreshCw className="w-4 h-4" />
                <span>Sync Now</span>
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
        Your tasks and routines sync privately with your personal Google account.
      </Note>

      {(syncStatus.account || syncStatus.lastSyncedAt) && (
        <Card>
          <NavRow icon={<LogOut className="w-5 h-5 text-tt-overdue" />} label="Sign out on this device" onClick={() => setConfirmSignOut(true)} chevron={false} danger />
        </Card>
      )}

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out on this device?"
        confirmLabel="Sign out"
        tone="danger"
        onCancel={() => setConfirmSignOut(false)}
        onConfirm={() => {
          setConfirmSignOut(false);
          handleSignOut();
        }}
        message={
          <>
            <p>
              <strong>Your tasks stay on this device:</strong> Signing out does not delete any tasks from this device
              or from Google Drive.
            </p>
            <p>
              <strong>Syncing stops on this device:</strong> Future changes you make here will remain local only and will
              not sync to Google Drive or your other devices (and updates from other devices will not appear here).
            </p>
            <p>
              <strong>Signing back in later:</strong> Reconnecting the same Google account will merge your local tasks
              back with Google Drive. If you sign into a different Google account later without clearing data first,
              tasks on this device will merge into that account.
            </p>
          </>
        }
      />

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

/* ─────────────────────────── Preferences ─────────────────────────── */

const THEME_OPTIONS: ReadonlyArray<{ value: ThemePref; label: string }> = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

const NEW_TASK_POSITION_OPTIONS: ReadonlyArray<{ value: NewTaskPosition; label: string }> = [
  { value: 'bottom', label: 'Bottom of list' },
  { value: 'top', label: 'Top of list' },
];

const WEEK_START_OPTIONS: ReadonlyArray<{ value: `${WeekStart}`; label: string }> = [
  { value: '0', label: 'Sunday' },
  { value: '1', label: 'Monday' },
  { value: '6', label: 'Saturday' },
];

const TIME_FORMAT_OPTIONS: ReadonlyArray<{ value: TimeFormat; label: string }> = [
  { value: '12h', label: '12-hour (5:30 PM)' },
  { value: '24h', label: '24-hour (17:30)' },
];

const HEMISPHERE_OPTIONS: ReadonlyArray<{ value: Hemisphere; label: string }> = [
  { value: 'north', label: 'Northern hemisphere' },
  { value: 'south', label: 'Southern hemisphere' },
];

function PreferencesSections() {
  const [prefs, update] = usePrefs();
  return (
    <>
      <SectionLabel>Preferences</SectionLabel>
      <Card className="divide-y divide-tt-border/50">
        <SelectRow
          label="Theme"
          sub="Overrides device light / dark mode"
          value={prefs.theme}
          options={THEME_OPTIONS}
          onChange={(theme) => update({ theme })}
        />
        <SelectRow
          label="New task placement"
          sub="Where newly added tasks appear"
          value={prefs.newTaskPosition}
          options={NEW_TASK_POSITION_OPTIONS}
          onChange={(newTaskPosition) => update({ newTaskPosition })}
        />
        <SelectRow
          label="Week starts on"
          value={String(prefs.weekStart) as `${WeekStart}`}
          options={WEEK_START_OPTIONS}
          onChange={(v) => update({ weekStart: Number(v) as WeekStart })}
        />
        <SelectRow
          label="Time format"
          value={prefs.timeFormat}
          options={TIME_FORMAT_OPTIONS}
          onChange={(timeFormat) => update({ timeFormat })}
        />
        <SelectRow
          label="Seasons"
          sub="Used for seasonal repeat presets"
          value={prefs.hemisphere}
          options={HEMISPHERE_OPTIONS}
          onChange={(hemisphere) => update({ hemisphere })}
        />
      </Card>
    </>
  );
}

function GeneralPage({ onShowShortcuts }: SettingsPageProps) {
  return (
    <>
      <PreferencesSections />
      <Card>
        <NavRow icon={<Keyboard className="w-5 h-5 text-tt-blue" />} label="Keyboard shortcuts" onClick={onShowShortcuts} />
      </Card>
    </>
  );
}

/* ────────────────────── Backup & Diagnostics ────────────────────── */

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

function DataDiagnosticsPage({
  tasks,
  syncStatus,
  onSyncStatusChange,
  diagnosticsContext,
  setStatus,
}: SettingsPageProps & { setStatus: (s: Status) => void }) {
  const [clearPreview, setClearPreview] = useState<ClearAllDataPreview | null>(null);
  const [cleanupPreview, setCleanupPreview] = useState<StorageCleanupPreview | null>(null);
  const [autoSync, setAutoSync] = useState(() => isAutoSyncEnabled());
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    fileSize: number;
    content: string;
    preview: JsonImportPreview;
  } | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const diag = buildDiagnosticsSummary(tasks, [], diagnosticsContext);
  const importedCompletedCount = useMemo(() => findImportedCompletedTaskIds(tasks).length, [tasks]);
  const hasSampleTasks = useMemo(() => tasks.some((t) => isSampleId(t.id) && !t.deletedAt), [tasks]);

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

  const handleSelectBackupFile = async (f: File) => {
    if (busyLabel) return;
    if (f.size > MAX_SYNC_BYTES) {
      setStatus({
        type: 'error',
        message: `Import failed: Backup is too large (${formatByteSize(f.size)}, max ${formatByteSize(MAX_SYNC_BYTES)}).`,
      });
      return;
    }
    setStatus(null);
    setBusyLabel('Reading JSON backup…');
    try {
      await new Promise((r) => setTimeout(r, 16));
      const content = await readFileText(f);
      const preview = await previewJsonBackup(content);
      setPendingImport({ fileName: f.name, fileSize: f.size, content, preview });
    } catch (err: unknown) {
      setStatus({
        type: 'error',
        message: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyLabel(null);
    }
  };

  const handleConfirmImport = () => {
    const target = pendingImport;
    if (!target) return;
    setPendingImport(null);
    void run('Restoring JSON backup…', () => importJsonBackup(target.content), 'Import failed');
  };

  const handleOpenClear = async () => {
    if (busyLabel) return;
    setStatus(null);
    setBusyLabel('Scanning current data…');
    try {
      const preview = await getClearAllDataPreview();
      setClearPreview(preview);
    } catch (err: unknown) {
      setStatus({
        type: 'error',
        message: `Could not inspect current data: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyLabel(null);
    }
  };

  const handleConfirmClear = () => {
    setClearPreview(null);
    void run(
      'Clearing current data…',
      () =>
        clearAllData().then((n) =>
          n > 0 ? `Cleared ${n} task${n === 1 ? '' : 's'}.` : 'Cleared all current data.'
        ),
      'Clear failed',
    );
  };

  const handleOpenCleanup = async () => {
    if (busyLabel) return;
    setStatus(null);
    setBusyLabel('Scanning storage…');
    try {
      const preview = await getStorageCleanupPreview();
      const totalToClean =
        preview.importedCompletedTasks +
        preview.tombstonedTasks +
        preview.tombstonedLists +
        preview.tombstonedFolders;
      if (totalToClean === 0) {
        setStatus({
          type: 'success',
          message: 'Storage is already clean — no deleted tombstones or imported completed tasks found.',
        });
        return;
      }
      setCleanupPreview(preview);
    } catch (err: unknown) {
      setStatus({
        type: 'error',
        message: `Storage scan failed: ${err instanceof Error ? err.message : String(err)}`,
      });
    } finally {
      setBusyLabel(null);
    }
  };

  const handleConfirmCleanup = () => {
    setCleanupPreview(null);
    void run(
      'Cleaning up storage…',
      async () => {
        const r = await cleanupImportedAndTombstones();
        const parts: string[] = [];
        if (r.removedImportedCompleted > 0) {
          parts.push(`${r.removedImportedCompleted.toLocaleString()} imported completed task(s)`);
        }
        if (r.purgedTasks > 0) parts.push(`${r.purgedTasks.toLocaleString()} deleted task(s)`);
        if (r.purgedLists > 0) parts.push(`${r.purgedLists.toLocaleString()} deleted list(s)`);
        if (r.purgedFolders > 0) parts.push(`${r.purgedFolders.toLocaleString()} deleted folder(s)`);
        const summary = parts.length > 0 ? parts.join(', ') : 'no stale records';

        if (!r.needsSync) {
          return `Cleaned up ${summary}.`;
        }

        try {
          const syncRes = await runDriveSync({ allowInteractive: true, force: true });
          onSyncStatusChange();
          if (syncRes?.success) {
            return `Cleaned up ${summary} and synced (${syncRes.tasksCount.toLocaleString()} task(s) remaining).`;
          }
          return `Staged cleanup of ${summary}. It will finish purging on your next Google Drive sync.`;
        } catch (syncErr: unknown) {
          onSyncStatusChange();
          const reason = formatSyncErrorMessage(syncErr);
          return `Staged cleanup of ${summary}; Drive sync failed (${reason}). Tombstones will finish purging on your next successful Drive sync.`;
        }
      },
      'Cleanup failed',
    );
  };

  const importDialogMessage = useMemo(() => {
    if (!pendingImport) return null;
    const { fileName, fileSize, preview } = pendingImport;
    const exportedText = preview.exportedAt ? new Date(preview.exportedAt).toLocaleString() : null;
    return (
      <>
        <p>
          File: <strong className="text-tt-text">{fileName}</strong> ({formatByteSize(fileSize)}
          {exportedText ? `, exported ${exportedText}` : ''}).
        </p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>In backup:</strong> {preview.incomingActiveTasks.toLocaleString()} active task(s) (
            {preview.incomingOpenTasks.toLocaleString()} open, {preview.incomingCompletedTasks.toLocaleString()}{' '}
            completed
            {preview.incomingRecurringTasks > 0
              ? `, ${preview.incomingRecurringTasks.toLocaleString()} recurring`
              : ''}
            ).
          </li>
          <li>
            <strong>Merge impact:</strong> {preview.newTasksToAdd.toLocaleString()} new task(s) added,{' '}
            {preview.existingTasksToUpdate.toLocaleString()} existing task(s) updated, and{' '}
            {preview.existingLocalTasksKept.toLocaleString()} local task(s) not in this file kept.
          </li>
          {preview.incomingTombstonedTasks > 0 && (
            <li>
              <strong>Deleted markers in file:</strong> {preview.incomingTombstonedTasks.toLocaleString()} deleted task
              tombstone(s)
              {preview.skippedPrunedTombstones > 0
                ? ` (${preview.skippedPrunedTombstones.toLocaleString()} already pruned and skipped; any remaining may delete older matching local tasks)`
                : ' (may delete older matching local tasks)'}
              .
            </li>
          )}
        </ul>
        <p>
          Tempo merges backups using newest-edit-wins and combines completion history rather than wiping unrelated
          tasks.
          {syncStatus.account
            ? ` Merged changes will also sync to Google Drive (${syncStatus.account.email}) on the next sync.`
            : ''}
        </p>
      </>
    );
  }, [pendingImport, syncStatus.account]);

  const clearDialogMessage = useMemo(() => {
    if (!clearPreview) return null;
    return (
      <>
        <p>This will clear the following active tasks from Tempo:</p>
        <ul className="list-disc pl-4 space-y-1">
          <li>
            <strong>{clearPreview.activeTasks.toLocaleString()}</strong> active task(s) (
            {clearPreview.openTasks.toLocaleString()} open, {clearPreview.completedTasks.toLocaleString()} completed)
          </li>
        </ul>
        <p>
          <strong>What happens locally:</strong> Every item is marked as deleted (soft-deleted tombstones) so it
          disappears from Tempo immediately. Export a JSON backup first if you might need this data back.
        </p>
        <p>
          <strong>Google Drive sync:</strong>{' '}
          {syncStatus.account
            ? `You are signed in as ${syncStatus.account.email}. This does not upload immediately, but on your next automatic or manual sync those deletions will sync to Google Drive and clear data on your other synced devices. Deleted markers stay stored for 30 days or until you run Clean Up Storage.`
            : 'Google Drive sync is currently signed out, so this only clears data on this device. (If you sign back into a previously synced Google account later without clearing browser storage, these deletions could still apply to older matching items in Drive.)'}
        </p>
      </>
    );
  }, [clearPreview, syncStatus.account]);

  const cleanupDialogMessage = useMemo(() => {
    if (!cleanupPreview) return null;
    const tombstoneParts: string[] = [];
    if (cleanupPreview.tombstonedTasks > 0) {
      tombstoneParts.push(`${cleanupPreview.tombstonedTasks.toLocaleString()} task(s)`);
    }
    if (cleanupPreview.tombstonedLists > 0) {
      tombstoneParts.push(`${cleanupPreview.tombstonedLists.toLocaleString()} list(s)`);
    }
    if (cleanupPreview.tombstonedFolders > 0) {
      tombstoneParts.push(`${cleanupPreview.tombstonedFolders.toLocaleString()} folder(s)`);
    }
    const totalTombstones =
      cleanupPreview.tombstonedTasks + cleanupPreview.tombstonedLists + cleanupPreview.tombstonedFolders;

    return (
      <>
        <p>This will permanently reclaim storage by removing:</p>
        <ul className="list-disc pl-4 space-y-1">
          {cleanupPreview.importedCompletedTasks > 0 && (
            <li>
              <strong>{cleanupPreview.importedCompletedTasks.toLocaleString()}</strong> bulk-imported historical
              completed task(s) (tasks created or completed directly in Tempo are kept)
            </li>
          )}
          {totalTombstones > 0 && (
            <li>
              <strong>{totalTombstones.toLocaleString()}</strong> deleted tombstone record(s) (
              {tombstoneParts.join(', ')}) — hidden deletion markers left behind after deleting or clearing items
            </li>
          )}
          <li>
            <strong>Kept:</strong> {cleanupPreview.activeRemainingTasks.toLocaleString()} active task(s)
          </li>
        </ul>
        <p>
          {syncStatus.account
            ? `Because Google Drive sync is connected (${syncStatus.account.email}), Tempo will stage these removals, immediately sync to purge them from Google Drive, and then permanently delete them from this device. Make sure Tempo is updated on your other synced devices before they sync next.`
            : 'These records will be permanently deleted from this device immediately and cannot be undone.'}
        </p>
      </>
    );
  }, [cleanupPreview, syncStatus.account]);

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
      <SectionLabel>JSON Backup</SectionLabel>
      <Card>
        <NavRow
          icon={<ExportIcon />}
          label="Export JSON backup"
          chevron={false}
          onClick={() => void run('Exporting JSON backup…', exportJsonBackup, 'Export failed')}
        />
        <FileRow
          icon={<ImportIcon />}
          label="Restore JSON backup"
          accept=".json,application/json"
          disabled={!!busyLabel}
          onFile={(f) => void handleSelectBackupFile(f)}
        />
      </Card>
      <Note>
        Exports your active tasks. Restoring a JSON backup merges with your current tasks after confirmation.
      </Note>
      <SectionLabel>Diagnostics &amp; Repair</SectionLabel>
      <Card>
        <div className="px-4 py-3 text-[13px] text-tt-secondary space-y-1">
          <div className="font-medium text-tt-text">Build {BUILD_ID}</div>
          <div>
            {diag.counts.openTasks} open ({diag.counts.recurringTasks} recurring) · {diag.counts.completedTasks}{' '}
            completed · {diag.counts.tombstonedTasks} tombstones · {diag.counts.duplicateOpenExtraCount} duplicate open
            {importedCompletedCount > 0 ? ` · ${importedCompletedCount.toLocaleString()} imported completed` : ''}
          </div>
        </div>
        <ControlRow label="Background sync" sub="Startup, every ~10 min and on return">
          <Switch checked={autoSync} onChange={handleToggleAutoSync} label="Background sync" />
        </ControlRow>
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
          icon={<Trash2 className="w-[18px] h-[18px] text-tt-overdue" strokeWidth={1.8} />}
          label={<span className="text-tt-overdue">Clean Up Storage</span>}
          chevron={false}
          onClick={() => void handleOpenCleanup()}
        />
        <div data-tempo-sample-tasks="1">
          <NavRow
            icon={<Sparkles className="w-5 h-5 text-tt-blue" />}
            label="Load sample tasks"
            chevron={false}
            onClick={() =>
              !busyLabel &&
              void run('Loading sample tasks…', () => loadSampleTasks().then((n) => `Loaded ${n} sample tasks.`), 'Load failed')
            }
          />
          <NavRow
            icon={<Trash2 className={`w-5 h-5 ${hasSampleTasks ? 'text-tt-overdue' : 'text-tt-muted'}`} />}
            label={<span className={hasSampleTasks ? '' : 'text-tt-muted'}>Clear sample tasks</span>}
            chevron={false}
            onClick={() =>
              !busyLabel &&
              void run(
                'Clearing sample tasks…',
                () =>
                  clearSampleTasks().then((n) =>
                    n ? `Removed ${n} sample tasks.` : 'No sample tasks to remove.'
                  ),
                'Clear failed',
              )
            }
          />
        </div>
        <NavRow
          icon={<Trash2 className="w-[18px] h-[18px] text-tt-overdue" strokeWidth={1.8} />}
          label={<span className="text-tt-overdue">Clear all current data</span>}
          chevron={false}
          onClick={() => void handleOpenClear()}
        />
        <NavRow
          icon={<Copy className="w-[18px] h-[18px] text-tt-secondary" strokeWidth={1.8} />}
          label="Copy Diagnostics Report"
          chevron={false}
          onClick={() => !busyLabel && void handleCopyDiagnostics()}
        />
      </Card>
      <Note>Sample tasks help you explore; clearing sample tasks removes only demo items.</Note>
      <ConfirmDialog
        open={pendingImport !== null}
        title="Restore JSON backup?"
        message={importDialogMessage}
        confirmLabel="Restore Backup"
        tone="primary"
        onCancel={() => setPendingImport(null)}
        onConfirm={handleConfirmImport}
      />
      <ConfirmDialog
        open={clearPreview !== null}
        title="Clear all current data?"
        message={clearDialogMessage}
        confirmLabel="Clear all data"
        tone="danger"
        onCancel={() => setClearPreview(null)}
        onConfirm={handleConfirmClear}
      />
      <ConfirmDialog
        open={cleanupPreview !== null}
        title="Clean up storage?"
        message={cleanupDialogMessage}
        confirmLabel="Clean Up Storage"
        tone="danger"
        onCancel={() => setCleanupPreview(null)}
        onConfirm={handleConfirmCleanup}
      />
    </>
  );
}
