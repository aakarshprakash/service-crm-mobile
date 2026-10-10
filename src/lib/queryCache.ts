import { File, Paths } from 'expo-file-system';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';

/**
 * Keeps the last API answers on the phone so every screen opens instantly with what
 * the technician saw last time, then refreshes in the background. The API server is
 * far away (each request ~0.3 s or more on mobile data), so this hides most waiting.
 */
const file = (key: string) => new File(Paths.document, `query-cache-${key.replace(/[^a-z0-9-]/gi, '_')}.json`);

const fileStorage = {
  getItem: async (key: string) => {
    try {
      const f = file(key);
      return f.exists ? f.textSync() : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      file(key).write(value);
    } catch {
      /* disk full: the in-memory cache still works */
    }
  },
  removeItem: async (key: string) => {
    try {
      const f = file(key);
      if (f.exists) f.delete();
    } catch {
      /* ignore */
    }
  },
};

export const queryPersister = createAsyncStoragePersister({ storage: fileStorage, key: 'servon', throttleTime: 2000 });

/** One day: older than that, a screen shows a spinner and loads fresh. */
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

/** Search results and one-off lookups aren't worth keeping. */
const SKIP = new Set(['spare-search', 'inventory-search', 'share-location']);

export function shouldPersistQuery(query: Query): boolean {
  return query.state.status === 'success' && !SKIP.has(String(query.queryKey[0]));
}
