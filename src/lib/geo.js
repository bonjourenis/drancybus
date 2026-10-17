/**
 * Small, dependency-free helpers shared by the server and the client.
 */

const EARTH_RADIUS_M = 6371000;

/**
 * Great-circle distance between two {lat, lng} points, in metres.
 */
export function haversineDistance(a, b) {
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return EARTH_RADIUS_M * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/**
 * Lower-case, strip accents and punctuation, collapse whitespace.
 * "Le Bourget <RER>" and "Le Bourget RER" both become "le bourget rer".
 */
export function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/**
 * Extract the trailing numeric identifier shared by the different stop ID
 * formats IDFM uses: "STIF:StopPoint:Q:7948:", "IDFM:7948",
 * "STIF:StopArea:SP:43231:" and "IDFM:monomodalStopPlace:43231".
 * @returns {string|null}
 */
export function numericId(ref) {
  const match = String(ref ?? '').match(/(\d+)(?!.*\d)/);
  return match ? match[1] : null;
}
