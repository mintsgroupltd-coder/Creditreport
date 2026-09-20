import { ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV_LINKS: { to: string; label: string }[] = [
  { to: "/remediate/1", label: "Remediate" },
  { to: "/reconciliation", label: "Reconciliation" },
  { to: "/registry", label: "Registry" },
  { to: "/equifax-gateway", label: "Equifax simulation" },
  { to: "/enhancement-suite", label: "Enhancement suite" },
  { to: "/api-docs", label: "API docs" },
  { to: "/settings", label: "Settings" },
];

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-surface">
      <header className="border-b border-border print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Link to="/" className="text-sm font-semibold tracking-wide text-slate-100">
            Credit Report Analyzer
          </Link>
          {user && (
            <div className="flex items-center gap-4 text-sm text-slate-400">
              <span>{user.email}</span>
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
        {user && (
          <div className="mx-auto max-w-5xl overflow-x-auto px-6 pb-3">
            <nav className="flex items-center gap-2 text-sm text-slate-400">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  className="whitespace-nowrap rounded-md border border-border px-3 py-1.5 text-slate-300 hover:border-accent hover:text-accent"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </div>
        )}
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
