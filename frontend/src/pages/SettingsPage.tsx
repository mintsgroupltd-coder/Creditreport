import { useEffect, useState } from "react";
import { api, ApiError } from "../api/client";
import { AppShell } from "../components/AppShell";

export function SettingsPage() {
  const [fullName, setFullName] = useState("");
  const [postalAddress, setPostalAddress] = useState("");
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [electoralRollRegistered, setElectoralRollRegistered] = useState<boolean | null>(null);
  const [identityConfirmed, setIdentityConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getProfile()
      .then((res) => {
        setFullName(res.fullName ?? "");
        setPostalAddress(res.postalAddress ?? "");
        setDateOfBirth(res.dateOfBirth ?? "");
        setElectoralRollRegistered(res.electoralRollRegistered);
        setIdentityConfirmed(res.identityConfirmed);
      })
      .catch((err) => setError(err instanceof ApiError ? err.message : "Could not load your profile."))
      .finally(() => setLoading(false));
  }, []);

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const res = await api.updateProfile(fullName.trim() || null, postalAddress.trim() || null, dateOfBirth || null, electoralRollRegistered);
      setIdentityConfirmed(res.identityConfirmed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not save your details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <h1 className="text-xl font-semibold text-slate-100">Your details</h1>
      <p className="mt-1 text-sm text-slate-400">
        Used to fill in the "[Your name]" / "[Your address]" placeholders in dispute letters, and — once your name, date of birth and
        address are all filled in — to check each report's own application details against what you say is true, not just for internal
        consistency. This is <span className="text-slate-300">self-declared by you</span>, never independently checked against any
        official register — the app doesn't have access to one.
      </p>

      {loading ? (
        <p className="mt-6 text-sm text-slate-400">Loading…</p>
      ) : (
        <div className="mt-6 max-w-lg rounded-lg border border-border bg-panel p-5">
          <div
            className={`mb-4 rounded-md border px-3 py-2 text-xs ${
              identityConfirmed ? "border-good/40 bg-good/10 text-good" : "border-border bg-surface text-slate-400"
            }`}
          >
            {identityConfirmed
              ? "Identity confirmed — your name, date of birth and address are all on file, so reports are checked against them."
              : "Not yet confirmed — fill in your name, date of birth and address below to enable the profile-vs-report check."}
          </div>

          <label htmlFor="settings-name" className="block text-xs font-medium uppercase tracking-wide text-slate-400">
            Full name
          </label>
          <input
            id="settings-name"
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="e.g. Jordan Smith"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <label htmlFor="settings-dob" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Date of birth
          </label>
          <input
            id="settings-dob"
            type="date"
            value={dateOfBirth}
            onChange={(e) => setDateOfBirth(e.target.value)}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          />

          <label htmlFor="settings-address" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Postal address
          </label>
          <textarea
            id="settings-address"
            value={postalAddress}
            onChange={(e) => setPostalAddress(e.target.value)}
            rows={4}
            placeholder={"12 Sample Street\nLeeds\nLS1 4AB"}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 placeholder:text-slate-600 focus:border-accent focus:outline-none"
          />

          <label htmlFor="settings-electoral-roll" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Registered to vote at this address?
          </label>
          <select
            id="settings-electoral-roll"
            value={electoralRollRegistered === null ? "" : electoralRollRegistered ? "yes" : "no"}
            onChange={(e) => setElectoralRollRegistered(e.target.value === "" ? null : e.target.value === "yes")}
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
          >
            <option value="">Prefer not to say</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <p className="mt-1 text-xs text-slate-500">
            Self-declared — we don't check this against the actual electoral roll. Credit reference agencies often weigh electoral roll
            registration when resolving an identity/address dispute, so a "Yes" here adds a supporting line to identity-type letters.
          </p>

          {error && <p className="mt-3 text-sm text-critical">{error}</p>}

          <div className="mt-4 flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save"}
            </button>
            {saved && <span className="text-xs text-good">Saved.</span>}
          </div>
        </div>
      )}
    </AppShell>
  );
}
