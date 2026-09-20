import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AuditLogEntryRow, SessionRow } from "../api/types";
import { useAuth } from "../context/AuthContext";

const AUDIT_ACTION_LABELS: Record<string, string> = {
  VIEW_REPORT: "Viewed a report",
  DOWNLOAD_PDF: "Downloaded a PDF",
  CREATE_SHARE_LINK: "Created a share link",
  SEND_DISPUTE_EMAIL: "Sent a dispute letter by email",
};

const RECHECK_OPTIONS: { label: string; months: number | null }[] = [
  { label: "Off", months: null },
  { label: "Every month", months: 1 },
  { label: "Every 3 months", months: 3 },
  { label: "Every 6 months", months: 6 },
  { label: "Every 12 months", months: 12 },
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString("en-GB");
}

/**
 * Two-factor authentication (TOTP), the "your devices" session list, and
 * the opt-in periodic recheck-reminder preference — grouped here as
 * "Security" rather than mixed into the identity form above, since
 * they're a different kind of setting (how the account is protected,
 * not what goes in a dispute letter).
 */
export function SecuritySettingsPanel() {
  const { logout } = useAuth();

  // 2FA state
  const [totpEnabled, setTotpEnabled] = useState<boolean | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [setupData, setSetupData] = useState<{ secret: string; otpauthUrl: string; qrCodeDataUrl: string } | null>(null);
  const [settingUp, setSettingUp] = useState(false);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [backupCodes, setBackupCodes] = useState<string[] | null>(null);
  const [savedBackupCodes, setSavedBackupCodes] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disabling, setDisabling] = useState(false);
  const [showDisableForm, setShowDisableForm] = useState(false);
  const [totpError, setTotpError] = useState<string | null>(null);

  // Sessions state
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [revokingOthers, setRevokingOthers] = useState(false);
  const [sessionsError, setSessionsError] = useState<string | null>(null);

  // Recheck reminder state
  const [recheckReminderMonths, setRecheckReminderMonths] = useState<number | null>(null);
  const [savingReminder, setSavingReminder] = useState(false);
  const [reminderSaved, setReminderSaved] = useState(false);

  // Audit log state
  const [auditEntries, setAuditEntries] = useState<AuditLogEntryRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [auditError, setAuditError] = useState<string | null>(null);

  function refreshSessions() {
    setLoadingSessions(true);
    api
      .listSessions()
      .then((res) => setSessions(res.sessions))
      .catch((err) => setSessionsError(err instanceof ApiError ? err.message : "Could not load your devices."))
      .finally(() => setLoadingSessions(false));
  }

  useEffect(() => {
    api
      .getProfile()
      .then((res) => {
        setTotpEnabled(res.totpEnabled);
        setRecheckReminderMonths(res.recheckReminderMonths);
      })
      .catch(() => undefined)
      .finally(() => setLoadingStatus(false));
    refreshSessions();
    api
      .getAuditLog()
      .then((res) => setAuditEntries(res.entries))
      .catch((err) => setAuditError(err instanceof ApiError ? err.message : "Could not load your account activity."))
      .finally(() => setLoadingAudit(false));
  }, []);

  async function handleStartSetup() {
    setTotpError(null);
    setSettingUp(true);
    try {
      const res = await api.setupTotp();
      setSetupData(res);
      setBackupCodes(null);
      setSavedBackupCodes(false);
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : "Could not start two-factor setup.");
    } finally {
      setSettingUp(false);
    }
  }

  async function handleConfirmSetup() {
    setTotpError(null);
    setConfirming(true);
    try {
      const res = await api.confirmTotp(confirmCode.trim());
      setBackupCodes(res.backupCodes);
      setTotpEnabled(true);
      setSetupData(null);
      setConfirmCode("");
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : "That code didn't match — check your authenticator app and try again.");
    } finally {
      setConfirming(false);
    }
  }

  async function handleDisable() {
    setTotpError(null);
    setDisabling(true);
    try {
      await api.disableTotp(disablePassword);
      setTotpEnabled(false);
      setShowDisableForm(false);
      setDisablePassword("");
    } catch (err) {
      setTotpError(err instanceof ApiError ? err.message : "Could not disable two-factor authentication.");
    } finally {
      setDisabling(false);
    }
  }

  async function handleRevokeSession(id: string) {
    setRevokingId(id);
    setSessionsError(null);
    try {
      await api.revokeSession(id);
      refreshSessions();
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not log out that device.");
    } finally {
      setRevokingId(null);
    }
  }

  async function handleRevokeOthers() {
    setRevokingOthers(true);
    setSessionsError(null);
    try {
      await api.revokeOtherSessions();
      refreshSessions();
    } catch (err) {
      setSessionsError(err instanceof ApiError ? err.message : "Could not log out other devices.");
    } finally {
      setRevokingOthers(false);
    }
  }

  async function handleSaveReminder(months: number | null) {
    setRecheckReminderMonths(months);
    setSavingReminder(true);
    setReminderSaved(false);
    try {
      await api.updateRecheckReminder(months);
      setReminderSaved(true);
      setTimeout(() => setReminderSaved(false), 2000);
    } catch {
      // Non-critical preference — fail quietly rather than blocking the page.
    } finally {
      setSavingReminder(false);
    }
  }

  return (
    <div className="mt-6 flex max-w-lg flex-col gap-6">
      {/* Two-factor authentication */}
      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-slate-100">Two-factor authentication</h2>
        <p className="mt-1 text-xs text-slate-400">
          Adds a second step to logging in — a 6-digit code from an authenticator app — so a leaked password alone isn't enough to access
          your account.
        </p>

        {loadingStatus ? (
          <p className="mt-3 text-xs text-slate-500">Loading…</p>
        ) : backupCodes ? (
          <div className="mt-3 rounded-md border border-warn/40 bg-warn/10 p-3">
            <p className="text-xs font-semibold text-warn">Save these backup codes now — they're shown only once</p>
            <p className="mt-1 text-xs text-slate-400">
              Use one if you lose access to your authenticator app. Each works once.
            </p>
            <div className="mt-2 grid grid-cols-2 gap-1 font-mono text-xs text-slate-200">
              {backupCodes.map((c) => (
                <span key={c} className="rounded bg-surface px-2 py-1">
                  {c}
                </span>
              ))}
            </div>
            <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
              <input type="checkbox" checked={savedBackupCodes} onChange={(e) => setSavedBackupCodes(e.target.checked)} />
              I've saved these somewhere safe
            </label>
            <button
              onClick={() => setBackupCodes(null)}
              disabled={!savedBackupCodes}
              className="mt-2 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
            >
              Done
            </button>
          </div>
        ) : totpEnabled ? (
          <div className="mt-3">
            <p className="text-xs text-good">Enabled — a code from your authenticator app is required to log in.</p>
            {!showDisableForm ? (
              <button
                onClick={() => setShowDisableForm(true)}
                className="mt-2 rounded-md border border-border px-3 py-1.5 text-xs text-slate-300 hover:border-critical hover:text-critical"
              >
                Disable two-factor authentication
              </button>
            ) : (
              <div className="mt-2 rounded-md border border-border bg-surface p-3">
                <label className="block text-xs text-slate-400">
                  Confirm your password to disable
                  <input
                    type="password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                    className="mt-1 w-full rounded-md border border-border bg-panel px-2 py-1 text-sm text-slate-100 focus:border-accent focus:outline-none"
                  />
                </label>
                <div className="mt-2 flex gap-2">
                  <button
                    onClick={handleDisable}
                    disabled={disabling || !disablePassword}
                    className="rounded-md bg-critical px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
                  >
                    {disabling ? "Disabling…" : "Disable"}
                  </button>
                  <button
                    onClick={() => {
                      setShowDisableForm(false);
                      setDisablePassword("");
                    }}
                    className="rounded-md border border-border px-3 py-1.5 text-xs text-slate-300"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : setupData ? (
          <div className="mt-3">
            <p className="text-xs text-slate-400">Scan this with your authenticator app (Google Authenticator, 1Password, Authy, …):</p>
            <img src={setupData.qrCodeDataUrl} alt="Two-factor setup QR code" className="mt-2 h-40 w-40 rounded-md bg-white p-2" />
            <p className="mt-2 text-xs text-slate-500">Or enter this key manually:</p>
            <code className="mt-1 block break-all rounded bg-surface px-2 py-1 text-xs text-slate-300">{setupData.secret}</code>
            <label className="mt-3 block text-xs text-slate-400">
              Enter the 6-digit code it shows
              <input
                type="text"
                inputMode="numeric"
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                placeholder="123456"
                className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm tracking-widest text-slate-100 focus:border-accent focus:outline-none"
              />
            </label>
            <div className="mt-2 flex gap-2">
              <button
                onClick={handleConfirmSetup}
                disabled={confirming || !confirmCode.trim()}
                className="rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40"
              >
                {confirming ? "Confirming…" : "Confirm and enable"}
              </button>
              <button onClick={() => setSetupData(null)} className="rounded-md border border-border px-3 py-1.5 text-xs text-slate-300">
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleStartSetup}
            disabled={settingUp}
            className="mt-3 rounded-md border border-border px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent hover:text-accent disabled:opacity-50"
          >
            {settingUp ? "Starting…" : "Enable two-factor authentication"}
          </button>
        )}
        {totpError && <p className="mt-2 text-xs text-critical">{totpError}</p>}
      </div>

      {/* Sessions / devices */}
      <div className="rounded-lg border border-border bg-panel p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Your devices</h2>
          {sessions.filter((s) => !s.revokedAt && !s.isCurrent).length > 0 && (
            <button
              onClick={handleRevokeOthers}
              disabled={revokingOthers}
              className="text-xs text-slate-400 hover:text-critical disabled:opacity-50"
            >
              {revokingOthers ? "Logging out…" : "Log out of all other devices"}
            </button>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-400">Every device currently or previously signed in to your account.</p>

        {loadingSessions ? (
          <p className="mt-3 text-xs text-slate-500">Loading…</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2">
            {sessions
              .filter((s) => !s.revokedAt)
              .map((s) => (
                <li key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-3 py-2">
                  <div>
                    <p className="text-xs text-slate-200">
                      {s.label ?? "Unknown device"} {s.isCurrent && <span className="ml-1 text-accent">· This device</span>}
                    </p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Last active {formatDate(s.lastSeenAt)}</p>
                  </div>
                  <button
                    onClick={() => handleRevokeSession(s.id)}
                    disabled={revokingId === s.id}
                    className="shrink-0 rounded-md border border-border px-2 py-1 text-xs text-slate-300 hover:border-critical hover:text-critical disabled:opacity-50"
                  >
                    {revokingId === s.id ? "…" : "Log out"}
                  </button>
                </li>
              ))}
          </ul>
        )}
        {sessionsError && <p className="mt-2 text-xs text-critical">{sessionsError}</p>}
      </div>

      {/* Recheck reminder */}
      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-slate-100">Recheck reminder</h2>
        <p className="mt-1 text-xs text-slate-400">
          An email nudging you to upload a fresh report — useful for tracking progress after a dispute, or just keeping an eye on things.
        </p>
        <select
          value={recheckReminderMonths ?? ""}
          onChange={(e) => handleSaveReminder(e.target.value === "" ? null : Number(e.target.value))}
          disabled={savingReminder}
          className="mt-3 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-200 focus:border-accent focus:outline-none"
        >
          {RECHECK_OPTIONS.map((opt) => (
            <option key={opt.label} value={opt.months ?? ""}>
              {opt.label}
            </option>
          ))}
        </select>
        {reminderSaved && <p className="mt-2 text-xs text-good">Saved.</p>}
      </div>

      {/* Audit log */}
      <div className="rounded-lg border border-border bg-panel p-5">
        <h2 className="text-sm font-semibold text-slate-100">Account activity</h2>
        <p className="mt-1 text-xs text-slate-400">
          Sensitive actions on your account — report views and downloads, share links created, dispute letters sent by email. Most recent
          100, newest first.
        </p>
        {loadingAudit ? (
          <p className="mt-3 text-xs text-slate-500">Loading…</p>
        ) : auditEntries.length === 0 ? (
          <p className="mt-3 text-xs text-slate-500">Nothing logged yet.</p>
        ) : (
          <ul className="mt-3 flex max-h-64 flex-col gap-1.5 overflow-y-auto pr-1">
            {auditEntries.map((entry) => (
              <li key={entry.id} className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-1.5 text-xs">
                <span className="text-slate-300">
                  {AUDIT_ACTION_LABELS[entry.action] ?? entry.action}
                  {entry.detail && <span className="text-slate-500"> — {entry.detail}</span>}
                </span>
                <span className="shrink-0 text-slate-500">{formatDate(entry.createdAt)}</span>
              </li>
            ))}
          </ul>
        )}
        {auditError && <p className="mt-2 text-xs text-critical">{auditError}</p>}
      </div>

      <p className="text-[11px] text-slate-500">
        Signing out here only affects this browser's own session unless you use "Log out" above.{" "}
        <button onClick={logout} className="text-accent hover:underline">
          Log out of this device now
        </button>
      </p>
    </div>
  );
}
