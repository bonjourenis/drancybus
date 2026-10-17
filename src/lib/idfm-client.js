/**
 * IDFM PRIM API Client
 * Handles all communication with the Île-de-France Mobilités API
 */

const BASE_URL = process.env.IDFM_API_BASE_URL || 'https://prim.iledefrance-mobilites.fr/marketplace';
const API_KEY = process.env.IDFM_API_KEY;

/**
 * Fetch next departures for a stop
 * @param {string} monitoringRef - Stop ID (format: STIF:StopPoint:Q:XXXXX:)
 * @param {string} [lineRef] - Optional line filter (format: IDFM:CXXXXX)
 * @returns {Promise<Object>} SIRI response
 */
export async function fetchStopDepartures(monitoringRef, lineRef = null) {
  const url = new URL(`${BASE_URL}/stop-monitoring`);
  url.searchParams.append('MonitoringRef', monitoringRef);

  if (lineRef) {
    // Convert IDFM format to STIF format for API
    const stifLineRef = lineRef.replace('IDFM:', 'STIF:Line::') + ':';
    url.searchParams.append('LineRef', stifLineRef);
  }

  const response = await fetch(url.toString(), {
    headers: {
      'apiKey': API_KEY,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IDFM API error: ${response.status} - ${text}`);
  }

  return response.json();
}

/**
 * Fetch line information
 * @param {string} lineRef - Line ID (format: IDFM:CXXXXX)
 * @returns {Promise<Object>} Line information
 */
export async function fetchLineInfo(lineRef) {
  const stifLineRef = lineRef.replace('IDFM:', 'STIF:Line::') + ':';
  const url = new URL(`${BASE_URL}/lines/${encodeURIComponent(stifLineRef)}`);

  const response = await fetch(url.toString(), {
    headers: {
      'apiKey': API_KEY,
      'Accept': 'application/json',
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(`IDFM API error: ${response.status}`);
  }

  return response.json();
}
