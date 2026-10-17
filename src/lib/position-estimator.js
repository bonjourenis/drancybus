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
 *  - an upcoming call from the estimated timetable that lies upstream of the
 *    configured stop (estimateFromTimetable). It is closer to the vehicle,
 *    and the time between it and the configured stop gives a measured speed.
 *    The bus timetable feed is noisy (stops of the other direction, times
 *    that contradict route order), so a call is only trusted when it is
 *    upstream on the directed trace and implies a plausible speed.
 */
import { AVERAGE_SPEED_M_PER_MIN, MAX_SNAP_DISTANCE_M, SPEED_BOUNDS_M_PER_MIN } from './constants';

// Stop references come in two kinds that must not be cross-matched by number:
// platforms (STIF:StopPoint:Q:…, IDFM:<n>) and stations
// (STIF:StopArea:SP:…, IDFM:monomodalStopPlace:<n>).
const refKind = (ref) => (/StopArea|monomodalStopPlace/.test(String(ref ?? '')) ? 'area' : 'point');
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
  const stopsByNumericId = new Map(); // `${kind}:${number}` -> stop
  const stopsByName = new Map();
  for (const stop of stops) {
    const id = numericId(stop.id);
    const key = id ? `${refKind(stop.id)}:${id}` : null;
    if (key && !stopsByNumericId.has(key)) stopsByNumericId.set(key, stop);
    const nameKey = normalizeText(stop.name);
    if (nameKey && !stopsByName.has(nameKey)) stopsByName.set(nameKey, stop);
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
    const id = numericId(ref);
    const stop = id ? prepared.stopsByNumericId.get(`${refKind(ref)}:${id}`) : null;
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

/**
 * Closest trace vertex to `point` on a prepared segment:
 * { index, distance (m from the point), distAlong (m from segment start) }.
 */
export function projectOnSegment(segment, point) {
  return nearestVertex(segment, point);
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

// Segments whose snapping error is within this margin of the best one are
// considered equally good fits.
const SNAP_TIE_MARGIN_M = 50;

/**
 * The trace segment on which `fromStop` comes before `toStop`, with both
 * stops close enough to the trace.
 *
 * A line's trace holds several variants (full route, short turns starting
 * mid-line). Among segments that fit about equally well, the one with the
 * most route before `fromStop` wins: walking a vehicle back from a stop on a
 * short-turn variant would pin it to that variant's first stop.
 * @returns {{segment, from, to, error}|null}
 */
export function findDirectedSegment(prepared, fromStop, toStop, type = 'bus') {
  if (!prepared || !fromStop || !toStop) return null;

  const maxSnap = MAX_SNAP_DISTANCE_M[type] ?? MAX_SNAP_DISTANCE_M.bus;
  const candidates = [];

  for (const segment of prepared.segments) {
    const from = nearestVertex(segment, fromStop);
    if (from.distance > maxSnap) continue;
    const to = nearestVertex(segment, toStop);
    if (to.distance > maxSnap) continue;
    if (to.distAlong <= from.distAlong) continue; // wrong direction on this trace

    candidates.push({ segment, from, to, error: from.distance + to.distance });
  }

  if (candidates.length === 0) return null;

  const bestError = Math.min(...candidates.map((candidate) => candidate.error));
  return candidates
    .filter((candidate) => candidate.error <= bestError + SNAP_TIE_MARGIN_M)
    .reduce((best, candidate) =>
      candidate.from.distAlong > best.from.distAlong ||
      (candidate.from.distAlong === best.from.distAlong && candidate.error < best.error)
        ? candidate
        : best
    );
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
  const rawTarget = directed.from.distAlong - minutesUntil * speed;
  const target = Math.max(0, rawTarget);
  const point = pointAtDistance(directed.segment, target);

  return {
    ...point,
    method: 'route',
    distanceToStop: Math.round(directed.from.distAlong - target),
    // The walk-back ran past the start of the route: the vehicle is at its
    // terminus or still finishing its previous trip.
    atTerminus: rawTarget <= 0,
  };
}

/**
 * Position a vehicle from its estimated-timetable journey.
 *
 * Candidates are upcoming calls expected before the vehicle reaches the
 * monitored stop. A candidate is kept only when it lies upstream of the
 * monitored stop on the directed trace (monitored stop -> destination) and
 * the speed implied between it and the monitored stop is plausible for the
 * mode. The earliest kept call, the one closest to the vehicle, becomes the
 * anchor, and the vehicle is walked back from it at that measured speed.
 *
 * @param {Object} input
 * @param {Object} input.journey             from parseEstimatedTimetable()
 * @param {{lat,lng}} input.monitoredStop    the configured stop
 * @param {number} input.minutesUntil        minutes until the monitored stop (stop monitoring)
 * @param {{lat,lng}|null} input.destinationStop
 * @param {Date} [input.now]
 * @param {string} [input.type]
 * @param {Object|null} prepared
 * @returns {{lat, lng, method, anchorStopName, minutesToAnchor, speedMetersPerMinute}|null}
 */
export function estimateFromTimetable(
  { journey, monitoredStop, minutesUntil, destinationStop, now = new Date(), type = 'bus' },
  prepared
) {
  if (!journey || !prepared || !monitoredStop || !(minutesUntil > 0)) return null;

  const directed = findDirectedSegment(prepared, monitoredStop, destinationStop, type);
  if (!directed) return null;

  const maxSnap = MAX_SNAP_DISTANCE_M[type] ?? MAX_SNAP_DISTANCE_M.bus;
  const bounds = SPEED_BOUNDS_M_PER_MIN[type] ?? SPEED_BOUNDS_M_PER_MIN.bus;
  const nowMs = now.getTime();
  const monitoredAlong = directed.from.distAlong;

  let anchor = null;
  for (const call of journey.calls ?? []) {
    const minutesToCall = (Date.parse(call.time) - nowMs) / 60000;
    if (!(minutesToCall > 0) || minutesToCall >= minutesUntil) continue;

    const stop = resolveStop(prepared, { ref: call.stopRef });
    if (!stop) continue;

    const projected = nearestVertex(directed.segment, stop);
    if (projected.distance > maxSnap) continue;

    const metresToMonitored = monitoredAlong - projected.distAlong;
    if (metresToMonitored < 30) continue; // at or past the monitored stop

    const speed = metresToMonitored / (minutesUntil - minutesToCall);
    if (speed < bounds.min || speed > bounds.max) continue;

    if (!anchor || minutesToCall < anchor.minutesToCall) {
      anchor = { stop, minutesToCall, along: projected.distAlong, speed };
    }
  }

  if (!anchor) return null;

  const rawTarget = anchor.along - anchor.minutesToCall * anchor.speed;
  const target = Math.max(0, rawTarget);
  const point = pointAtDistance(directed.segment, target);

  return {
    ...point,
    method: 'timetable',
    atTerminus: rawTarget <= 0,
    anchorStopName: anchor.stop.name ?? null,
    minutesToAnchor: Math.round(anchor.minutesToCall * 10) / 10,
    speedMetersPerMinute: Math.round(anchor.speed),
    distanceToStop: Math.round(monitoredAlong - target),
  };
}
