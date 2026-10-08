import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import * as Device from 'expo-device';
import * as Network from 'expo-network';
import { File, Paths } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, loadSession, setServer, setToken, setUnauthenticatedHandler, getServer, type Envelope } from './api';
import { configureFormatting } from './format';
import { getPushToken, registerForPush } from './push';
import { resumeUploads } from './uploads';
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

/** Last known profile, so starting the app without signal doesn't sign the technician out. */
const profileFile = new File(Paths.document, 'profile.json');

function cacheProfile(u: User | null) {
  try {
    if (u) profileFile.write(JSON.stringify(u));
    else if (profileFile.exists) profileFile.delete();
  } catch {
    /* best effort */
  }
}

function cachedProfile(): User | null {
  try {
    return profileFile.exists ? (JSON.parse(profileFile.textSync()) as User) : null;
  } catch {
    return null;
  }
}

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
    cacheProfile(res.data.user);
  }, [apply]);

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      apply(null);
      cacheProfile(null);
      qc.clear();
    });
    (async () => {
      const session = await loadSession();
      setServerState(session.server);
      if (session.token) {
        // Photos queued before the app closed carry on, even if /auth/me fails offline.
        resumeUploads();
        try {
          await refresh();
          registerForPush();
        } catch (e) {
          // Offline or server unreachable: carry on with the saved profile and refresh once back online.
          // An expired token (401) has already cleared the session and shows the sign-in screen.
          const saved = e instanceof ApiError && e.status === 401 ? null : cachedProfile();
          if (saved) {
            apply(saved);
            const sub = Network.addNetworkStateListener((s) => {
              if (!s.isConnected) return;
              sub.remove();
              refresh().then(registerForPush).catch(() => undefined);
            });
          }
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
        cacheProfile(res.data.user);
        registerForPush();
        resumeUploads();
      },
      async logout() {
        try {
          await api.post('/auth/logout', { device_token: getPushToken() });
        } catch {
          /* already signed out on the server */
        }
        await setToken(null);
        apply(null);
        cacheProfile(null);
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
