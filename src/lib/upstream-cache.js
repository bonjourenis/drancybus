/**
 * Keyed in-memory cache in front of an upstream fetcher.
 *
 *  - Fresh responses are reused for a short window so many browser tabs and
 *    both API routes share one upstream call per key.
 *  - Concurrent requests for the same key share one in-flight fetch.
 *  - When the upstream fails, the last good response is served (flagged
 *    stale) for a bounded time instead of surfacing an error, and the
 *    upstream is not retried until the fresh window has elapsed.
 *
 * The cache is per process; on serverless hosts each instance has its own.
 */
export function createUpstreamCache(defaults) {
  const cache = new Map(); // key -> { data, fetchedAt, failedAt, inflight }

  async function get(key, overrides = {}) {
    const { fetcher, now = Date.now, freshMs, staleMaxMs } = { ...defaults, ...overrides };

    const entry = cache.get(key) ?? {};
    const current = now();
    const hasUsableData = entry.data !== undefined && current - entry.fetchedAt < staleMaxMs;

    if (entry.data !== undefined && current - entry.fetchedAt < freshMs) {
      return { data: entry.data, fetchedAt: entry.fetchedAt, stale: false };
    }

    if (entry.inflight) {
      return entry.inflight;
    }

    // Back off after a failure: keep serving stale data for one fresh window.
    if (hasUsableData && entry.failedAt && current - entry.failedAt < freshMs) {
      return { data: entry.data, fetchedAt: entry.fetchedAt, stale: true };
    }

    const inflight = (async () => {
      try {
        const data = await fetcher(key);
        const fetchedAt = now();
        cache.set(key, { data, fetchedAt });
        return { data, fetchedAt, stale: false };
      } catch (error) {
        const failedAt = now();
        const previous = cache.get(key);
        if (previous?.data !== undefined && failedAt - previous.fetchedAt < staleMaxMs) {
          cache.set(key, { data: previous.data, fetchedAt: previous.fetchedAt, failedAt });
          return { data: previous.data, fetchedAt: previous.fetchedAt, stale: true, error };
        }
        cache.delete(key);
        throw error;
      }
    })();

    cache.set(key, { ...entry, inflight });
    return inflight;
  }

  return { get, clear: () => cache.clear() };
}
