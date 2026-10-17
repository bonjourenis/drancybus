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

/**
 * Fetch the SIRI StopMonitoring feed for one stop (all lines serving it).
 * @param {string} monitoringRef  e.g. STIF:StopPoint:Q:7948: or STIF:StopArea:SP:43231:
 */
export async function fetchStopMonitoring(
  monitoringRef,
  { timeoutMs = UPSTREAM_TIMEOUT_MS, fetchImpl = fetch } = {}
) {
  const apiKey = getApiKey();
  const url = new URL(`${BASE_URL}/stop-monitoring`);
  url.searchParams.set('MonitoringRef', monitoringRef);

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
    console.error(`[idfm] HTTP ${response.status} for ${monitoringRef}: ${body.slice(0, 500)}`);
    throw new IdfmApiError(`IDFM API responded with HTTP ${response.status}`, {
      status: response.status,
    });
  }

  return response.json();
}
