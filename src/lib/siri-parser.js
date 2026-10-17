import { parseISO, differenceInMinutes, isValid } from 'date-fns';
import { shortNameFromLineId } from './config-utils';

/**
 * Parse a SIRI StopMonitoring response into departure objects.
 *
 * @param {Object} siriResponse  Raw SIRI JSON
 * @param {Object} [options]
 * @param {Date}   [options.now]        Reference time (injectable for tests)
 * @param {Object} [options.lineNames]  lineRef -> display name
 */
export function parseDepartures(siriResponse, { now = new Date(), lineNames = {} } = {}) {
  const deliveries = siriResponse?.Siri?.ServiceDelivery?.StopMonitoringDelivery;
  if (!Array.isArray(deliveries)) return [];

  const departures = [];

  for (const delivery of deliveries) {
    for (const visit of delivery?.MonitoredStopVisit ?? []) {
      const journey = visit?.MonitoredVehicleJourney;
      const call = journey?.MonitoredCall;
      if (!journey || !call) continue;

      const expectedRaw = call.ExpectedDepartureTime || call.AimedDepartureTime;
      if (!expectedRaw) continue;

      const departureTime = parseISO(expectedRaw);
      if (!isValid(departureTime)) continue;

      const minutesUntil = differenceInMinutes(departureTime, now);
      if (minutesUntil < -1) continue; // already gone

      const lineRef = normalizeLineRef(journey.LineRef?.value);
      const journeyRef = journey.FramedVehicleJourneyRef?.DatedVehicleJourneyRef || null;
      const vehicleAtStop = call.VehicleAtStop === true;
      const aimedTime = call.AimedDepartureTime || null;

      departures.push({
        id: visit.ItemIdentifier || `${journeyRef || lineRef}|${aimedTime || expectedRaw}`,
        journeyRef,
        lineRef,
        lineName: lineNames[lineRef] || shortNameFromLineId(lineRef),
        destination: journey.DestinationName?.[0]?.value || 'Inconnu',
        destinationRef: journey.DestinationRef?.value || null,
        directionRef: journey.DirectionRef?.value || null,
        expectedTime: departureTime.toISOString(),
        aimedTime,
        minutesUntil: Math.max(0, minutesUntil),
        departureStatus: call.DepartureStatus || 'unknown',
        vehicleAtStop,
        displayTime: formatDisplayTime(minutesUntil, vehicleAtStop),
        isRealtime: Boolean(call.ExpectedDepartureTime),
      });
    }
  }

  return departures.sort((a, b) => a.minutesUntil - b.minutesUntil);
}

/**
 * STIF:Line::C01173: -> IDFM:C01173. Unknown formats are returned unchanged.
 */
export function normalizeLineRef(lineRef) {
  if (!lineRef) return '';
  const match = String(lineRef).match(/(?:STIF:Line::)?(C\d+)/);
  return match ? `IDFM:${match[1]}` : String(lineRef);
}

function formatDisplayTime(minutesUntil, vehicleAtStop) {
  if (vehicleAtStop) return 'À quai';
  if (minutesUntil <= 0) return 'Proche';
  return `${minutesUntil} min`;
}
