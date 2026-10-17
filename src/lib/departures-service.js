/**
 * Next departures for every stop in favorites.json, filtered by each stop's
 * line and direction rules. One PRIM call per distinct stop, shared through
 * the stop-monitoring cache.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { groupStopsById } from './config-utils';
import { matchesStopConfig } from './direction-filter';
import { safeErrorMessage } from './idfm-client';
import { buildLineNames } from './lines';
import { parseDepartures } from './siri-parser';
import { getStopMonitoring } from './stop-monitoring-cache';

export async function getDepartures({
  config = favorites,
  lineData = lineDataFile,
  now = new Date(),
  getMonitoring = getStopMonitoring,
} = {}) {
  const lineNames = buildLineNames(config, lineData);
  const maxPerStop = config.settings?.maxDeparturesPerStop ?? 5;
  const stops = groupStopsById(config.stops);

  const results = await Promise.all(
    stops.map(async (stop) => {
      const summary = {
        id: stop.id,
        name: stop.name,
        lines: stop.lines,
        coordinates: stop.coordinates ?? null,
      };

      try {
        const { data, stale, fetchedAt } = await getMonitoring(stop.id);
        const departures = parseDepartures(data, { now, lineNames })
          .filter((departure) => matchesStopConfig(departure, stop))
          .slice(0, maxPerStop);

        return {
          stop: summary,
          departures,
          stale,
          fetchedAt: new Date(fetchedAt).toISOString(),
          error: null,
          errorCode: null,
        };
      } catch (error) {
        console.error(`[departures] ${stop.id}: ${error.message}`);
        return {
          stop: summary,
          departures: [],
          stale: false,
          fetchedAt: null,
          error: safeErrorMessage(error),
          errorCode: error.code ?? null,
        };
      }
    })
  );

  const errors = results
    .filter((result) => result.error)
    .map((result) => ({ stopId: result.stop.id, message: result.error, code: result.errorCode }));

  return {
    stops: results,
    stale: results.some((result) => result.stale),
    errors,
    allFailed: results.length > 0 && errors.length === results.length,
  };
}
