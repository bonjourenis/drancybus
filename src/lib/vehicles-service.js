/**
 * Estimated vehicle positions for the map.
 *
 * Every departure shown on the board (same stops, same direction rules)
 * becomes a vehicle, identified by its SIRI dated journey reference so the
 * same bus seen from two stops is one marker. Position is estimated along
 * the route trace, see position-estimator.js.
 */
import favorites from '@/config/favorites.json';
import lineDataFile from '@/data/line-data.json';
import { groupStopsById } from './config-utils';
import { matchesStopConfig } from './direction-filter';
import { safeErrorMessage } from './idfm-client';
import { buildLineLookup, buildLineNames } from './lines';
import { estimateVehiclePosition, getPreparedLine, resolveStop } from './position-estimator';
import { parseDepartures } from './siri-parser';
import { getStopMonitoring } from './stop-monitoring-cache';

const DEFAULT_HORIZON_MINUTES = 30;

export async function getVehicles({
  config = favorites,
  lineData = lineDataFile,
  now = new Date(),
  getMonitoring = getStopMonitoring,
} = {}) {
  const lines = buildLineLookup(config, lineData);
  const lineNames = buildLineNames(config, lineData);
  const horizon = config.settings?.vehicleHorizonMinutes ?? DEFAULT_HORIZON_MINUTES;
  const stops = groupStopsById(config.stops);

  const vehicles = new Map(); // journey id -> vehicle
  const errors = [];
  let stale = false;
  let unplaced = 0;

  await Promise.all(
    stops.map(async (stop) => {
      let result;
      try {
        result = await getMonitoring(stop.id);
      } catch (error) {
        console.error(`[vehicles] ${stop.id}: ${error.message}`);
        errors.push({ stopId: stop.id, message: safeErrorMessage(error), code: error.code ?? null });
        return;
      }
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

        const position = estimateVehiclePosition(
          {
            monitoredStop,
            destinationStop,
            minutesUntil: departure.minutesUntil,
            vehicleAtStop: departure.vehicleAtStop,
            type: meta.type,
          },
          prepared
        );

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
          isEstimated: true,
          updatedAt: new Date(result.fetchedAt).toISOString(),
        });
      }
    })
  );

  return {
    vehicles: Array.from(vehicles.values()).sort((a, b) => a.minutesUntil - b.minutesUntil),
    stale,
    errors,
    unplaced,
    allFailed: stops.length > 0 && errors.length === stops.length,
  };
}
