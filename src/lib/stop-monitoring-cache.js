/**
 * In-memory cache in front of the PRIM stop-monitoring endpoint.
 *
 *  - Fresh responses are reused for a short window so many browser tabs and
 *    both API routes share one upstream call per stop.
 *  - Concurrent requests for the same stop share one in-flight fetch.
 *  - When PRIM fails, the last good response is served (flagged stale) for a
 *    bounded time instead of surfacing an error, and PRIM is not retried
 *    until the fresh window has elapsed.
 *
 * The cache is per process; on serverless hosts each instance has its own.
 */
import { STOP_MONITORING_CACHE } from './constants';
import { fetchStopMonitoring } from './idfm-client';

const cache = new Map(); // stopId -> { data, fetchedAt, failedAt, inflight }

export async function getStopMonitoring(
  stopId,
  {
    fetcher = fetchStopMonitoring,
    now = Date.now,
    freshMs = STOP_MONITORING_CACHE.freshMs,
    staleMaxMs = STOP_MONITORING_CACHE.staleMaxMs,
  } = {}
) {
  const entry = cache.get(stopId) ?? {};
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
      const data = await fetcher(stopId);
      const fetchedAt = now();
      cache.set(stopId, { data, fetchedAt });
      return { data, fetchedAt, stale: false };
    } catch (error) {
      const failedAt = now();
      const previous = cache.get(stopId);
      if (previous?.data !== undefined && failedAt - previous.fetchedAt < staleMaxMs) {
        cache.set(stopId, { data: previous.data, fetchedAt: previous.fetchedAt, failedAt });
        return { data: previous.data, fetchedAt: previous.fetchedAt, stale: true, error };
      }
      cache.delete(stopId);
      throw error;
    }
  })();

  cache.set(stopId, { ...entry, inflight });
  return inflight;
}

export function clearStopMonitoringCache() {
  cache.clear();
}
