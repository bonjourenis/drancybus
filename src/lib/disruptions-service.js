/**
 * Status of every tracked line, from the IDFM bulk disruptions feed. One
 * upstream call covers all lines and is cached for two minutes.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { DISRUPTIONS_CACHE } from './constants';
import { summarizeDisruptions } from './disruptions';
import { fetchDisruptionsBulk } from './idfm-client';
import { buildLineLookup } from './lines';
import { createUpstreamCache } from './upstream-cache';

const cache = createUpstreamCache({
  fetcher: () => fetchDisruptionsBulk(),
  freshMs: DISRUPTIONS_CACHE.freshMs,
  staleMaxMs: DISRUPTIONS_CACHE.staleMaxMs,
});

export function clearDisruptionsCache() {
  cache.clear();
}

export async function getDisruptions({
  config = favorites,
  lineData = lineDataFile,
  now = new Date(),
  getBulk = () => cache.get('bulk'),
} = {}) {
  const { data, fetchedAt, stale } = await getBulk();
  const lines = [...buildLineLookup(config, lineData).values()];

  return {
    lines: summarizeDisruptions(data, {
      lines,
      now,
      timeZone: config.settings?.timeZone,
      upcomingDays: DISRUPTIONS_CACHE.upcomingDays,
    }),
    sourceUpdatedAt: data?.lastUpdatedDate ?? null,
    fetchedAt: new Date(fetchedAt).toISOString(),
    stale,
  };
}
