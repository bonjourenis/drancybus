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

/**
 * Parse a SIRI EstimatedTimetable response into journeys with their upcoming
 * calls, sorted by time. PRIM only publishes calls that are still ahead of
 * the vehicle (none in the past), and not necessarily every stop.
 *
 * @param {Object} siriResponse  Raw SIRI JSON
 * @param {Object} [options]
 * @param {Date}   [options.now]  Reference time (injectable for tests)
 */
export function parseEstimatedTimetable(siriResponse, { now = new Date() } = {}) {
  const deliveries = siriResponse?.Siri?.ServiceDelivery?.EstimatedTimetableDelivery;
  if (!Array.isArray(deliveries)) return [];

  const nowMs = now.getTime();
  const journeys = [];

  for (const delivery of deliveries) {
    for (const frame of delivery?.EstimatedJourneyVersionFrame ?? []) {
      for (const journey of frame?.EstimatedVehicleJourney ?? []) {
        const journeyRef =
          journey?.DatedVehicleJourneyRef?.value ||
          journey?.FramedVehicleJourneyRef?.DatedVehicleJourneyRef ||
          null;
        if (!journeyRef) continue;

        const calls = [];
        for (const call of journey.EstimatedCalls?.EstimatedCall ?? []) {
          const stopRef = call?.StopPointRef?.value;
          const raw =
            call?.ExpectedDepartureTime ||
            call?.ExpectedArrivalTime ||
            call?.AimedDepartureTime ||
            call?.AimedArrivalTime;
          if (!stopRef || !raw) continue;
          const time = parseISO(raw);
          if (!isValid(time)) continue;

          calls.push({
            stopRef,
            time: time.toISOString(),
            minutesFromNow: Math.round(((time.getTime() - nowMs) / 60000) * 10) / 10,
            isRealtime: Boolean(call.ExpectedDepartureTime || call.ExpectedArrivalTime),
          });
        }
        calls.sort((a, b) => a.time.localeCompare(b.time));

        journeys.push({
          journeyRef,
          lineRef: normalizeLineRef(journey.LineRef?.value),
          destination: journey.DestinationName?.[0]?.value || 'Inconnu',
          destinationRef: journey.DestinationRef?.value || null,
          directionRef: journey.DirectionRef?.value || null,
          recordedAt: journey.RecordedAtTime || null,
          calls,
        });
      }
    }
  }

  return journeys;
}
