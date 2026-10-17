'use client';

import { useCallback } from 'react';
import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];

/**
 * Estimated vehicle positions for a profile, refreshed on an interval.
 */
export function useVehicles(profileId, refreshInterval = 60000) {
  const fetcher = useCallback(
    (signal) => fetchApi(`/api/idfm/vehicles?profile=${encodeURIComponent(profileId)}`, { signal }),
    [profileId]
  );
  const polling = usePolling(fetcher, { interval: refreshInterval });

  return {
    vehicles: polling.data ?? EMPTY,
    loading: polling.loading,
    error: polling.error,
    stale: polling.stale,
    lastUpdated: polling.lastUpdated,
    // true when the service worker replayed a saved response (offline / server down)
    fromCache: polling.fromCache,
    unplaced: polling.response?.unplaced ?? 0,
    partialErrors: polling.response?.errors ?? EMPTY,
    refresh: polling.refresh,
  };
}
