/**
 * IDFM PRIM API client. Server-side only: it needs the API key.
 */
import { UPSTREAM_TIMEOUT_MS } from './constants';

const BASE_URL = process.env.IDFM_API_BASE_URL || 'https://prim.iledefrance-mobilites.fr/marketplace';

export class IdfmApiError extends Error {
  constructor(message, { status = null, code = 'UPSTREAM' } = {}) {
    super(message);
    this.name = 'IdfmApiError';
    this.status = status;
    this.code = code; // NO_API_KEY | TIMEOUT | NETWORK | UPSTREAM
  }
}

export function getApiKey() {
  const key = process.env.IDFM_API_KEY;
  if (!key) {
    throw new IdfmApiError('IDFM_API_KEY is not configured', { code: 'NO_API_KEY' });
  }
  return key;
}

/**
 * A message that is safe to send to the browser: our own wording only, never
 * the upstream response body.
 */
export function safeErrorMessage(error) {
  if (error instanceof IdfmApiError) return error.message;
  return 'Erreur interne';
}

/** IDFM:C01173 -> STIF:Line::C01173: (the format PRIM expects in LineRef) */
export function toStifLineRef(lineId) {
  const match = String(lineId ?? '').match(/(C\d+)/);
  return match ? `STIF:Line::${match[1]}:` : String(lineId ?? '');
}

async function fetchSiri(path, params, { timeoutMs = UPSTREAM_TIMEOUT_MS, fetchImpl = fetch, label = path } = {}) {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/${path}`);
  for (const [name, value] of Object.entries(params)) {
    url.searchParams.set(name, value);
  }

  let response;
  try {
    response = await fetchImpl(url, {
      headers: { apiKey, Accept: 'application/json' },
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    const timedOut = error?.name === 'TimeoutError' || error?.name === 'AbortError';
    throw new IdfmApiError(
      timedOut
        ? `IDFM request timed out after ${timeoutMs} ms`
        : `IDFM request failed: ${error?.message ?? 'unknown error'}`,
      { code: timedOut ? 'TIMEOUT' : 'NETWORK' }
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error(`[idfm] HTTP ${response.status} for ${path} ${label}: ${body.slice(0, 500)}`);
    throw new IdfmApiError(`IDFM API responded with HTTP ${response.status}`, {
      status: response.status,
    });
  }

  return response.json();
}

/**
 * SIRI StopMonitoring: next visits at one stop, all lines.
 * @param {string} monitoringRef  e.g. STIF:StopPoint:Q:7948: or STIF:StopArea:SP:43231:
 */
export function fetchStopMonitoring(monitoringRef, options = {}) {
  return fetchSiri('stop-monitoring', { MonitoringRef: monitoringRef }, { ...options, label: monitoringRef });
}

/**
 * SIRI EstimatedTimetable: every running journey on one line with its
 * upcoming calls and expected times. No GPS, only times.
 * @param {string} lineId  e.g. IDFM:C01173
 */
export function fetchEstimatedTimetable(lineId, options = {}) {
  return fetchSiri('estimated-timetable', { LineRef: toStifLineRef(lineId) }, { ...options, label: lineId });
}
