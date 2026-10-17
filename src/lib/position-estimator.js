/**
 * Estimate where a vehicle is from the times it is expected at stops.
 *
 * The PRIM feeds carry no GPS, only expected times. Given a stop the vehicle
 * is heading to, its final destination and the route trace, we pick the trace
 * segment that passes the stop *before* the destination (that fixes the
 * direction of travel), then walk back from the stop along that segment by
 * minutes x speed.
 *
 * Two anchors are possible:
 *  - the configured stop, from stop monitoring (estimateVehiclePosition);
 *  - the vehicle's nearest upcoming call, from the estimated timetable
 *    (estimateFromTimetable). That anchor is usually only a few minutes
 *    away, and the gap between the next two calls gives a measured speed,
 *    so the walk-back error is much smaller.
 */
import { AVERAGE_SPEED_M_PER_MIN, MAX_SNAP_DISTANCE_M, SPEED_BOUNDS_M_PER_MIN } from './constants';
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
 * The trace segment on which `fromStop` comes before `toStop`, with both
 * stops close enough to the trace. Picks the best fit when several match.
 * @returns {{segment, from, to, error}|null}
 */
export function findDirectedSegment(prepared, fromStop, toStop, type = 'bus') {
  if (!prepared || !fromStop || !toStop) return null;

  const maxSnap = MAX_SNAP_DISTANCE_M[type] ?? MAX_SNAP_DISTANCE_M.bus;
  let best = null;

  for (const segment of prepared.segments) {
    const from = nearestVertex(segment, fromStop);
    if (from.distance > maxSnap) continue;
    const to = nearestVertex(segment, toStop);
    if (to.distance > maxSnap) continue;
    if (to.distAlong <= from.distAlong) continue; // wrong direction on this trace

    const error = from.distance + to.distance;
    if (!best || error < best.error) best = { segment, from, to, error };
  }

  return best;
}

/**
 * @param {Object} input
 * @param {{lat,lng}} input.monitoredStop    the stop the vehicle is heading to
 * @param {{lat,lng}|null} input.destinationStop  a stop further along the journey
 * @param {number} input.minutesUntil        minutes until the monitored stop
 * @param {boolean} [input.vehicleAtStop]
 * @param {string} [input.type]              bus | tram | metro | rer
 * @param {number|null} [input.speedMetersPerMinute]  overrides the mode average
 * @param {Object|null} prepared             from getPreparedLine()
 * @returns {{lat:number,lng:number,method:string}|null}
 */
export function estimateVehiclePosition(
  { monitoredStop, destinationStop, minutesUntil, vehicleAtStop = false, type = 'bus', speedMetersPerMinute = null },
  prepared
) {
  if (!monitoredStop) return null;

  if (vehicleAtStop || minutesUntil <= 0) {
    return { lat: monitoredStop.lat, lng: monitoredStop.lng, method: 'at-stop' };
  }

  const directed = findDirectedSegment(prepared, monitoredStop, destinationStop, type);
  if (!directed) return null;

  const speed = speedMetersPerMinute ?? AVERAGE_SPEED_M_PER_MIN[type] ?? AVERAGE_SPEED_M_PER_MIN.bus;
  const target = Math.max(0, directed.from.distAlong - minutesUntil * speed);
  const point = pointAtDistance(directed.segment, target);

  return { ...point, method: 'route', distanceToStop: Math.round(directed.from.distAlong - target) };
}

/**
 * Speed implied by the trace distance between two consecutive calls and the
 * time between them, in metres per minute. Null when it cannot be measured
 * or is implausible.
 */
export function measureSpeed(prepared, fromStop, toStop, minutes, type = 'bus') {
  if (!(minutes > 0.25)) return null;
  const directed = findDirectedSegment(prepared, fromStop, toStop, type);
  if (!directed) return null;

  const distance = directed.to.distAlong - directed.from.distAlong;
  if (distance < 50) return null;

  const speed = distance / minutes;
  return speed >= SPEED_BOUNDS_M_PER_MIN.min && speed <= SPEED_BOUNDS_M_PER_MIN.max ? speed : null;
}

/**
 * Position a vehicle from its estimated-timetable journey: anchor on the
 * nearest upcoming call, measure the speed from the gap to the following
 * call, and walk back from the anchor.
 *
 * @param {Object} input
 * @param {Object} input.journey          from parseEstimatedTimetable()
 * @param {{lat,lng}|null} [input.destinationStop]
 * @param {Date} [input.now]
 * @param {string} [input.type]
 * @param {Object|null} prepared
 * @returns {{lat, lng, method, anchorStopName, minutesToAnchor, speedMetersPerMinute}|null}
 */
export function estimateFromTimetable({ journey, destinationStop = null, now = new Date(), type = 'bus' }, prepared) {
  if (!journey || !prepared) return null;

  const nowMs = now.getTime();
  const upcoming = [];
  for (const call of journey.calls ?? []) {
    const timeMs = Date.parse(call.time);
    if (!Number.isFinite(timeMs) || timeMs <= nowMs) continue;
    const stop = resolveStop(prepared, { ref: call.stopRef });
    if (!stop) continue;
    upcoming.push({ stop, timeMs });
  }
  if (upcoming.length === 0) return null;
  upcoming.sort((a, b) => a.timeMs - b.timeMs);

  const [first, second] = upcoming;
  const minutesToAnchor = (first.timeMs - nowMs) / 60000;
  const speed = second
    ? measureSpeed(prepared, first.stop, second.stop, (second.timeMs - first.timeMs) / 60000, type)
    : null;

  const base = { monitoredStop: first.stop, minutesUntil: minutesToAnchor, type, speedMetersPerMinute: speed };
  let position = destinationStop ? estimateVehiclePosition({ ...base, destinationStop }, prepared) : null;
  if (!position && second) {
    position = estimateVehiclePosition({ ...base, destinationStop: second.stop }, prepared);
  }
  if (!position) return null;

  return {
    ...position,
    method: position.method === 'at-stop' ? 'at-stop' : 'timetable',
    anchorStopName: first.stop.name ?? null,
    minutesToAnchor: Math.round(minutesToAnchor * 10) / 10,
    speedMetersPerMinute: speed ? Math.round(speed) : null,
  };
}
