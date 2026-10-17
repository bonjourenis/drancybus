'use client';

import { useMemo } from 'react';
import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];
const fetchDepartures = (signal) => fetchApi('/api/idfm/departures', { signal });

/**
 * Departures for every configured stop, refreshed on an interval.
 */
export function useDepartures(refreshInterval = 60000) {
  const polling = usePolling(fetchDepartures, { interval: refreshInterval });
  const stops = polling.data ?? EMPTY;
  const byStop = useMemo(
    () => Object.fromEntries(stops.map((entry) => [entry.stop.id, entry])),
    [stops]
  );

  return {
    stops,
    byStop,
    loading: polling.loading,
    error: polling.error,
    stale: polling.stale,
    lastUpdated: polling.lastUpdated,
    partialErrors: polling.response?.errors ?? EMPTY,
    refresh: polling.refresh,
  };
}
