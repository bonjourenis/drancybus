'use client';

import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];
const fetchVehicles = (signal) => fetchApi('/api/idfm/vehicles', { signal });

/**
 * Estimated vehicle positions, refreshed on an interval.
 */
export function useVehicles(refreshInterval = 60000) {
  const polling = usePolling(fetchVehicles, { interval: refreshInterval });

  return {
    vehicles: polling.data ?? EMPTY,
    loading: polling.loading,
    error: polling.error,
    stale: polling.stale,
    lastUpdated: polling.lastUpdated,
    unplaced: polling.response?.unplaced ?? 0,
    partialErrors: polling.response?.errors ?? EMPTY,
    refresh: polling.refresh,
  };
}
