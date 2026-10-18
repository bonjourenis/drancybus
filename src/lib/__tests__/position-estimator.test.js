import { describe, expect, it } from 'vitest';
import { haversineDistance } from '../geo';
import {
  estimateFromTimetable,
  estimateVehiclePosition,
  findDirectedSegment,
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
  it('matches a SIRI platform reference to the numeric part of the stop id', () => {
    expect(resolveStop(prepared, { ref: 'STIF:StopPoint:Q:1002:' })).toMatchObject({ lat: LAT, lng: 2.43 });
    expect(resolveStop(prepared, { ref: 'IDFM:1003' })).toMatchObject({ lng: 2.45 });
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

  it('never goes past the start of the route, and says so', () => {
    const far = estimateVehiclePosition(
      { monitoredStop: stopB, destinationStop: stopC, minutesUntil: 500, type: 'bus' },
      prepared
    );
    expect(far.method).toBe('route');
    expect(far.atTerminus).toBe(true);
    expect(
      estimateVehiclePosition({ monitoredStop: stopB, destinationStop: stopC, minutesUntil: 2, type: 'bus' }, prepared)
        .atTerminus
    ).toBe(false);
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

describe('resolveStop reference kinds', () => {
  it('never matches a station reference to a platform with the same number', () => {
    const line = prepareLine({
      segments: [eastbound],
      stops: [
        { id: 'IDFM:463865', name: 'Quai', lat: LAT, lng: 2.41 },
        { id: 'IDFM:monomodalStopPlace:463865', name: 'Gare', lat: LAT, lng: 2.45 },
      ],
    });
    expect(resolveStop(line, { ref: 'STIF:StopArea:SP:463865:' })).toMatchObject({ name: 'Gare' });
    expect(resolveStop(line, { ref: 'STIF:StopPoint:Q:463865:' })).toMatchObject({ name: 'Quai' });

    const busOnly = prepareLine({ segments: [eastbound], stops: [{ id: 'IDFM:463865', name: 'Quai', lat: LAT, lng: 2.41 }] });
    expect(resolveStop(busOnly, { ref: 'STIF:StopArea:SP:463865:' })).toBeNull();
  });
});

describe('estimateFromTimetable', () => {
  // Longer straight route, 2.40 -> 2.50, stops every 0.02 deg (~1.47 km).
  const longEast = Array.from({ length: 101 }, (_, i) => [LAT, 2.4 + i * 0.001]);
  const longWest = [...longEast].reverse();
  const P = [1, 2, 3, 4].map((n) => ({ id: `IDFM:20${n}`, name: `P${n}`, lat: LAT, lng: 2.4 + n * 0.02 }));
  const line = prepareLine({ segments: [longEast, longWest], stops: P });

  const now = new Date('2026-10-17T18:00:00Z');
  const at = (minutes) => new Date(now.getTime() + minutes * 60000).toISOString();
  const call = (n, minutes) => ({ stopRef: `STIF:StopPoint:Q:20${n}:`, time: at(minutes) });
  const journey = (calls) => ({ journeyRef: 'J1', calls });

  const east = (calls, minutesUntil = 6) =>
    estimateFromTimetable(
      { journey: journey(calls), monitoredStop: P[2], minutesUntil, destinationStop: P[3], now, type: 'bus' },
      line
    );

  it('anchors on an upstream call and walks back at the measured speed', () => {
    const result = east([call(2, 2), call(4, 9)]);
    const speed = haversineDistance(P[1], P[2]) / 4; // P2 -> P3 in 4 minutes
    expect(result).toMatchObject({ method: 'timetable', anchorStopName: 'P2', minutesToAnchor: 2 });
    expect(result.speedMetersPerMinute).toBe(Math.round(speed));
    expect(result.lng).toBeLessThan(P[1].lng);
    expect(haversineDistance(result, P[1])).toBeCloseTo(2 * speed, -1);
  });

  it('never anchors on a cancelled call', () => {
    const cancelledCall = { ...call(1, 1), cancelled: true };
    expect(east([cancelledCall, call(2, 3)], 8).anchorStopName).toBe('P2');
    expect(east([cancelledCall], 8)).toBeNull();
  });

  it('prefers the call closest to the vehicle among consistent ones', () => {
    // P1 -> P3 (2.9 km) in 7 min and P2 -> P3 (1.5 km) in 5 min are both plausible
    expect(east([call(2, 3), call(1, 1)], 8).anchorStopName).toBe('P1');
  });

  it('ignores calls downstream of the monitored stop even when their time is earlier', () => {
    // P4 lies after P3 heading east; the feed claims it comes first.
    const result = east([call(4, 1), call(2, 2)]);
    expect(result.anchorStopName).toBe('P2');
  });

  it('rejects anchors implying an implausible speed', () => {
    // P2 -> P3 (1.47 km) in 29 min is 50 m/min, below a bus's minimum.
    expect(east([call(2, 1)], 30)).toBeNull();
    // P1 -> P3 (2.9 km) in 2 min is 1.5 km/min, above a bus's maximum.
    expect(east([call(1, 4)], 6)).toBeNull();
  });

  it('respects direction: the same call is downstream for a westbound vehicle', () => {
    const west = estimateFromTimetable(
      { journey: journey([call(2, 2)]), monitoredStop: P[2], minutesUntil: 6, destinationStop: P[0], now, type: 'bus' },
      line
    );
    expect(west).toBeNull();
  });

  it('returns null when nothing usable is ahead', () => {
    expect(east([])).toBeNull();
    expect(east([call(2, -1)])).toBeNull(); // already passed
    expect(east([call(2, 7)])).toBeNull(); // after the monitored stop time
    expect(east([{ stopRef: 'STIF:StopPoint:Q:999:', time: at(2) }])).toBeNull();
    expect(
      estimateFromTimetable({ journey: journey([call(2, 2)]), monitoredStop: P[2], minutesUntil: 6, destinationStop: null, now }, line)
    ).toBeNull();
    expect(estimateFromTimetable({ journey: null, monitoredStop: P[2], minutesUntil: 6, destinationStop: P[3], now }, line)).toBeNull();
  });
});

describe('findDirectedSegment with route variants', () => {
  // Full route 2.40 -> 2.46 drawn ~10 m off the stops, and a short turn
  // starting at Bravo (2.43) drawn exactly through them: the short turn is
  // the better geometric fit, as segment 4 of the real 146 trace is.
  const fullRoute = Array.from({ length: 61 }, (_, i) => [LAT + 0.00009, 2.4 + i * 0.001]);
  const shortTurn = Array.from({ length: 31 }, (_, i) => [LAT, 2.43 + i * 0.001]);
  const variants = prepareLine({ segments: [fullRoute, shortTurn], stops: [stopA, stopB, stopC] });

  it('prefers the variant with the most route before the stop when fits are similar', () => {
    const directed = findDirectedSegment(variants, stopB, stopC, 'bus');
    expect(directed.error).toBeGreaterThan(15); // not the best-fitting segment...
    expect(directed.segment.index).toBe(0); // ...but the full route wins
    expect(directed.from.distAlong).toBeGreaterThan(2000);
  });

  it('lets the vehicle be walked back past the short turn start', () => {
    const position = estimateVehiclePosition(
      { monitoredStop: stopB, destinationStop: stopC, minutesUntil: 6, type: 'bus' },
      variants
    );
    expect(position.lng).toBeLessThan(stopB.lng - 0.015); // 1.5 km back, not pinned at Bravo
  });

  it('still rejects a variant that fits much worse', () => {
    const farVariant = Array.from({ length: 61 }, (_, i) => [LAT + 0.0012, 2.4 + i * 0.001]); // ~130 m off
    const line = prepareLine({ segments: [farVariant, shortTurn], stops: [stopA, stopB, stopC] });
    expect(findDirectedSegment(line, stopB, stopC, 'bus').segment.index).toBe(1);
  });
});
