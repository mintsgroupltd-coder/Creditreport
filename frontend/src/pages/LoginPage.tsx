import { FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ApiError } from "../api/client";
import { useAuth } from "../context/AuthContext";

export function LoginPage() {
  const { login, loginVerifyTotp } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Second step, only reached for a 2FA-enabled account — see
  // AuthContext.login's return shape.
  const [pendingToken, setPendingToken] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const result = await login(email, password);
      if (result.done) {
        navigate("/");
      } else {
        setPendingToken(result.pendingToken);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong logging in.");
    } finally {
      setLoading(false);
    }
  }

  async function handleVerifyTotp(e: FormEvent) {
    e.preventDefault();
    if (!pendingToken) return;
    setError(null);
    setVerifying(true);
    try {
      await loginVerifyTotp(pendingToken, code);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not verify that code.");
    } finally {
      setVerifying(false);
    }
  }

  if (pendingToken) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface px-6">
        <form onSubmit={handleVerifyTotp} className="w-full max-w-sm rounded-xl border border-border bg-panel p-8">
          <h1 className="text-lg font-semibold text-slate-100">Two-factor authentication</h1>
          <p className="mt-1 text-sm text-slate-400">Enter the 6-digit code from your authenticator app, or one of your backup codes.</p>

          <label htmlFor="login-totp-code" className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
            Code
          </label>
          <input
            id="login-totp-code"
            type="text"
            inputMode="numeric"
            autoFocus
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
            className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm tracking-widest text-slate-100 focus:border-accent focus:outline-none"
          />

          {error && <p className="mt-4 text-sm text-critical">{error}</p>}

          <button
            type="submit"
            disabled={verifying}
            className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
          >
            {verifying ? "Verifying…" : "Verify and log in"}
          </button>
          <button
            type="button"
            onClick={() => {
              setPendingToken(null);
              setCode("");
              setError(null);
            }}
            className="mt-3 w-full text-center text-xs text-slate-400 hover:text-accent"
          >
            Back to log in
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-6">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded-xl border border-border bg-panel p-8">
        <h1 className="text-lg font-semibold text-slate-100">Log in</h1>
        <p className="mt-1 text-sm text-slate-400">Access your uploaded credit reports.</p>

        <label htmlFor="login-email" className="mt-6 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Email
        </label>
        <input
          id="login-email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
        />

        <label htmlFor="login-password" className="mt-4 block text-xs font-medium uppercase tracking-wide text-slate-400">
          Password
        </label>
        <input
          id="login-password"
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-slate-100 focus:border-accent focus:outline-none"
        />

        {error && <p className="mt-4 text-sm text-critical">{error}</p>}

        <div className="mt-2 text-right">
          <Link to="/forgot-password" className="text-xs text-slate-400 hover:text-accent">
            Forgot your password?
          </Link>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="mt-4 w-full rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white hover:bg-accent/90 disabled:opacity-60"
        >
          {loading ? "Logging in…" : "Log in"}
        </button>

        <p className="mt-4 text-center text-sm text-slate-400">
          No account?{" "}
          <Link to="/signup" className="text-accent hover:underline">
            Sign up
          </Link>
        </p>
      </form>
    </div>
  );
}
