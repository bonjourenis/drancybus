import { parseISO, differenceInMinutes } from 'date-fns';
import { LINE_NAMES } from './constants';

/**
 * Parse SIRI StopMonitoring response into usable departure data
 * @param {Object} siriResponse - Raw SIRI JSON response
 * @returns {Array<Object>} Parsed departures
 */
export function parseDepartures(siriResponse) {
  const deliveries = siriResponse?.Siri?.ServiceDelivery?.StopMonitoringDelivery;

  if (!deliveries || !Array.isArray(deliveries)) {
    return [];
  }

  const departures = [];

  for (const delivery of deliveries) {
    const visits = delivery.MonitoredStopVisit || [];

    for (const visit of visits) {
      const journey = visit.MonitoredVehicleJourney;
      const call = journey?.MonitoredCall;

      if (!journey || !call) continue;

      // Get expected or aimed departure time
      const expectedTime = call.ExpectedDepartureTime || call.AimedDepartureTime;
      if (!expectedTime) continue;

      const departureTime = parseISO(expectedTime);
      const now = new Date();
      const minutesUntil = differenceInMinutes(departureTime, now);

      // Skip departures that have already passed
      if (minutesUntil < -1) continue;

      const normalizedLineRef = normalizeLineRef(journey.LineRef?.value);
      departures.push({
        id: visit.ItemIdentifier || `${journey.LineRef?.value}-${expectedTime}`,
        lineRef: normalizedLineRef,
        lineName: extractLineName(normalizedLineRef),
        destination: journey.DestinationName?.[0]?.value || 'Inconnu',
        destinationRef: journey.DestinationRef?.value,
        expectedTime: departureTime.toISOString(),
        aimedTime: call.AimedDepartureTime || null,
        minutesUntil: Math.max(0, minutesUntil),
        departureStatus: call.DepartureStatus || 'unknown',
        vehicleRef: journey.VehicleRef?.value,
        vehicleAtStop: call.VehicleAtStop === true,
        // Format for display
        displayTime: formatDisplayTime(minutesUntil, call.VehicleAtStop),
        isRealtime: !!call.ExpectedDepartureTime,
      });
    }
  }

  // Sort by departure time
  return departures.sort((a, b) => a.minutesUntil - b.minutesUntil);
}

/**
 * Parse vehicle positions from SIRI response
 * @param {Object} siriResponse - Raw SIRI JSON response
 * @param {string[]} lineFilter - Line IDs to include (IDFM format)
 * @returns {Array<Object>} Parsed vehicle positions
 */
export function parseVehiclePositions(siriResponse, lineFilter = []) {
  const deliveries = siriResponse?.Siri?.ServiceDelivery?.StopMonitoringDelivery;

  if (!deliveries || !Array.isArray(deliveries)) {
    return [];
  }

  const vehicles = new Map(); // Use Map to deduplicate by vehicleRef

  for (const delivery of deliveries) {
    const visits = delivery.MonitoredStopVisit || [];

    for (const visit of visits) {
      const journey = visit.MonitoredVehicleJourney;

      if (!journey) continue;

      const lineRef = normalizeLineRef(journey.LineRef?.value);

      // Filter by tracked lines if specified
      if (lineFilter.length > 0 && !lineFilter.includes(lineRef)) {
        continue;
      }

      const vehicleRef = journey.VehicleRef?.value;
      if (!vehicleRef) continue;

      // VehicleLocation contains GPS coordinates when available
      const location = journey.VehicleLocation;
      if (!location?.Longitude || !location?.Latitude) continue;

      vehicles.set(vehicleRef, {
        id: vehicleRef,
        lineRef,
        lineName: extractLineName(lineRef),
        destination: journey.DestinationName?.[0]?.value || 'Inconnu',
        position: {
          lat: parseFloat(location.Latitude),
          lng: parseFloat(location.Longitude),
        },
        bearing: journey.Bearing ? parseFloat(journey.Bearing) : null,
        updatedAt: visit.RecordedAtTime ? parseISO(visit.RecordedAtTime).toISOString() : new Date().toISOString(),
      });
    }
  }

  return Array.from(vehicles.values());
}

/**
 * Normalize line reference to IDFM format
 * @param {string} lineRef - Line reference from API (STIF:Line::CXXXXX:)
 * @returns {string} Normalized line ref (IDFM:CXXXXX)
 */
function normalizeLineRef(lineRef) {
  if (!lineRef) return '';
  // Convert STIF:Line::C01173: to IDFM:C01173
  const match = lineRef.match(/(?:STIF:Line::)?(C\d+)/);
  if (match) {
    return `IDFM:${match[1]}`;
  }
  return lineRef;
}

/**
 * Extract line name from line reference
 * @param {string} lineRef - Line reference (normalized IDFM format)
 * @returns {string} Line name
 */
function extractLineName(lineRef) {
  if (!lineRef) return '?';
  // First check if we have a known line name mapping
  if (LINE_NAMES[lineRef]) {
    return LINE_NAMES[lineRef];
  }
  // Fallback: Extract number from C01173 -> 173
  const match = lineRef.match(/C0*(\d+)/);
  if (match) {
    return match[1];
  }
  return lineRef;
}

/**
 * Format display time for departure
 * @param {number} minutesUntil - Minutes until departure
 * @param {boolean} vehicleAtStop - Whether vehicle is at the stop
 * @returns {string} Formatted display time
 */
function formatDisplayTime(minutesUntil, vehicleAtStop) {
  if (vehicleAtStop) {
    return 'À quai';
  }
  if (minutesUntil <= 0) {
    return 'Proche';
  }
  if (minutesUntil === 1) {
    return '1 min';
  }
  return `${minutesUntil} min`;
}
