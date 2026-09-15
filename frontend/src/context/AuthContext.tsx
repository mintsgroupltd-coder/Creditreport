import { createContext, ReactNode, useContext, useMemo, useState } from "react";
import { api } from "../api/client";

interface AuthUser {
  id: string;
  email: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  login: (email: string, password: string) => Promise<void>;
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

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      login: async (email, password) => {
        const res = await api.login(email, password);
        persist(res.token, res.user);
      },
      register: async (email, password) => {
        const res = await api.register(email, password);
        persist(res.token, res.user);
      },
      logout: () => {
        try {
          localStorage.removeItem("token");
          localStorage.removeItem("user");
        } catch {
          /* ignore */
        }
        setUser(null);
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
