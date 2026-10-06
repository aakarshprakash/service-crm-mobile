import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Device from 'expo-device';
import { useQueryClient } from '@tanstack/react-query';
import { api, loadSession, setServer, setToken, setUnauthenticatedHandler, getServer, type Envelope } from './api';
import { configureFormatting } from './format';
import { registerForPush } from './push';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  server: string;
  login: (login: string, password: string, company?: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  changeServer: (url: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [server, setServerState] = useState(getServer());

  const apply = useCallback((u: User | null) => {
    setUser(u);
    if (u?.tenant) configureFormatting({ currency: u.tenant.currency, timezone: u.tenant.timezone });
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get<Envelope<{ user: User }>>('/auth/me');
    apply(res.data.user);
  }, [apply]);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      apply(null);
      qc.clear();
    });
    (async () => {
      const session = await loadSession();
      setServerState(session.server);
      if (session.token) {
        try {
          await refresh();
          registerForPush();
        } catch {
          /* expired token or offline: show the sign-in screen */
        }
      }
      setLoading(false);
    })();
  }, [apply, qc, refresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      server,
      refresh,
      async login(login, password, company) {
        const res = await api.post<Envelope<{ token: string; user: User }>>('/auth/token', {
          login: login.trim(),
          password,
          company: company?.trim() || undefined,
          device_name: `${Device.manufacturer ?? ''} ${Device.modelName ?? 'Phone'}`.trim().slice(0, 100),
        });
        await setToken(res.data.token);
        apply(res.data.user);
        registerForPush();
      },
      async logout() {
        try {
          await api.post('/auth/logout');
        } catch {
          /* already signed out on the server */
        }
        await setToken(null);
        apply(null);
        qc.clear();
      },
      async changeServer(url) {
        await setServer(url);
        setServerState(getServer());
      },
    }),
    [user, loading, server, refresh, apply, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
