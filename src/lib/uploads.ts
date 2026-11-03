import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';
import { Directory, File, Paths, UploadType } from 'expo-file-system';
import * as Network from 'expo-network';
import { ApiError, apiUrl, authHeaders, hasToken } from './api';

/**
 * Persistent upload queue for job photos and customer signatures.
 *
 * Every file is first copied into the app's document folder and recorded in
 * uploads/queue.json, so nothing is lost if the network drops, the app is closed or
 * Android kills it in the background. Files go up one at a time through the native
 * uploader (progress, no JS memory copy), with automatic retry and back-off while
 * offline or on server errors. Only a rejection by the server (e.g. visit already
 * closed) stops retrying; the technician then sees the reason and can retry or discard.
 */

export type UploadStatus = 'queued' | 'uploading' | 'failed';

export type UploadKind = 'image' | 'signature' | 'voice' | 'receipt';

export interface UploadItem {
  id: string;
  /** The visit the file belongs to (0 for expense receipts). */
  visitId: number;
  kind: UploadKind;
  /** Photo type (bill, serial…), "signature", "voice" or "receipt". */
  type: string;
  uri: string;
  signerName?: string;
  /** Voice note length in seconds. */
  duration?: number;
  /** Expense claim a receipt photo belongs to. */
  claimId?: number;
  status: UploadStatus;
  progress: number;
  attempts: number;
  error?: string;
  nextAt?: number;
  createdAt: number;
}

const dir = new Directory(Paths.document, 'uploads');
const queueFile = new File(dir, 'queue.json');
const captureFile = new File(dir, 'pending-capture.json');

let items: UploadItem[] = [];
let loaded = false;
let running = false;
let timer: ReturnType<typeof setTimeout> | null = null;
const listeners = new Set<() => void>();
const uploadedListeners = new Set<(visitId: number, item: UploadItem) => void>();

function ensureDir() {
  if (!dir.exists) dir.create({ intermediates: true, idempotent: true });
}

function save() {
  try {
    ensureDir();
    queueFile.write(JSON.stringify(items));
  } catch {
    /* disk full: the in-memory queue still works for this session */
  }
}

function emit() {
  items = [...items];
  listeners.forEach((l) => l());
}

function patch(id: string, changes: Partial<UploadItem>, persist = true) {
  items = items.map((i) => (i.id === id ? { ...i, ...changes } : i));
  if (persist) save();
  emit();
}

function drop(id: string) {
  const item = items.find((i) => i.id === id);
  if (item) {
    try {
      const f = new File(item.uri);
      if (f.exists) f.delete();
    } catch {
      /* already gone */
    }
  }
  items = items.filter((i) => i.id !== id);
  save();
  emit();
}

function newId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Load the saved queue and start working through it; safe to call more than once. */
export function initUploads() {
  if (loaded) return;
  loaded = true;
  try {
    ensureDir();
    if (queueFile.exists) {
      const saved = JSON.parse(queueFile.textSync()) as UploadItem[];
      // Anything that was mid-upload when the app died goes back in the queue.
      items = saved
        .filter((i) => new File(i.uri).exists)
        .map((i) => (i.status === 'uploading' ? { ...i, status: 'queued' as const, progress: 0, nextAt: undefined } : i));
    }
  } catch {
    items = [];
  }
  emit();
  Network.addNetworkStateListener((s) => {
    if (s.isConnected) kick(true);
  });
  AppState.addEventListener('change', (s) => {
    if (s === 'active') kick(true);
  });
  kick();
}

