import * as SecureStore from 'expo-secure-store';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

/**
 * Fetch wrapper for the Servon API (Laravel, /api/v1). Sanctum personal access token
 * in the Authorization header; the token and the server address live in the device's
 * secure keystore.
 */

export class ApiError extends Error {
  status: number;
  errors: Record<string, string[]>;

  constructor(status: number, message: string, errors: Record<string, string[]> = {}) {
    super(message);
    this.status = status;
    this.errors = errors;
  }

  field(name: string): string | undefined {
    return this.errors[name]?.[0];
  }
}

export interface Envelope<T> {
  data: T;
  message?: string;
  meta?: Record<string, unknown>;
}

export interface Paginated<T> {
  data: T[];
  meta: { current_page: number; last_page: number; per_page: number; total: number; [k: string]: unknown };
}

const TOKEN_KEY = 'servon.token';
const SERVER_KEY = 'servon.server';
const DEFAULT_SERVER = (process.env.EXPO_PUBLIC_API_URL ?? 'http://192.168.1.10:8000').replace(/\/$/, '');

let token: string | null = null;
let server = DEFAULT_SERVER;
let onUnauthenticated: (() => void) | null = null;

export async function loadSession(): Promise<{ token: string | null; server: string }> {
  token = await SecureStore.getItemAsync(TOKEN_KEY);
  // One Servon API: the address is built into the app. Forget any address an older version saved.
  server = DEFAULT_SERVER;
  await SecureStore.deleteItemAsync(SERVER_KEY).catch(() => undefined);
  return { token, server };
}

export async function setToken(value: string | null) {
  token = value;
  if (value) await SecureStore.setItemAsync(TOKEN_KEY, value);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export async function setServer(value: string) {
  server = value.trim().replace(/\/+$/, '').replace(/\/api\/v1$/, '');
  if (!/^https?:\/\//.test(server)) server = 'https://' + server;
  await SecureStore.setItemAsync(SERVER_KEY, server);
}

export function getServer() {
  return server;
}

export function setUnauthenticatedHandler(handler: () => void) {
  onUnauthenticated = handler;
}

type Query = Record<string, string | number | boolean | null | undefined>;

function qs(params?: Query): string {
  if (!params) return '';
  const parts = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join('&')}` : '';
}

function headers(extra: Record<string, string> = {}): Record<string, string> {
  return token ? { ...extra, Authorization: `Bearer ${token}` } : extra;
}

/** Absolute API URL and auth headers, for native transfers (uploads) outside fetch. */
export function apiUrl(path: string): string {
  return `${server}/api/v1${path}`;
}

export function authHeaders(): Record<string, string> {
  return headers({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
}

export function hasToken(): boolean {
  return !!token;
}

/** A request that hasn't answered in this long is treated as a dropped connection. */
const TIMEOUT_MS = 30_000;

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const isForm = body instanceof FormData;
  const h = headers({ Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' });
  if (!isForm && body !== undefined) h['Content-Type'] = 'application/json';

  let res: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), isForm ? TIMEOUT_MS * 4 : TIMEOUT_MS);
  try {
    res = await fetch(`${server}/api/v1${path}`, {
      method,
      headers: h,
      body: isForm ? (body as FormData) : body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, controller.signal.aborted ? 'The server is taking too long to respond. Check your connection and try again.' : 'Can’t reach the server. Check your internet connection.');
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/auth/token')) {
      await setToken(null);
      onUnauthenticated?.();
    }
    const message =
      res.status === 429 ? 'Too many attempts. Wait a minute and try again.' : json?.message || (res.status >= 500 ? 'Something went wrong on the server. Please try again.' : 'Request failed.');
    throw new ApiError(res.status, message, json?.errors ?? {});
  }
  return json as T;
}

export const api = {
  get: <T>(path: string, params?: Query) => request<T>('GET', path + qs(params)),
  post: <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {}),
  put: <T>(path: string, body?: unknown) => request<T>('PUT', path, body ?? {}),
  patch: <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {}),
  delete: <T>(path: string) => request<T>('DELETE', path),
};

/** Download an authenticated PDF to the cache and open the share / open-with sheet. */
export async function openPdf(path: string, filename: string): Promise<void> {
  let file: File;
  try {
    file = await File.downloadFileAsync(`${server}/api/v1${path}`, new File(Paths.cache, filename), {
      headers: headers({ Accept: 'application/pdf' }),
      idempotent: true,
    });
  } catch {
    throw new ApiError(0, 'Download failed. Check your connection and try again.');
  }
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', dialogTitle: filename, UTI: 'com.adobe.pdf' });
  }
}
