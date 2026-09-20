import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { api } from "../api/client";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  /** Resolves to `{ done: true }` once actually logged in, or
   * `{ done: false, pendingToken }` when the account has 2FA enabled and
   * a TOTP/backup code is still needed — see LoginPage.tsx, which shows
   * a second step in that case rather than treating it as a failure. */
  login: (email: string, password: string) => Promise<{ done: true } | { done: false; pendingToken: string }>;
  loginVerifyTotp: (pendingToken: string, code: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem("user");
    return raw ? (JSON.parse(raw) as AuthUser) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(loadStoredUser);

  const persist = (token: string, u: AuthUser) => {
    try {
      localStorage.setItem("token", token);
      localStorage.setItem("user", JSON.stringify(u));
    } catch {
      // localStorage can throw in private browsing — auth still works for this tab.
    }
    setUser(u);
  };

  const clearLocal = () => {
    try {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
    } catch {
      /* ignore */
    }
    setUser(null);
  };

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const res = await api.login(email, password);
        if ("requiresTotp" in res) return { done: false, pendingToken: res.pendingToken };
        persist(res.token, res.user);
        return { done: true };
      },
      loginVerifyTotp: async (pendingToken, code) => {
        const res = await api.loginVerifyTotp(pendingToken, code);
        persist(res.token, res.user);
      },
      register: async (email, password) => {
        const res = await api.register(email, password);
        persist(res.token, res.user);
      },
      logout: () => {
        // Best-effort — revokes the session server-side so a token that
        // leaked before logout stops working immediately rather than
        // staying valid until it expires. The local state clears either
        // way even if this request fails (e.g. already offline).
        api.logout().catch(() => undefined);
        clearLocal();
      },
    }),
    [user]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
