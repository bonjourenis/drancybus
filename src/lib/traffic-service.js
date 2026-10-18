/**
 * Road traffic on the configured routes (favorites.json -> profiles[].traffic),
 * from TomTom routing with live traffic. When a route names `alongLine`, the
 * bus line's trace between origin and destination is sent as the path to
 * follow, so the travel time is measured on the bus's road even when a
 * jam would make the fastest car route take side streets.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { TRAFFIC_CACHE } from './constants';
import { safeErrorMessage } from './idfm-client';
import { findDirectedSegment, getPreparedLine, projectOnSegment } from './position-estimator';
import { LEVEL_LABELS, fetchRouteWithTraffic, getTrafficApiKey, parseRoute, trafficLevel } from './tomtom-client';
import { createUpstreamCache } from './upstream-cache';

const cache = createUpstreamCache({
  fetcher: null, // supplied per call: the key is the route id
  freshMs: TRAFFIC_CACHE.freshMs,
  staleMaxMs: TRAFFIC_CACHE.staleMaxMs,
});

export function clearTrafficCache() {
  cache.clear();
}

/**
 * The path of `alongLine` from the route's origin to its destination:
 * origin, every trace vertex in between, destination. Null when the route
 * names no line or the line's trace does not join the two points.
 */
export function routePath(route, lineData = lineDataFile) {
  const prepared = route.alongLine ? getPreparedLine(lineData?.lines?.[route.alongLine]) : null;
  const directed = prepared ? findDirectedSegment(prepared, route.from, route.to, 'bus') : null;
  if (!directed) return null;

  const { points, cum } = directed.segment;
  const start = directed.from.distAlong;
  const end = projectOnSegment(directed.segment, route.to).distAlong;
  const between = [];
  for (let i = 0; i < points.length; i++) {
    // cum[i] === cum[i - 1] means the trace repeats a vertex: send it once
    if (cum[i] > start && cum[i] < end && (i === 0 || cum[i] > cum[i - 1])) {
      between.push({ lat: points[i][0], lng: points[i][1] });
    }
  }
  return [route.from, ...between, route.to];
}

/**
 * Ask TomTom for the route along the bus line; if it cannot rebuild that
 * path (e.g. the trace no longer matches the road network), fall back to its
 * own fastest route rather than showing nothing.
 */
async function fetchAlongLine(route, lineData, { apiKey, fetchRoute }) {
  const locations = [route.from, route.to];
  const path = routePath(route, lineData);
  if (path) {
    try {
      return { ...(await fetchRoute(locations, { apiKey, supportingPoints: path })), followsLine: true };
    } catch (error) {
      if (error?.code !== 'NO_ROUTE') throw error;
      console.error(`[traffic] ${route.id}: TomTom could not follow ${route.alongLine}, using its own route`);
    }
  }
  return { ...(await fetchRoute(locations, { apiKey })), followsLine: false };
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
          fetcher: () => fetchAlongLine(route, lineData, { apiKey, fetchRoute }),
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
          // vs empty roads
          delayMinutes: toMinutes(
            summary.freeFlowSeconds != null ? summary.travelSeconds - summary.freeFlowSeconds : summary.delaySeconds
          ),
          // vs the usual traffic at this time of day (TomTom historic data)
          typicalDelayMinutes:
            summary.typicalSeconds != null ? toMinutes(summary.travelSeconds - summary.typicalSeconds) : null,
          lengthMeters: summary.lengthMeters,
          followsLine: Boolean(data.followsLine),
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
