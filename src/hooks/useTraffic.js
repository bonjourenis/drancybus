'use client';

import { useCallback } from 'react';
import { fetchApi } from '@/lib/api-client';
import { usePolling } from './usePolling';

const EMPTY = [];

/**
 * Road traffic on a profile's configured routes.
 */
export function useTraffic(profileId, refreshInterval = 180000) {
  const fetcher = useCallback(
    (signal) => fetchApi(`/api/traffic?profile=${encodeURIComponent(profileId)}`, { signal }),
    [profileId]
  );
  const polling = usePolling(fetcher, { interval: refreshInterval });

  return {
    routes: polling.data ?? EMPTY,
    configured: polling.response?.configured ?? true,
    loading: polling.loading,
    error: polling.error,
    lastUpdated: polling.lastUpdated,
    // true when the service worker replayed a saved response (offline / server down)
    fromCache: polling.fromCache,
    refresh: polling.refresh,
  };
}
