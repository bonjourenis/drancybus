/**
 * Position Interpolator
 * Estimates vehicle positions along route shapes based on arrival times
 */

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
 * Find a stop by its ID in the line data
 * @param {Array} stops - Array of ordered stops
 * @param {string} stopId - Stop ID to find
 * @returns {Object|null} Stop object or null
 */
function findStopById(stops, stopId) {
  // Try exact match first
  let stop = stops.find(s => s.id === stopId);
  if (stop) return stop;

  // Try matching the numeric part (IDFM:7948 matches STIF:StopPoint:Q:7948:)
  const match = stopId.match(/(\d+)/);
  if (match) {
    const numericId = match[1];
    stop = stops.find(s => s.id.includes(numericId));
    if (stop) return stop;
  }

  return null;
}

/**
 * Find stop index in ordered stops array
 * @param {Array} stops - Array of ordered stops
 * @param {string} stopId - Stop ID to find
 * @returns {number} Index or -1
 */
function findStopIndex(stops, stopId) {
  const stop = findStopById(stops, stopId);
  if (!stop) return -1;
  return stops.indexOf(stop);
}

/**
 * Interpolate position along route shape
 * @param {Object} lineData - {shape, stops, shapeDistances}
 * @param {number} targetShapeIndex - Target shape index (can be fractional)
 * @returns {Object} {lat, lng}
 */
function interpolateAlongShape(lineData, targetShapeIndex) {
  const { shape } = lineData;

  if (shape.length === 0) return null;

  // Clamp to valid range
  const clampedIndex = Math.max(0, Math.min(shape.length - 1, targetShapeIndex));
  const lowerIndex = Math.floor(clampedIndex);
  const upperIndex = Math.min(lowerIndex + 1, shape.length - 1);
  const fraction = clampedIndex - lowerIndex;

  if (lowerIndex === upperIndex) {
    return { lat: shape[lowerIndex][1], lng: shape[lowerIndex][0] };
  }

  // Linear interpolation between the two points
  const lat = shape[lowerIndex][1] + (shape[upperIndex][1] - shape[lowerIndex][1]) * fraction;
  const lng = shape[lowerIndex][0] + (shape[upperIndex][0] - shape[lowerIndex][0]) * fraction;

  return { lat, lng };
}

/**
 * Estimate vehicle position based on arrival time at a stop
 * @param {Object} departure - Departure info with minutesUntil, etc.
 * @param {Object} lineData - {shape, stops, shapeDistances}
 * @param {string} targetStopId - The stop the vehicle is heading to
 * @returns {Object|null} Estimated {lat, lng}
 */
function estimatePositionOnRoute(departure, lineData, targetStopId) {
  const { shape, stops } = lineData;

  if (!shape || shape.length === 0 || !stops || stops.length === 0) {
    return null;
  }

  // Find the target stop in the ordered stops
  const targetStopIndex = findStopIndex(stops, targetStopId);
  if (targetStopIndex === -1) {
    return null;
  }

  const targetStop = stops[targetStopIndex];
  const minutesUntil = departure.minutesUntil ?? 0;

  // If vehicle is at or very close to the stop
  if (minutesUntil <= 0 || departure.vehicleAtStop) {
    return { lat: targetStop.lat, lng: targetStop.lng };
  }

  // Find the previous stop (where the vehicle might be coming from)
  const prevStopIndex = Math.max(0, targetStopIndex - 1);
  const prevStop = stops[prevStopIndex];

  if (prevStopIndex === targetStopIndex) {
    // At first stop, place vehicle slightly before it on the route
    const shapeIndex = Math.max(0, targetStop.shapeIndex - 10);
    return interpolateAlongShape(lineData, shapeIndex);
  }

  // Estimate position between previous stop and target stop
  // Assume average inter-stop travel time of ~2 minutes for buses
  const avgInterStopTime = 2;
  const stopsAway = Math.min(minutesUntil / avgInterStopTime, targetStopIndex);

  // Calculate which shape segment the vehicle is on
  // Go back proportionally based on time
  const progress = Math.max(0, 1 - (minutesUntil / avgInterStopTime));

  // If we need to go back multiple stops
  if (stopsAway >= 1) {
    // Find the stop that's approximately stopsAway stops back
    const sourceStopIndex = Math.max(0, Math.floor(targetStopIndex - stopsAway));
    const sourceStop = stops[sourceStopIndex];

    // Interpolate between source stop's shape position and next stop
    const nextStop = stops[Math.min(sourceStopIndex + 1, stops.length - 1)];
    const fractionalProgress = stopsAway - Math.floor(stopsAway);

    const shapeIndex = sourceStop.shapeIndex +
      (nextStop.shapeIndex - sourceStop.shapeIndex) * fractionalProgress;

    return interpolateAlongShape(lineData, shapeIndex);
  }

  // Vehicle is between previous stop and target stop
  const shapeIndex = prevStop.shapeIndex +
    (targetStop.shapeIndex - prevStop.shapeIndex) * progress;

  return interpolateAlongShape(lineData, shapeIndex);
}

/**
 * Process departures and estimate positions for all vehicles
 * @param {Array} departures - Array of departure data
 * @param {Map} lineDataMap - Map of lineId -> {shape, stops, shapeDistances}
 * @param {string} currentStopId - Stop ID where departures were fetched
 * @param {Object} currentStopCoords - Fallback {lat, lng} of current stop
 * @returns {Array} Array of vehicles with estimated positions
 */
export function estimateVehiclePositions(departures, lineDataMap, currentStopId, currentStopCoords) {
  const vehicles = [];
  const seenVehicles = new Set();

  for (const departure of departures) {
    // Create a unique ID for the vehicle
    const vehicleId = departure.vehicleRef ||
      `${departure.lineRef}-${departure.destination}-${departure.expectedTime}`;

    if (seenVehicles.has(vehicleId)) continue;
    seenVehicles.add(vehicleId);

    const lineData = lineDataMap.get(departure.lineRef);
    let position = null;

    // Try to estimate position using route shape
    if (lineData && lineData.shape && lineData.shape.length > 0) {
      position = estimatePositionOnRoute(departure, lineData, currentStopId);
    }

    // Fallback: estimate based on current stop coordinates
    if (!position && currentStopCoords) {
      const minutesUntil = departure.minutesUntil ?? 0;

      if (minutesUntil <= 1) {
        position = { ...currentStopCoords };
      } else {
        // Rough offset based on direction (southwest of the stop)
        // ~300m per minute for city buses
        const offset = Math.min(minutesUntil * 0.003, 0.015);
        position = {
          lat: currentStopCoords.lat - offset * 0.7,
          lng: currentStopCoords.lng - offset * 0.7,
        };
      }
    }

    if (position) {
      vehicles.push({
        id: vehicleId,
        lineRef: departure.lineRef,
        lineName: departure.lineName,
        destination: departure.destination,
        position,
        minutesUntil: departure.minutesUntil,
        isRealtime: departure.isRealtime,
        isEstimated: true,
        updatedAt: new Date().toISOString(),
      });
    }
  }

  return vehicles;
}
