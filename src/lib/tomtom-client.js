/**
 * TomTom Routing API with live traffic. Server-side only: it needs the key.
 * https://docs.tomtom.com/routing-api/documentation/tomtom-maps/calculate-route
 */
import { TRAFFIC_LEVELS, UPSTREAM_TIMEOUT_MS } from './constants';

const BASE_URL = process.env.TOMTOM_API_BASE_URL || 'https://api.tomtom.com';

export class TrafficApiError extends Error {
  constructor(message, { status = null, code = 'UPSTREAM', safeMessage = null } = {}) {
    super(message);
    this.name = 'TrafficApiError';
    this.status = status;
    this.code = code; // NO_API_KEY | AUTH | QUOTA | NO_ROUTE | TIMEOUT | NETWORK | UPSTREAM
    this.safeMessage = safeMessage ?? message;
  }
}

export function getTrafficApiKey() {
  return process.env.TOMTOM_API_KEY || null;
}

const SAFE_MESSAGES = {
  403: 'Clé TomTom refusée',
  429: 'Quota TomTom dépassé',
  400: 'Itinéraire introuvable',
};

/**
 * @param {Array<{lat:number,lng:number}>} locations  origin and destination (or more waypoints)
 * @param {Object} [options]
 * @param {Array<{lat:number,lng:number}>} [options.supportingPoints]
 *        A path to follow, origin first and destination last. TomTom then
 *        reconstructs that exact route instead of choosing the fastest one,
 *        and computes its travel time with live traffic.
 */
export async function fetchRouteWithTraffic(
  locations,
  { apiKey = getTrafficApiKey(), supportingPoints = null, timeoutMs = UPSTREAM_TIMEOUT_MS, fetchImpl = fetch } = {}
) {
  if (!apiKey) {
    throw new TrafficApiError('TOMTOM_API_KEY is not configured', {
      code: 'NO_API_KEY',
      safeMessage: 'Clé TomTom non configurée',
    });
  }

  const path = locations.map(({ lat, lng }) => `${lat.toFixed(6)},${lng.toFixed(6)}`).join(':');
  const url = new URL(`${BASE_URL}/routing/1/calculateRoute/${path}/json`);
  url.searchParams.set('key', apiKey);
  url.searchParams.set('traffic', 'true');
  url.searchParams.set('travelMode', 'car');
  url.searchParams.set('routeType', 'fastest');
  url.searchParams.set('computeTravelTimeFor', 'all');
  url.searchParams.set('sectionType', 'traffic');

  const reconstruct = Array.isArray(supportingPoints) && supportingPoints.length >= 2;

  let response;
  try {
    response = await fetchImpl(url, {
      method: reconstruct ? 'POST' : 'GET',
      headers: reconstruct
        ? { Accept: 'application/json', 'Content-Type': 'application/json' }
        : { Accept: 'application/json' },
      body: reconstruct
        ? JSON.stringify({
            supportingPoints: supportingPoints.map(({ lat, lng }) => ({ latitude: lat, longitude: lng })),
          })
        : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new TrafficApiError(timedOut ? `TomTom request timed out after ${timeoutMs} ms` : 'TomTom request failed', {
      code: timedOut ? 'TIMEOUT' : 'NETWORK',
      safeMessage: 'Service trafic injoignable',
    });
  }

  if (!response.ok) {
    // Never log the URL: it carries the API key.
    const body = await response.text().catch(() => '');
    console.error(`[traffic] TomTom HTTP ${response.status}: ${body.slice(0, 300)}`);
    const code = { 403: 'AUTH', 429: 'QUOTA', 400: 'NO_ROUTE' }[response.status] ?? 'UPSTREAM';
    throw new TrafficApiError(`TomTom responded with HTTP ${response.status}`, {
      status: response.status,
      code,
      safeMessage: SAFE_MESSAGES[response.status] ?? 'Service trafic indisponible',
    });
  }

  return response.json();
}

const INCIDENT_LABELS = {
  JAM: 'Bouchon',
  ROAD_WORK: 'Travaux',
  ROAD_CLOSURE: 'Route fermée',
  OTHER: 'Incident',
};

/** Summary of the first route in a calculateRoute response. */
export function parseRoute(json) {
  const route = json?.routes?.[0];
  const summary = route?.summary;
  if (!summary || !Number.isFinite(summary.travelTimeInSeconds)) {
    throw new TrafficApiError('TomTom response has no route summary', {
      code: 'UPSTREAM',
      safeMessage: 'Réponse trafic invalide',
    });
  }

  const incidents = (route.sections ?? [])
    .filter((section) => section.sectionType === 'TRAFFIC')
    .map((section) => ({
      category: section.simpleCategory ?? 'OTHER',
      label: INCIDENT_LABELS[section.simpleCategory] ?? INCIDENT_LABELS.OTHER,
      magnitude: section.magnitudeOfDelay ?? 0,
      delaySeconds: section.delayInSeconds ?? 0,
      speedKmh: section.effectiveSpeedInKmh ?? null,
    }));

  return {
    lengthMeters: summary.lengthInMeters ?? null,
    travelSeconds: summary.travelTimeInSeconds,
    delaySeconds: summary.trafficDelayInSeconds ?? 0,
    freeFlowSeconds: summary.noTrafficTravelTimeInSeconds ?? null,
    typicalSeconds: summary.historicTrafficTravelTimeInSeconds ?? null,
    incidents,
  };
}

export const LEVEL_LABELS = {
  fluid: 'Fluide',
  slow: 'Ralenti',
  heavy: 'Dense',
  blocked: 'Route fermée',
};

export function trafficLevel({ travelSeconds, freeFlowSeconds, delaySeconds, incidents = [] }) {
  if (incidents.some((incident) => incident.category === 'ROAD_CLOSURE')) return 'blocked';
  const baseline = freeFlowSeconds || travelSeconds - (delaySeconds ?? 0);
  const delay = travelSeconds - baseline;
  if (!(baseline > 0) || delay < TRAFFIC_LEVELS.minDelaySeconds) return 'fluid';
  const ratio = travelSeconds / baseline;
  if (ratio >= TRAFFIC_LEVELS.heavyRatio) return 'heavy';
  if (ratio >= TRAFFIC_LEVELS.slowRatio) return 'slow';
  return 'fluid';
}
