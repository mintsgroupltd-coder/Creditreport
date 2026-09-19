import { FormEvent, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await api.resetPassword(token, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6">
        <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-8 text-center">
          <p className="text-sm text-critical">This reset link is missing its token.</p>
          <Link to="/forgot-password" className="mt-4 inline-block text-sm text-accent hover:underline">
            Request a new link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-border bg-panel p-8">
        <h1 className="text-lg font-semibold text-slate-100">Set a new password</h1>

        {done ? (
          <p className="mt-4 text-sm text-good">Password updated — taking you to log in…</p>
        ) : (
          <>
            <label htmlFor="reset-password" className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              New password
            </label>
            <input
              id="reset-password"
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
            />
            <label htmlFor="reset-confirm" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Confirm new password
            </label>
            <input
              id="reset-confirm"
              type="password"
              required
              minLength={8}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
            />
            {error && <p className="mt-4 text-sm text-critical">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {loading ? "Updating…" : "Update password"}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
