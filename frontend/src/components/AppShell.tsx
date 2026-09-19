import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-wide text-slate-100">
            Credit Report Analyzer
          </Link>
          {user && (
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{user.email}</span>
              <Link to="/settings" className="rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent">
                Settings
              </Link>
              <button
                onClick={() => {
                  logout();
                  navigate("/login");
                }}
                className="rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent"
              >
                Log out
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
