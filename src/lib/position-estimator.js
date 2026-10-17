/**
 * Estimate where a vehicle is from the time it is expected at a stop.
 *
 * The PRIM stop-monitoring feed carries no GPS, only expected times. Given
 * the stop the vehicle is heading to, its final destination and the route
 * trace, we pick the trace segment that passes the stop *before* the
 * destination (that fixes the direction of travel), then walk back from the
 * stop along that segment by minutesUntil x average speed.
 */
import { AVERAGE_SPEED_M_PER_MIN, MAX_SNAP_DISTANCE_M } from './constants';
import { haversineDistance, normalizeText, numericId } from './geo';

const preparedCache = new WeakMap();

/**
 * Pre-compute cumulative distances and stop indexes for a line record from
 * line-data.json. Cached per record object.
 */
export function prepareLine(lineRecord) {
  const segments = (lineRecord.segments ?? [])
    .filter((points) => Array.isArray(points) && points.length > 1)
    .map((points, index) => {
      const cum = [0];
      for (let i = 1; i < points.length; i++) {
        cum.push(
          cum[i - 1] +
            haversineDistance(
              { lat: points[i - 1][0], lng: points[i - 1][1] },
              { lat: points[i][0], lng: points[i][1] }
            )
        );
      }
      return { index, points, cum, length: cum[cum.length - 1], nearestCache: new Map() };
    });

  const stops = lineRecord.stops ?? [];
  const stopsByNumericId = new Map();
  const stopsByName = new Map();
  for (const stop of stops) {
    const id = numericId(stop.id);
    if (id && !stopsByNumericId.has(id)) stopsByNumericId.set(id, stop);
    const key = normalizeText(stop.name);
    if (key && !stopsByName.has(key)) stopsByName.set(key, stop);
  }

  return { segments, stops, stopsByNumericId, stopsByName };
}

export function getPreparedLine(lineRecord) {
  if (!lineRecord) return null;
  let prepared = preparedCache.get(lineRecord);
  if (!prepared) {
    prepared = prepareLine(lineRecord);
    preparedCache.set(lineRecord, prepared);
  }
  return prepared;
}

/**
 * Find a stop of the line by SIRI reference (numeric part) or by name.
 * @returns {{lat:number,lng:number,name?:string}|null}
 */
export function resolveStop(prepared, { ref, name, fallback = null } = {}) {
  if (ref) {
    const stop = prepared.stopsByNumericId.get(numericId(ref));
    if (stop) return { lat: stop.lat, lng: stop.lng, name: stop.name };
  }

  const key = normalizeText(name);
  if (key) {
    const exact = prepared.stopsByName.get(key);
    if (exact) return { lat: exact.lat, lng: exact.lng, name: exact.name };

    const partial = prepared.stops.find((stop) => {
      const stopKey = normalizeText(stop.name);
      return stopKey && (stopKey.includes(key) || key.includes(stopKey));
    });
    if (partial) return { lat: partial.lat, lng: partial.lng, name: partial.name };
  }

  return fallback;
}

function nearestVertex(segment, point) {
  const cacheKey = `${point.lat},${point.lng}`;
  const cached = segment.nearestCache.get(cacheKey);
  if (cached) return cached;

  let bestIndex = 0;
  let bestDistance = Infinity;
  for (let i = 0; i < segment.points.length; i++) {
    const d = haversineDistance(point, { lat: segment.points[i][0], lng: segment.points[i][1] });
    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = i;
    }
  }

  const result = { index: bestIndex, distance: bestDistance, distAlong: segment.cum[bestIndex] };
  segment.nearestCache.set(cacheKey, result);
  return result;
}

/**
 * Point at a given distance along a prepared segment (clamped to its ends).
 */
export function pointAtDistance(segment, target) {
  const { points, cum, length } = segment;
  const t = Math.min(Math.max(target, 0), length);

  // first index whose cumulative distance >= t
  let lo = 0;
  let hi = cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (cum[mid] < t) lo = mid + 1;
    else hi = mid;
  }
  if (lo === 0) return { lat: points[0][0], lng: points[0][1] };

  const i = lo - 1;
  const span = cum[lo] - cum[i];
  const f = span > 0 ? (t - cum[i]) / span : 0;
  return {
    lat: points[i][0] + (points[lo][0] - points[i][0]) * f,
    lng: points[i][1] + (points[lo][1] - points[i][1]) * f,
  };
}

/**
 * @param {Object} input
 * @param {{lat,lng}} input.monitoredStop    the stop the departure was read at
 * @param {{lat,lng}|null} input.destinationStop  the journey's final stop
 * @param {number} input.minutesUntil
 * @param {boolean} [input.vehicleAtStop]
 * @param {string} [input.type]              bus | tram | metro | rer
 * @param {Object|null} prepared             from getPreparedLine()
 * @returns {{lat:number,lng:number,method:string}|null}
 */
export function estimateVehiclePosition(
  { monitoredStop, destinationStop, minutesUntil, vehicleAtStop = false, type = 'bus' },
  prepared
) {
  if (!monitoredStop) return null;

  if (vehicleAtStop || minutesUntil <= 0) {
    return { lat: monitoredStop.lat, lng: monitoredStop.lng, method: 'at-stop' };
  }

  if (!destinationStop || !prepared || prepared.segments.length === 0) return null;

  const maxSnap = MAX_SNAP_DISTANCE_M[type] ?? MAX_SNAP_DISTANCE_M.bus;
  let best = null;

  for (const segment of prepared.segments) {
    const from = nearestVertex(segment, monitoredStop);
    if (from.distance > maxSnap) continue;
    const to = nearestVertex(segment, destinationStop);
    if (to.distance > maxSnap) continue;
    if (to.distAlong <= from.distAlong) continue; // wrong direction on this trace

    const error = from.distance + to.distance;
    if (!best || error < best.error) best = { segment, from, error };
  }

  if (!best) return null;

  const speed = AVERAGE_SPEED_M_PER_MIN[type] ?? AVERAGE_SPEED_M_PER_MIN.bus;
  const target = Math.max(0, best.from.distAlong - minutesUntil * speed);
  const point = pointAtDistance(best.segment, target);

  return { ...point, method: 'route', distanceToStop: Math.round(best.from.distAlong - target) };
}
