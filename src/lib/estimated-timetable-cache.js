/**
 * Cache in front of the PRIM estimated-timetable endpoint, keyed by line.
 * See upstream-cache.js for the behaviour.
 */
import { ESTIMATED_TIMETABLE_CACHE } from './constants';
import { fetchEstimatedTimetable } from './idfm-client';
import { createUpstreamCache } from './upstream-cache';

const cache = createUpstreamCache({
  fetcher: fetchEstimatedTimetable,
  freshMs: ESTIMATED_TIMETABLE_CACHE.freshMs,
  staleMaxMs: ESTIMATED_TIMETABLE_CACHE.staleMaxMs,
});

export function getEstimatedTimetable(lineId, overrides = {}) {
  return cache.get(lineId, overrides);
}

export function clearEstimatedTimetableCache() {
  cache.clear();
}
