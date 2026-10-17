'use client';

import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];
const fetchDisruptions = (signal) => fetchApi('/api/idfm/disruptions', { signal });

/**
 * Status of every tracked line.
 */
export function useDisruptions(refreshInterval = 120000) {
  const polling = usePolling(fetchDisruptions, { interval: refreshInterval });

  return {
    lines: polling.data ?? EMPTY,
    loading: polling.loading,
    error: polling.error,
    stale: polling.stale,
    lastUpdated: polling.lastUpdated,
    // true when the service worker replayed a saved response (offline / server down)
    fromCache: polling.fromCache,
    refresh: polling.refresh,
  };
}
