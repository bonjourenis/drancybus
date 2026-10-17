/**
 * Estimated vehicle positions for the map.
 *
 * Which vehicles to show, and how far they are from the configured stops,
 * comes from stop monitoring (same stops and direction rules as the board).
 * Where to draw them comes from the estimated timetable when the journey is
 * in that feed: the vehicle's nearest upcoming call is a much closer anchor
 * than the configured stop, and the gap to the following call gives a
 * measured speed. Journeys missing from the timetable fall back to walking
 * back from the configured stop at the mode's average speed.
 *
 * Vehicles are identified by their SIRI dated journey reference so the same
 * bus seen from two stops is one marker.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { groupStopsById } from './config-utils';
import { matchesStopConfig } from './direction-filter';
import { getEstimatedTimetable } from './estimated-timetable-cache';
import { safeErrorMessage } from './idfm-client';
import { buildLineLookup, buildLineNames } from './lines';
import {
  estimateFromTimetable,
  estimateVehiclePosition,
  getPreparedLine,
  resolveStop,
} from './position-estimator';
import { parseDepartures, parseEstimatedTimetable } from './siri-parser';
import { getStopMonitoring } from './stop-monitoring-cache';

const DEFAULT_HORIZON_MINUTES = 30;

export async function getVehicles({
  config = favorites,
  lineData = lineDataFile,
  now = new Date(),
  getMonitoring = getStopMonitoring,
  getTimetable = getEstimatedTimetable,
} = {}) {
  const lines = buildLineLookup(config, lineData);
  const lineNames = buildLineNames(config, lineData);
  const horizon = config.settings?.vehicleHorizonMinutes ?? DEFAULT_HORIZON_MINUTES;
  const stops = groupStopsById(config.stops);

  // Only lines that can produce vehicles: tracked lines listed at a configured stop.
  const timetableLineIds = [
    ...new Set(stops.flatMap((stop) => (stop.lines ?? []).map((line) => line.lineId))),
  ].filter((lineId) => lines.has(lineId));

  const errors = [];
  const timetable = { lines: [], errors: [] };
  const journeys = new Map(); // journeyRef -> parsed journey
  let stale = false;

  const [monitoring] = await Promise.all([
    Promise.all(
      stops.map(async (stop) => {
        try {
          return { stop, result: await getMonitoring(stop.id) };
        } catch (error) {
          console.error(`[vehicles] ${stop.id}: ${error.message}`);
          errors.push({ stopId: stop.id, message: safeErrorMessage(error), code: error.code ?? null });
          return { stop, result: null };
        }
      })
    ),
    Promise.all(
      timetableLineIds.map(async (lineId) => {
        try {
          const result = await getTimetable(lineId);
          if (result.stale) stale = true;
          for (const journey of parseEstimatedTimetable(result.data, { now })) {
            journeys.set(journey.journeyRef, journey);
          }
          timetable.lines.push(lineId);
        } catch (error) {
          console.error(`[vehicles] timetable ${lineId}: ${error.message}`);
          timetable.errors.push({ lineId, message: safeErrorMessage(error), code: error.code ?? null });
        }
      })
    ),
  ]);

  const vehicles = new Map(); // journey id -> vehicle
  let unplaced = 0;

  for (const { stop, result } of monitoring) {
    if (!result) continue;
    if (result.stale) stale = true;

    const departures = parseDepartures(result.data, { now, lineNames });

    for (const departure of departures) {
      const meta = lines.get(departure.lineRef);
      if (!meta) continue; // not a tracked line
      if (!matchesStopConfig(departure, stop)) continue;
      if (departure.minutesUntil > horizon) continue;

      const id =
        departure.journeyRef ||
        `${departure.lineRef}|${departure.destinationRef || departure.destination}|${departure.aimedTime || departure.expectedTime}`;

      // Keep the sighting closest to a stop: it is the most accurate one.
      const existing = vehicles.get(id);
      if (existing && existing.minutesUntil <= departure.minutesUntil) continue;

      const prepared = getPreparedLine(lineData?.lines?.[departure.lineRef]);
      const monitoredStop = prepared
        ? resolveStop(prepared, { ref: stop.id, fallback: stop.coordinates ?? null })
        : stop.coordinates ?? null;
      const destinationStop = prepared
        ? resolveStop(prepared, { ref: departure.destinationRef, name: departure.destination })
        : null;

      let position = null;
      const journey = departure.journeyRef ? journeys.get(departure.journeyRef) : null;
      if (journey && !departure.vehicleAtStop && departure.minutesUntil > 0) {
        position = estimateFromTimetable({ journey, destinationStop, now, type: meta.type }, prepared);
      }
      if (!position) {
        position = estimateVehiclePosition(
          {
            monitoredStop,
            destinationStop,
            minutesUntil: departure.minutesUntil,
            vehicleAtStop: departure.vehicleAtStop,
            type: meta.type,
          },
          prepared
        );
      }

      if (!position) {
        if (!existing) unplaced += 1;
        continue;
      }

      vehicles.set(id, {
        id,
        lineRef: departure.lineRef,
        lineName: meta.shortName,
        type: meta.type,
        color: meta.color,
        destination: departure.destination,
        destinationRef: departure.destinationRef,
        minutesUntil: departure.minutesUntil,
        displayTime: departure.displayTime,
        isRealtime: departure.isRealtime,
        vehicleAtStop: departure.vehicleAtStop,
        nextStopId: stop.id,
        nextStopName: stop.name,
        position: { lat: position.lat, lng: position.lng },
        positionMethod: position.method,
        anchorStopName: position.anchorStopName ?? null,
        minutesToAnchor: position.minutesToAnchor ?? null,
        isEstimated: true,
        updatedAt: new Date(result.fetchedAt).toISOString(),
      });
    }
  }

  return {
    vehicles: Array.from(vehicles.values()).sort((a, b) => a.minutesUntil - b.minutesUntil),
    stale,
    errors,
    unplaced,
    timetable,
    allFailed: stops.length > 0 && errors.length === stops.length,
  };
}
