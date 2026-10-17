/**
 * Line data fetching and caching
 * Fetches stop coordinates and route shapes from IDFM Open Data API
 */

const IDFM_DATA_API = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets';

// Cache for line data
const lineDataCache = new Map();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Get line short name from line ID
 * @param {string} lineId - Line ID (format: IDFM:C01173)
 * @returns {string} Short name (e.g., "148")
 */
function getLineShortName(lineId) {
  const mapping = {
    'IDFM:C01173': '148',
    'IDFM:C01171': '146',
    'IDFM:C01375': '5',
    'IDFM:C01742': 'B',
  };
  return mapping[lineId] || lineId.replace('IDFM:C0', '');
}

/**
 * Calculate distance between two points using Haversine formula
 * @param {Object} point1 - {lat, lng}
 * @param {Object} point2 - {lat, lng}
 * @returns {number} Distance in meters
 */
function haversineDistance(point1, point2) {
  const R = 6371000;
  const lat1 = point1.lat * Math.PI / 180;
  const lat2 = point2.lat * Math.PI / 180;
  const dLat = (point2.lat - point1.lat) * Math.PI / 180;
  const dLng = (point2.lng - point1.lng) * Math.PI / 180;

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Find the closest point on a polyline to a given point
 * @param {Array} polyline - Array of [lng, lat] coordinates
 * @param {Object} point - {lat, lng}
 * @returns {Object} {index, distance, position}
 */
function findClosestPointOnLine(polyline, point) {
  let minDist = Infinity;
  let closestIndex = 0;

  for (let i = 0; i < polyline.length; i++) {
    const p = { lat: polyline[i][1], lng: polyline[i][0] };
    const dist = haversineDistance(point, p);
    if (dist < minDist) {
      minDist = dist;
      closestIndex = i;
    }
  }

  return {
    index: closestIndex,
    distance: minDist,
    position: { lat: polyline[closestIndex][1], lng: polyline[closestIndex][0] }
  };
}

/**
 * Fetch route shape (polyline) for a line
 * @param {string} lineId - Line ID (format: IDFM:C01173)
 * @returns {Promise<Array>} Array of [lng, lat] coordinates
 */
async function fetchLineShape(lineId) {
  const shortName = getLineShortName(lineId);

  try {
    const url = new URL(`${IDFM_DATA_API}/traces-des-lignes-de-transport-en-commun-idfm/records`);
    url.searchParams.append('where', `route_short_name="${shortName}"`);
    url.searchParams.append('limit', '1');

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error(`Failed to fetch line shape: ${response.status}`);
      return [];
    }

    const data = await response.json();
    const record = data.results?.[0];

    if (record?.shape?.geometry?.coordinates) {
      const coords = record.shape.geometry.coordinates;
      // MultiLineString - flatten all segments
      if (coords[0] && Array.isArray(coords[0][0])) {
        return coords.flat();
      }
      return coords;
    }

    return [];
  } catch (error) {
    console.error(`Error fetching line shape for ${lineId}:`, error);
    return [];
  }
}

/**
 * Fetch all stops for a line with coordinates
 * @param {string} lineId - Line ID (format: IDFM:C01173)
 * @returns {Promise<Array>} Array of stops with coordinates
 */
async function fetchLineStopsRaw(lineId) {
  try {
    const url = new URL(`${IDFM_DATA_API}/arrets-lignes/records`);
    url.searchParams.append('where', `id="${lineId}"`);
    url.searchParams.append('limit', '100');
    url.searchParams.append('select', 'stop_id,stop_name,stop_lat,stop_lon');

    const response = await fetch(url.toString(), {
      headers: { 'Accept': 'application/json' },
    });

    if (!response.ok) {
      console.error(`Failed to fetch line stops: ${response.status}`);
      return [];
    }

    const data = await response.json();
    return (data.results || [])
      .map(record => ({
        id: record.stop_id,
        name: record.stop_name,
        lat: parseFloat(record.stop_lat),
        lng: parseFloat(record.stop_lon),
      }))
      .filter(s => !isNaN(s.lat) && !isNaN(s.lng));
  } catch (error) {
    console.error(`Error fetching line stops for ${lineId}:`, error);
    return [];
  }
}

/**
 * Fetch complete line data: stops ordered along the route shape
 * @param {string} lineId - Line ID (format: IDFM:C01173)
 * @returns {Promise<Object>} {shape: Array, stops: Array (ordered)}
 */
export async function fetchLineData(lineId) {
  // Check cache first
  const cached = lineDataCache.get(lineId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  // Fetch shape and stops in parallel
  const [shape, stopsRaw] = await Promise.all([
    fetchLineShape(lineId),
    fetchLineStopsRaw(lineId),
  ]);

  if (shape.length === 0 || stopsRaw.length === 0) {
    const result = { shape: [], stops: stopsRaw, shapeDistances: [] };
    lineDataCache.set(lineId, { data: result, timestamp: Date.now() });
    return result;
  }

  // Find each stop's position along the route shape
  const stopsWithPosition = stopsRaw.map(stop => {
    const closest = findClosestPointOnLine(shape, stop);
    return {
      ...stop,
      shapeIndex: closest.index,
      distanceToShape: closest.distance,
    };
  });

  // Sort stops by their position along the route
  stopsWithPosition.sort((a, b) => a.shapeIndex - b.shapeIndex);

  // Calculate cumulative distances along the shape for interpolation
  const shapeDistances = [0];
  for (let i = 1; i < shape.length; i++) {
    const prev = { lat: shape[i-1][1], lng: shape[i-1][0] };
    const curr = { lat: shape[i][1], lng: shape[i][0] };
    shapeDistances.push(shapeDistances[i-1] + haversineDistance(prev, curr));
  }

  const result = {
    shape,
    stops: stopsWithPosition,
    shapeDistances,
    totalLength: shapeDistances[shapeDistances.length - 1],
  };

  // Cache the result
  lineDataCache.set(lineId, {
    data: result,
    timestamp: Date.now(),
  });

  return result;
}

/**
 * Get line data for multiple lines
 * @param {string[]} lineIds - Array of line IDs
 * @returns {Promise<Map>} Map of lineId -> line data
 */
export async function fetchMultipleLinesData(lineIds) {
  const results = new Map();

  await Promise.all(
    lineIds.map(async (lineId) => {
      const data = await fetchLineData(lineId);
      results.set(lineId, data);
    })
  );

  return results;
}

// Keep backward compatibility
export async function fetchLineStops(lineId) {
  const data = await fetchLineData(lineId);
  return data.stops;
}
