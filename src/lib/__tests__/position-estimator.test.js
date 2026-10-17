import { describe, expect, it } from 'vitest';
import { haversineDistance } from '../geo';
import {
  estimateVehiclePosition,
  pointAtDistance,
  prepareLine,
  resolveStop,
} from '../position-estimator';

// A straight east-west route at latitude 48.92, one point every 0.001 deg
// (about 73 m). Segment 0 runs west -> east, segment 1 is the return trip.
const LAT = 48.92;
const eastbound = Array.from({ length: 61 }, (_, i) => [LAT, 2.4 + i * 0.001]);
const westbound = [...eastbound].reverse();

const stopA = { id: 'IDFM:1001', name: 'Alpha', lat: LAT, lng: 2.41 };
const stopB = { id: 'IDFM:1002', name: 'Bravo - Centre', lat: LAT, lng: 2.43 };
const stopC = { id: 'IDFM:1003', name: 'Charlie', lat: LAT, lng: 2.45 };

const record = { segments: [eastbound, westbound], stops: [stopA, stopB, stopC] };
const prepared = prepareLine(record);

describe('prepareLine', () => {
  it('computes cumulative distances per segment', () => {
    expect(prepared.segments).toHaveLength(2);
    const { cum, length } = prepared.segments[0];
    expect(cum[0]).toBe(0);
    expect(length).toBeGreaterThan(4000);
    expect(length).toBeLessThan(4600);
    for (let i = 1; i < cum.length; i++) expect(cum[i]).toBeGreaterThan(cum[i - 1]);
  });
});

describe('resolveStop', () => {
  it('matches the numeric part of any SIRI reference format', () => {
    expect(resolveStop(prepared, { ref: 'STIF:StopPoint:Q:1002:' })).toMatchObject({ lat: LAT, lng: 2.43 });
    expect(resolveStop(prepared, { ref: 'STIF:StopArea:SP:1003:' })).toMatchObject({ lng: 2.45 });
    expect(resolveStop(prepared, { ref: 'IDFM:monomodalStopPlace:1001' })).toMatchObject({ lng: 2.41 });
  });

  it('falls back to a normalized name match, then to the fallback', () => {
    expect(resolveStop(prepared, { ref: 'STIF:StopPoint:Q:999:', name: 'BRAVO <Centre>' })).toMatchObject({ lng: 2.43 });
    expect(resolveStop(prepared, { name: 'Charlie (Terminus)' })).toMatchObject({ lng: 2.45 });
    expect(resolveStop(prepared, { name: 'Nowhere', fallback: { lat: 1, lng: 2 } })).toEqual({ lat: 1, lng: 2 });
    expect(resolveStop(prepared, { name: 'Nowhere' })).toBeNull();
  });
});

describe('pointAtDistance', () => {
  it('interpolates along the segment and clamps to its ends', () => {
    const segment = prepared.segments[0];
    const start = pointAtDistance(segment, -5);
    expect(start.lat).toBeCloseTo(LAT, 6);
    expect(start.lng).toBeCloseTo(2.4, 6);
    const end = pointAtDistance(segment, segment.length + 5);
    expect(end.lat).toBeCloseTo(LAT, 6);
    expect(end.lng).toBeCloseTo(2.46, 6);

    const halfway = pointAtDistance(segment, segment.length / 2);
    expect(halfway.lng).toBeCloseTo(2.43, 3);
  });
});

describe('estimateVehiclePosition', () => {
  it('places the vehicle at the stop when it is there or due now', () => {
    const base = { monitoredStop: stopB, destinationStop: stopC, type: 'bus' };
    expect(estimateVehiclePosition({ ...base, minutesUntil: 0 }, prepared)).toMatchObject({ lat: LAT, lng: 2.43, method: 'at-stop' });
    expect(estimateVehiclePosition({ ...base, minutesUntil: 7, vehicleAtStop: true }, prepared)).toMatchObject({ method: 'at-stop' });
  });

  it('walks back from the stop against the direction of travel', () => {
    // Heading east to Charlie: 2 min at 250 m/min puts the bus 500 m west of Bravo.
    const east = estimateVehiclePosition(
      { monitoredStop: stopB, destinationStop: stopC, minutesUntil: 2, type: 'bus' },
      prepared
    );
    expect(east.method).toBe('route');
    expect(east.lng).toBeLessThan(stopB.lng);
    expect(haversineDistance(east, stopB)).toBeCloseTo(500, -1);

    // Same stop, heading west to Alpha: the bus must be east of Bravo.
    const west = estimateVehiclePosition(
      { monitoredStop: stopB, destinationStop: stopA, minutesUntil: 2, type: 'bus' },
      prepared
    );
    expect(west.lng).toBeGreaterThan(stopB.lng);
    expect(haversineDistance(west, stopB)).toBeCloseTo(500, -1);
  });

  it('uses the mode speed', () => {
    const bus = estimateVehiclePosition({ monitoredStop: stopB, destinationStop: stopC, minutesUntil: 1, type: 'bus' }, prepared);
    const rer = estimateVehiclePosition({ monitoredStop: stopB, destinationStop: stopC, minutesUntil: 1, type: 'rer' }, prepared);
    expect(haversineDistance(rer, stopB)).toBeGreaterThan(haversineDistance(bus, stopB));
  });

  it('never goes past the start of the route', () => {
    const far = estimateVehiclePosition(
      { monitoredStop: stopB, destinationStop: stopC, minutesUntil: 500, type: 'bus' },
      prepared
    );
    expect(far.method).toBe('route');
    expect(far.lat).toBeCloseTo(LAT, 6);
    expect(far.lng).toBeCloseTo(2.4, 6);
  });

  it('returns null when the direction cannot be determined', () => {
    expect(estimateVehiclePosition({ monitoredStop: stopB, destinationStop: null, minutesUntil: 3 }, prepared)).toBeNull();
    expect(estimateVehiclePosition({ monitoredStop: null, destinationStop: stopC, minutesUntil: 3 }, prepared)).toBeNull();
    expect(estimateVehiclePosition({ monitoredStop: stopB, destinationStop: stopC, minutesUntil: 3 }, null)).toBeNull();

    const offRoute = { lat: 48.99, lng: 2.43 }; // 8 km north of the trace
    expect(estimateVehiclePosition({ monitoredStop: stopB, destinationStop: offRoute, minutesUntil: 3 }, prepared)).toBeNull();
  });
});
