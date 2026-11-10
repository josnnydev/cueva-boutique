import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from "react";
import { api, ApiError } from "./api";
import type { AdminUser } from "./types";

type AuthContextValue = {
  user: AdminUser | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    extras?: { website?: string; turnstileToken?: string }
  ) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    api<{ user: AdminUser }>("/auth/me")
      .then((response) => {
        if (active) setUser(response.user);
      })
      .catch(() => {
        if (active) setUser(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener("cueva:unauthorized", handler);
    return () => window.removeEventListener("cueva:unauthorized", handler);
  }, []);

  const login = useCallback(
    async (
      email: string,
      password: string,
      extras?: { website?: string; turnstileToken?: string }
    ) => {
      const response = await api<{ user: AdminUser }>("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          website: extras?.website || "",
          turnstileToken: extras?.turnstileToken || ""
        })
      });
      setUser(response.user);
    },
    []
  );

  const logout = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } catch (error) {
      if (!(error instanceof ApiError) || error.status !== 401) {
        // La sesión local se cierra igualmente.
      }
    } finally {
      setUser(null);
    }
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, logout }),
    [user, loading, login, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth debe usarse dentro de AuthProvider");
  return context;
}
