import { ChevronDown, LogOut, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { ReactNode, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const MORE_LINKS: { to: string; label: string; description: string }[] = [
  { to: "/reconciliation", label: "Reconciliation", description: "Compare accounts across bureaus" },
  { to: "/registry", label: "Statutory registry", description: "Who to contact, and under what law" },
  { to: "/equifax-gateway", label: "Equifax simulation", description: "A clearly-labelled API demo" },
  { to: "/enhancement-suite", label: "Enhancement suite", description: "Payoff, affordability & more" },
  { to: "/api-docs", label: "API docs", description: "For developers" },
];

/** Closes a floating panel (a dropdown menu) on an outside click or Escape,
 * so both of AppShell's menus behave consistently without duplicating this
 * logic twice. */
function useDismiss(onDismiss: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function handlePointer(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onDismiss();
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onDismiss();
    }
    document.addEventListener("mousedown", handlePointer);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handlePointer);
      document.removeEventListener("keydown", handleKey);
    };
  }, [onDismiss]);
  return ref;
}

export function AppShell({ children }: { children: ReactNode }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const moreRef = useDismiss(() => setMoreOpen(false));
  const userRef = useDismiss(() => setUserMenuOpen(false));

  const onGuidedFlow = location.pathname.startsWith("/remediate");

  return (
    <div className="min-h-screen bg-surface">
      <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-slate-100">
            <ShieldCheck className="h-5 w-5 text-accent" aria-hidden="true" />
            <span className="hidden sm:inline">Credit Report Analyzer</span>
          </Link>

          {user && (
            <nav className="flex flex-1 items-center gap-2">
              <Link
                to="/remediate/1"
                className={`flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium ${
                  onGuidedFlow
                    ? "border-accent bg-accent/15 text-accent"
                    : "border-accent/40 text-accent hover:border-accent hover:bg-accent/10"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
                Guided flow
              </Link>

              <div className="relative" ref={moreRef}>
                <button
                  onClick={() => setMoreOpen((v) => !v)}
                  aria-expanded={moreOpen}
                  className="flex items-center gap-1 rounded-full border border-border px-3.5 py-1.5 text-sm text-slate-300 hover:border-accent hover:text-accent"
                >
                  More
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
                {moreOpen && (
                  <div className="absolute left-0 top-[calc(100%+8px)] w-64 rounded-lg border border-border bg-panel p-1.5">
                    {MORE_LINKS.map((link) => (
                      <Link
                        key={link.to}
                        to={link.to}
                        onClick={() => setMoreOpen(false)}
                        className="block rounded-md px-3 py-2 hover:bg-surface"
                      >
                        <div className="text-sm font-medium text-slate-100">{link.label}</div>
                        <div className="text-xs text-slate-500">{link.description}</div>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </nav>
          )}

          {user && (
            <div className="relative" ref={userRef}>
              <button
                onClick={() => setUserMenuOpen((v) => !v)}
                aria-expanded={userMenuOpen}
                className="flex items-center gap-2 rounded-full border border-border py-1 pl-1 pr-2.5 text-sm text-slate-300 hover:border-accent"
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent/20 text-xs font-semibold text-accent">
                  {user.email.charAt(0).toUpperCase()}
                </span>
                <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
              {userMenuOpen && (
                <div className="absolute right-0 top-[calc(100%+8px)] w-56 rounded-lg border border-border bg-panel p-1.5">
                  <div className="truncate px-3 py-2 text-xs text-slate-500">{user.email}</div>
                  <Link
                    to="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-slate-200 hover:bg-surface"
                  >
                    <Settings className="h-4 w-4" aria-hidden="true" />
                    Settings
                  </Link>
                  <button
                    onClick={() => {
                      logout();
                      navigate("/login");
                    }}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-slate-200 hover:bg-surface hover:text-critical"
                  >
                    <LogOut className="h-4 w-4" aria-hidden="true" />
                    Log out
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-6 py-8">{children}</main>
    </div>
  );
}
