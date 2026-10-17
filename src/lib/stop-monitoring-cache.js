/**
 * Cache in front of the PRIM stop-monitoring endpoint, keyed by stop.
 * See upstream-cache.js for the behaviour.
 */
import { STOP_MONITORING_CACHE } from './constants';
import { fetchStopMonitoring } from './idfm-client';
import { createUpstreamCache } from './upstream-cache';

const cache = createUpstreamCache({
  fetcher: fetchStopMonitoring,
  freshMs: STOP_MONITORING_CACHE.freshMs,
  staleMaxMs: STOP_MONITORING_CACHE.staleMaxMs,
});

export function getStopMonitoring(stopId, overrides = {}) {
  return cache.get(stopId, overrides);
}

export function clearStopMonitoringCache() {
  cache.clear();
}
