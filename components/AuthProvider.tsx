"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/client-api";
import { useOnchain } from "@/components/web3/Onchain";

export interface CurrentUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  platformRole: string;
  region: string;
  kycStatus: string;
  /** Onchain mode: the user's embedded wallet. */
  walletAddress?: string | null;
  creator: {
    id: string;
    handle: string;
    channelName: string;
    verificationStatus: string;
  } | null;
  ledgerAccount: { balancePaise: number } | null;
}

interface AuthContextValue {
  user: CurrentUser | null;
  loading: boolean;
  refresh: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  signup: (email: string, password: string, displayName: string, region: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await api.get<{ user: CurrentUser | null }>("/api/auth/me");
      setUser(data.user);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const login = useCallback(
    async (email: string, password: string) => {
      await api.post("/api/auth/login", { email, password });
      await refresh();
    },
    [refresh]
  );

  const signup = useCallback(
    async (email: string, password: string, displayName: string, region: string) => {
      await api.post("/api/auth/signup", { email, password, displayName, region });
      await refresh();
    },
    [refresh]
  );

  const onchain = useOnchain();
  const logout = useCallback(async () => {
    await api.post("/api/auth/logout");
    // Onchain mode: also end the Privy session, or it would sign straight back in.
    if (onchain.enabled) await onchain.logout();
    setUser(null);
  }, [onchain]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
