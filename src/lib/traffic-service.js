/**
 * Road traffic on the configured routes (favorites.json -> profiles[].traffic),
 * from TomTom routing with live traffic. When a route names `alongLine`, two
 * via points taken from that bus line's trace keep the car route on the
 * bus's road.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { TRAFFIC_CACHE } from './constants';
import { safeErrorMessage } from './idfm-client';
import { findDirectedSegment, getPreparedLine, pointAtDistance, projectOnSegment } from './position-estimator';
import { LEVEL_LABELS, fetchRouteWithTraffic, getTrafficApiKey, parseRoute, trafficLevel } from './tomtom-client';
import { createUpstreamCache } from './upstream-cache';

const VIA_FRACTIONS = [1 / 3, 2 / 3];

const cache = createUpstreamCache({
  fetcher: null, // supplied per call: the key is the route id
  freshMs: TRAFFIC_CACHE.freshMs,
  staleMaxMs: TRAFFIC_CACHE.staleMaxMs,
});

export function clearTrafficCache() {
  cache.clear();
}

/** origin, via points along `alongLine` (if any), destination */
export function routeLocations(route, lineData = lineDataFile) {
  const locations = [route.from];
  const prepared = route.alongLine ? getPreparedLine(lineData?.lines?.[route.alongLine]) : null;
  const directed = prepared ? findDirectedSegment(prepared, route.from, route.to, 'bus') : null;

  if (directed) {
    const start = directed.from.distAlong;
    const end = projectOnSegment(directed.segment, route.to).distAlong;
    for (const fraction of VIA_FRACTIONS) {
      locations.push(pointAtDistance(directed.segment, start + (end - start) * fraction));
    }
  }

  locations.push(route.to);
  return locations;
}

const toMinutes = (seconds) => (Number.isFinite(seconds) ? Math.round(seconds / 60) : null);

export async function getTraffic({
  config = favorites,
  lineData = lineDataFile,
  apiKey = getTrafficApiKey(),
  fetchRoute = fetchRouteWithTraffic,
} = {}) {
  const routes = config.traffic ?? [];
  if (!apiKey) {
    return {
      configured: false,
      routes: routes.map(({ id, name }) => ({ id, name, status: 'not-configured' })),
    };
  }

  const results = await Promise.all(
    routes.map(async (route) => {
      try {
        const { data, fetchedAt, stale } = await cache.get(route.id, {
          fetcher: () => fetchRoute(routeLocations(route, lineData), { apiKey }),
        });
        const summary = parseRoute(data);
        const level = trafficLevel(summary);
        return {
          id: route.id,
          name: route.name,
          status: 'ok',
          provider: 'TomTom',
          level,
          levelLabel: LEVEL_LABELS[level],
          travelMinutes: toMinutes(summary.travelSeconds),
          freeFlowMinutes: toMinutes(summary.freeFlowSeconds),
          typicalMinutes: toMinutes(summary.typicalSeconds),
          delayMinutes: toMinutes(
            summary.freeFlowSeconds != null ? summary.travelSeconds - summary.freeFlowSeconds : summary.delaySeconds
          ),
          lengthMeters: summary.lengthMeters,
          incidents: summary.incidents.map(({ label, category, delaySeconds, speedKmh }) => ({
            label,
            category,
            delayMinutes: toMinutes(delaySeconds),
            speedKmh,
          })),
          fetchedAt: new Date(fetchedAt).toISOString(),
          stale,
        };
      } catch (error) {
        console.error(`[traffic] ${route.id}: ${error.message}`);
        return { id: route.id, name: route.name, status: 'error', error: safeErrorMessage(error), code: error.code ?? null };
      }
    })
  );

  return { configured: true, routes: results };
}
