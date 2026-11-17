import { File, Paths } from 'expo-file-system';
import { readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { Query } from '@tanstack/react-query';

/**
 * Keeps the last API answers on the phone so every screen opens instantly with what
 * the technician saw last time, then refreshes in the background. The API server is
 * far away (each request ~0.3 s or more on mobile data), so this hides most waiting.
 */
const file = (key: string) => new File(Paths.document, `query-cache-${key.replace(/[^a-z0-9-]/gi, '_')}.json`);

// Reading and writing happen off the screen's thread. The cache is one large piece of text, saved again
// whenever anything in it changes: writing it the blocking way froze scrolling and typing for a moment each time.
const fileStorage = {
  getItem: async (key: string) => {
    try {
      const f = file(key);
      return f.exists ? await readAsStringAsync(f.uri) : null;
    } catch {
      return null;
    }
  },
  setItem: async (key: string, value: string) => {
    try {
      await writeAsStringAsync(file(key).uri, value);
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

// Saved at most every 5 seconds: often enough to survive the app being closed, rare enough to stay out of the way.
export const queryPersister = createAsyncStoragePersister({ storage: fileStorage, key: 'servon', throttleTime: 5000 });

/** One day: older than that, a screen shows a spinner and loads fresh. */
export const PERSIST_MAX_AGE = 24 * 60 * 60_000;

/** Search results, one-off lookups and things read once (signed-in devices) aren't worth keeping. */
const SKIP = new Set(['spare-search', 'inventory-search', 'share-location', 'my-sessions']);

export function shouldPersistQuery(query: Query): boolean {
  // A search through the jobs list is typed once and thrown away: only the plain lists are kept.
  if (query.queryKey[0] === 'tech-jobs' && typeof query.queryKey[2] === 'string' && query.queryKey[2] !== '') return false;

  return query.state.status === 'success' && !SKIP.has(String(query.queryKey[0]));
}
