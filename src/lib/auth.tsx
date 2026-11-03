import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import * as Device from 'expo-device';
import { File, Paths } from 'expo-file-system';
import { useQueryClient } from '@tanstack/react-query';
import { api, ApiError, clearDownloadedPdfs, hasToken, loadSession, setServer, setToken, setUnauthenticatedHandler, getServer, type Envelope } from './api';
import { configureFormatting } from './format';
import { getPushToken, registerForPush, resetPushRegistration } from './push';
import { resumeUploads } from './uploads';
import { markPasswordSignIn, setBiometricFor, setUnlocked } from './biometric';
import { queryPersister } from './queryCache';
import type { User } from './types';
import { toast } from '@/components/toast';

interface AuthState {
  user: User | null;
  loading: boolean;
  server: string;
  /** Kept in memory only, from sign-in until the forced password change is done. */
  temporaryPassword: string | null;
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
  const userRef = useRef<User | null>(null);
  userRef.current = user;
  const [loading, setLoading] = useState(true);
  const [server, setServerState] = useState(getServer());
  const [temporaryPassword, setTemporaryPassword] = useState<string | null>(null);

  const apply = useCallback((u: User | null) => {
    setUser(u);
    if (!u?.must_change_password) setTemporaryPassword(null);
    if (u?.tenant) configureFormatting({ currency: u.tenant.currency, timezone: u.tenant.timezone });
  }, []);

  const refresh = useCallback(async () => {
    const res = await api.get<Envelope<{ user: User }>>('/auth/me');
    apply(res.data.user);
    cacheProfile(res.data.user);
  }, [apply]);

  // No answer at start-up, or a slow one: keep trying, as a dropped request needn't come with a network change.
  const retryRefresh = useCallback(
    (attempt = 0) => {
      setTimeout(() => {
        if (!hasToken()) return;
        refresh().then(registerForPush).catch(() => retryRefresh(attempt + 1));
      }, Math.min(15_000 * 2 ** attempt, 5 * 60_000));
    },
    [refresh],
  );

  useEffect(() => {
    setUnauthenticatedHandler(() => {
      // Expired, signed out by the office, or password reset: say why instead of just showing sign-in.
      if (userRef.current) toast.info('You were signed out. Please sign in again.');
      apply(null);
      cacheProfile(null);
      qc.clear();
      void queryPersister.removeClient(); // never show this user's saved screens to the next one
      clearDownloadedPdfs();
    });
    (async () => {
      const session = await loadSession();
      setServerState(session.server);
      if (session.token) {
        // Photos queued before the app closed carry on, even if /auth/me fails offline.
        resumeUploads();
        // Open straight away with the saved profile; the server check runs in the background.
        // (Waiting for /auth/me first added a full round trip to every app start.)
        const saved = cachedProfile();
        if (saved) {
          apply(saved);
          setLoading(false);
          // 401 has already signed the technician out; otherwise keep the saved profile and try again.
          refresh()
            .then(registerForPush)
            .catch(() => retryRefresh());
          return;
        }
        try {
          await refresh();
          registerForPush();
        } catch (e) {
          // Offline or server unreachable: carry on with the saved profile and refresh once back online.
          // An expired token (401) has already cleared the session and shows the sign-in screen.
          const saved = e instanceof ApiError && e.status === 401 ? null : cachedProfile();
          if (saved) {
            apply(saved);
            retryRefresh();
          }
        }
      }
      setLoading(false);
    })();
  }, [apply, qc, refresh, retryRefresh]);

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      server,
      temporaryPassword,
      refresh,
      async login(login, password, company) {
        const res = await api.post<Envelope<{ token: string; user: User }>>('/auth/token', {
          login: login.trim(),
          password,
          company: company?.trim() || undefined,
          device_name: `${Device.manufacturer ?? ''} ${Device.modelName ?? 'Phone'}`.trim().slice(0, 100),
        });
        await setToken(res.data.token);
        markPasswordSignIn();
        setUnlocked(true);
        if (res.data.user.must_change_password) setTemporaryPassword(password);
        apply(res.data.user);
        cacheProfile(res.data.user);
        registerForPush();
        resumeUploads();
      },
      async logout() {
        try {
          await api.post('/auth/logout', { device_token: getPushToken() });
          resetPushRegistration();
        } catch {
          /* already signed out on the server */
        }
        await setToken(null);
        await setBiometricFor(null);
        apply(null);
        cacheProfile(null);
        qc.clear();
        void queryPersister.removeClient();
        clearDownloadedPdfs();
      },
      async changeServer(url) {
        await setServer(url);
        setServerState(getServer());
      },
    }),
    [user, loading, server, temporaryPassword, refresh, apply, qc],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
