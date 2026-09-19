import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { api, ApiError } from "../api/client";

export function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.forgotPassword(email);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong — please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <div className="w-full max-w-sm rounded-xl border border-border bg-panel p-8">
        <h1 className="text-lg font-semibold text-slate-100">Reset your password</h1>
        {submitted ? (
          <p className="mt-4 text-sm text-slate-300">
            If an account exists for that email, we've sent a link to reset your password. It's valid for 1 hour.
          </p>
        ) : (
          <form onSubmit={handleSubmit}>
            <p className="mt-1 text-sm text-slate-400">Enter your email and we'll send you a reset link.</p>
            <label htmlFor="forgot-email" className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
            />
            {error && <p className="mt-4 text-sm text-critical">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="mt-6 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
            >
              {loading ? "Sending…" : "Send reset link"}
            </button>
          </form>
        )}
        <p className="mt-4 text-center text-sm text-slate-400">
          <Link to="/login" className="text-accent hover:underline">
            Back to log in
          </Link>
        </p>
      </div>
    </div>
  );
}