/** Start sending again (after sign-in). */
export function resumeUploads() {
  kick(true);
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getUploads(): UploadItem[] {
  return items;
}

/** Called after each successful upload (used to refresh the visit / expense list). */
export function onUploaded(listener: (visitId: number, item: UploadItem) => void) {
  uploadedListeners.add(listener);
  return () => {
    uploadedListeners.delete(listener);
  };
}

export function useUploads(visitId?: number): UploadItem[] {
  const all = useSyncExternalStore(subscribe, getUploads, getUploads);
  return visitId === undefined ? all : all.filter((i) => i.visitId === visitId);
}

export async function enqueuePhoto(visitId: number, type: string, sourceUri: string): Promise<void> {
  ensureDir();
  const name = `${type}-${Date.now()}.jpg`;
  const target = new File(dir, name);
  const source = new File(sourceUri);
  try {
    await source.move(target);
  } catch {
    await source.copy(target);
  }
  items = [...items, { id: newId(), visitId, kind: 'image', type, uri: target.uri, status: 'queued', progress: 0, attempts: 0, createdAt: Date.now() }];
  save();
  emit();
  kick();
}

/** Voice note recorded on the visit (m4a from the recorder's cache, moved into app storage). */
export async function enqueueVoice(visitId: number, sourceUri: string, durationSeconds: number): Promise<void> {
  ensureDir();
  const ext = sourceUri.split('.').pop()?.toLowerCase() === '3gp' ? '3gp' : 'm4a';
  const target = new File(dir, `voice-${visitId}-${Date.now()}.${ext}`);
  const source = new File(sourceUri);
  try {
    await source.move(target);
  } catch {
    await source.copy(target);
  }
  items = [...items, { id: newId(), visitId, kind: 'voice', type: 'voice', uri: target.uri, duration: Math.round(durationSeconds), status: 'queued', progress: 0, attempts: 0, createdAt: Date.now() }];
  save();
  emit();
  kick();
}

/** Receipt photo for an expense claim (already resized by preparePhoto). */
export async function enqueueReceipt(claimId: number, sourceUri: string): Promise<void> {
  ensureDir();
  const target = new File(dir, `receipt-${claimId}-${Date.now()}.jpg`);
  const source = new File(sourceUri);
  try {
    await source.move(target);
  } catch {
    await source.copy(target);
  }
  items = [...items, { id: newId(), visitId: 0, claimId, kind: 'receipt', type: 'receipt', uri: target.uri, status: 'queued', progress: 0, attempts: 0, createdAt: Date.now() }];
  save();
  emit();
  kick();
}

/** Stores a signature PNG (base64 from the signature pad); replaces any not-yet-sent one. */
export function enqueueSignature(visitId: number, base64Png: string, signerName: string) {
  ensureDir();
  items.filter((i) => i.visitId === visitId && i.kind === 'signature' && i.status !== 'uploading').forEach((i) => drop(i.id));
  const target = new File(dir, `signature-${visitId}-${Date.now()}.png`);
  target.write(base64Png.replace(/^data:image\/\w+;base64,/, ''), { encoding: 'base64' });
  items = [...items, { id: newId(), visitId, kind: 'signature', type: 'signature', uri: target.uri, signerName, status: 'queued', progress: 0, attempts: 0, createdAt: Date.now() }];
  save();
  emit();
  kick();
}

export function retryUpload(id: string) {
  patch(id, { status: 'queued', error: undefined, attempts: 0, nextAt: undefined });
  kick();
}

export function discardUpload(id: string) {
  const item = items.find((i) => i.id === id);
  if (item && item.status !== 'uploading') drop(id);
}

/** Retry everything that is waiting (pull-to-refresh, "retry now"). */
export function retryAll() {
  items.filter((i) => i.status === 'queued').forEach((i) => patch(i.id, { nextAt: undefined }, false));
  save();
  kick(true);
}

/**
 * Resolves once every upload for the visit has reached the server; rejects if one was
 * refused or the wait runs out (still offline). Used before closing a visit.
 */
export function waitForVisit(visitId: number, timeoutMs = 90_000): Promise<void> {
  retryAll();
  return new Promise((resolve, reject) => {
    const check = () => {
      const mine = items.filter((i) => i.visitId === visitId);
      const failed = mine.find((i) => i.status === 'failed');
      if (failed) {
        finish();
        reject(new ApiError(422, `A ${failed.kind === 'signature' ? 'signature' : failed.kind === 'voice' ? 'voice note' : 'photo'} could not be uploaded: ${failed.error ?? 'rejected by the server'}. Retry or remove it on the Photos tab.`));
      } else if (!mine.length) {
        finish();
        resolve();
      }
    };
    const unsubscribe = subscribe(check);
    const limit = setTimeout(() => {
      finish();
      reject(new ApiError(0, 'Photos are still uploading. Check your connection and try again; nothing has been lost.'));
    }, timeoutMs);
    const finish = () => {
      clearTimeout(limit);
      unsubscribe();
    };
    check();
  });
}

/** Remember which visit/photo type the camera was opened for, in case Android kills the app meanwhile. */
export function rememberCapture(visitId: number, jobId: number, type: string) {
  try {
    ensureDir();
    captureFile.write(JSON.stringify({ visitId, jobId, type, at: Date.now() }));
  } catch {
    /* best effort */
  }
}

export function takeRememberedCapture(): { visitId: number; jobId: number; type: string } | null {
  try {
    if (!captureFile.exists) return null;
    const value = JSON.parse(captureFile.textSync()) as { visitId: number; jobId: number; type: string; at: number };
    captureFile.delete();
    return Date.now() - value.at < 60 * 60_000 ? value : null;
  } catch {
    return null;
  }
}

export function forgetCapture() {
  try {
    if (captureFile.exists) captureFile.delete();
  } catch {
    /* ignore */
  }
}

// ---- worker ---------------------------------------------------------------

const BACKOFF_S = [2, 5, 10, 20, 40, 60];
/** Abort an upload that has made no progress for this long. */
const STALL_MS = 45_000;

function schedule() {
  if (timer) clearTimeout(timer);
  timer = null;
  const waiting = items.filter((i) => i.status === 'queued');
  // Signed out: wait for resumeUploads() after sign-in instead of polling.
  if (!waiting.length || !hasToken()) return;
  const next = Math.min(...waiting.map((i) => i.nextAt ?? 0));
  timer = setTimeout(() => kick(), Math.max(1000, next - Date.now()));
}

function kick(resetBackoff = false) {
  if (resetBackoff) {
    items = items.map((i) => (i.status === 'queued' ? { ...i, nextAt: undefined } : i));
  }
  if (running) return;
  running = true;
  work()
    .catch(() => undefined)
    .finally(() => {
      running = false;
      schedule();
    });
}

async function work() {
  while (true) {
    const now = Date.now();
    const next = items.find((i) => i.status === 'queued' && (i.nextAt ?? 0) <= now);
    if (!next) return;
    if (!hasToken()) return; // signed out: resume after sign-in
    const net = await Network.getNetworkStateAsync().catch(() => null);
    if (net && net.isConnected === false) {
      items.filter((i) => i.status === 'queued').forEach((i) => patch(i.id, { nextAt: Date.now() + 15_000 }, false));
      return;
    }
    await uploadOne(next);
  }
}

function messageFrom(body: string, fallback: string): string {
  try {
    const json = JSON.parse(body);
    const first = json?.errors ? (Object.values(json.errors)[0] as string[] | undefined)?.[0] : undefined;
    return first || json?.message || fallback;
  } catch {
    return fallback;
  }
}

async function uploadOne(item: UploadItem) {
  const file = new File(item.uri);
  if (!file.exists) {
    drop(item.id);
    return;
  }
  patch(item.id, { status: 'uploading', progress: 0, error: undefined }, false);

  const controller = new AbortController();
  let lastProgress = Date.now();
  const watchdog = setInterval(() => {
    if (Date.now() - lastProgress > STALL_MS) controller.abort();
  }, 5000);

  const retryLater = (error?: string) => {
    const attempts = item.attempts + 1;
    patch(item.id, { status: 'queued', progress: 0, attempts, error, nextAt: Date.now() + BACKOFF_S[Math.min(attempts - 1, BACKOFF_S.length - 1)] * 1000 });
  };

  try {
    const target: { path: string; field: string; mime: string; params: Record<string, string> } = {
      image: { path: `/visits/${item.visitId}/images`, field: 'image', mime: 'image/jpeg', params: { type: item.type } },
      signature: { path: `/visits/${item.visitId}/signature`, field: 'signature', mime: 'image/png', params: { signer_name: item.signerName ?? '' } },
      voice: { path: `/visits/${item.visitId}/voice-notes`, field: 'audio', mime: item.uri.endsWith('.3gp') ? 'audio/3gpp' : 'audio/mp4', params: { duration: String(item.duration ?? 0) } },
      receipt: { path: `/my/expenses/${item.claimId}/receipt`, field: 'receipt', mime: 'image/jpeg', params: {} as Record<string, string> },
    }[item.kind];
    const result = await file.upload(apiUrl(target.path), {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: target.field,
      mimeType: target.mime,
      parameters: target.params,
      headers: authHeaders(),
      signal: controller.signal,
      onProgress: ({ bytesSent, totalBytes }) => {
        lastProgress = Date.now();
        if (totalBytes > 0) patch(item.id, { progress: Math.min(0.99, bytesSent / totalBytes) }, false);
      },
    });

    if (result.status >= 200 && result.status < 300) {
      drop(item.id);
      uploadedListeners.forEach((l) => l(item.visitId, item));
    } else if (result.status === 401) {
      // Token expired: keep the file and try again after the technician signs in.
      patch(item.id, { status: 'queued', progress: 0, nextAt: Date.now() + 60_000 });
    } else if (result.status === 408 || result.status === 429 || result.status >= 500) {
      retryLater(result.status === 429 ? 'Server busy, retrying…' : 'Server error, retrying…');
    } else {
      // 4xx: the server refused this file (closed visit, too large, not an image…).
      const fallback = result.status === 413 ? 'The file is too large for the server.' : 'Upload refused.';
      patch(item.id, { status: 'failed', progress: 0, error: messageFrom(result.body, fallback) });
    }
  } catch {
    retryLater(controller.signal.aborted ? 'Connection too slow, retrying…' : 'Waiting for network…');
  } finally {
    clearInterval(watchdog);
  }
}
