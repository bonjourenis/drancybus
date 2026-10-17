'use client';

import { useCallback, useMemo } from 'react';
import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];

/**
 * Departures for every stop of a profile, refreshed on an interval.
 */
export function useDepartures(profileId, refreshInterval = 60000) {
  const fetcher = useCallback(
    (signal) => fetchApi(`/api/idfm/departures?profile=${encodeURIComponent(profileId)}`, { signal }),
    [profileId]
  );
  const polling = usePolling(fetcher, { interval: refreshInterval });
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
    // true when the service worker replayed a saved response (offline / server down)
    fromCache: polling.fromCache,
    partialErrors: polling.response?.errors ?? EMPTY,
    refresh: polling.refresh,
  };
}
