import { describe, expect, it } from 'vitest';
import { normalizeCallStatus, normalizeLineRef, parseDepartures, parseEstimatedTimetable } from '../siri-parser';
import gentillyCancelled from '../__fixtures__/stop-monitoring-rer-b-cancelled.json';
import timetableRerBCancelled from '../__fixtures__/estimated-timetable-rer-b-cancelled.json';
import danton from '../__fixtures__/stop-monitoring-danton.json';
import leBourget from '../__fixtures__/stop-monitoring-le-bourget-rer.json';
import timetable148 from '../__fixtures__/estimated-timetable-148.json';

const responseTime = (fixture) => new Date(fixture.Siri.ServiceDelivery.ResponseTimestamp);
const visitCount = (fixture) =>
  fixture.Siri.ServiceDelivery.StopMonitoringDelivery.reduce(
    (sum, delivery) => sum + (delivery.MonitoredStopVisit?.length ?? 0),
    0
  );

describe('normalizeLineRef', () => {
  it('converts STIF line refs to IDFM format', () => {
    expect(normalizeLineRef('STIF:Line::C01173:')).toBe('IDFM:C01173');
  });

  it('keeps IDFM refs and tolerates garbage', () => {
    expect(normalizeLineRef('IDFM:C01743')).toBe('IDFM:C01743');
    expect(normalizeLineRef('')).toBe('');
    expect(normalizeLineRef(undefined)).toBe('');
    expect(normalizeLineRef('something-else')).toBe('something-else');
  });
});

describe('parseDepartures', () => {
  it('returns an empty list for malformed input', () => {
    expect(parseDepartures(null)).toEqual([]);
    expect(parseDepartures({})).toEqual([]);
    expect(parseDepartures({ Siri: { ServiceDelivery: {} } })).toEqual([]);
  });

  it('parses a real bus stop response', () => {
    const departures = parseDepartures(danton, {
      now: responseTime(danton),
      lineNames: { 'IDFM:C01173': '148', 'IDFM:C01171': '146' },
    });

    expect(departures.length).toBeGreaterThan(0);
    expect(departures.length).toBeLessThanOrEqual(visitCount(danton));

    for (const departure of departures) {
      expect(departure.lineRef).toMatch(/^IDFM:C\d+$/);
      expect(['148', '146']).toContain(departure.lineName);
      expect(departure.journeyRef).toMatch(/VehicleJourney/);
      expect(departure.destinationRef).toMatch(/^STIF:/);
      expect(departure.minutesUntil).toBeGreaterThanOrEqual(0);
      expect(new Date(departure.expectedTime).toISOString()).toBe(departure.expectedTime);
      expect(typeof departure.displayTime).toBe('string');
    }
  });

  it('sorts by time to departure', () => {
    const departures = parseDepartures(leBourget, { now: responseTime(leBourget) });
    for (let i = 1; i < departures.length; i++) {
      expect(departures[i].minutesUntil).toBeGreaterThanOrEqual(departures[i - 1].minutesUntil);
    }
  });

  it('drops departures that are more than a minute in the past', () => {
    const later = new Date(responseTime(leBourget).getTime() + 6 * 60 * 60 * 1000);
    expect(parseDepartures(leBourget, { now: later })).toEqual([]);
  });

  it('falls back to a short name derived from the line id', () => {
    const [departure] = parseDepartures(danton, { now: responseTime(danton) });
    expect(departure.lineName).toMatch(/^\d+$/);
  });
});

describe('parseEstimatedTimetable', () => {
  it('returns an empty list for malformed input', () => {
    expect(parseEstimatedTimetable(null)).toEqual([]);
    expect(parseEstimatedTimetable({})).toEqual([]);
  });

  it('parses a real line response into journeys with sorted upcoming calls', () => {
    const now = responseTime(timetable148);
    const journeys = parseEstimatedTimetable(timetable148, { now });

    expect(journeys.length).toBeGreaterThan(0);
    for (const journey of journeys) {
      expect(journey.journeyRef).toMatch(/VehicleJourney/);
      expect(journey.lineRef).toBe('IDFM:C01173');
      expect(journey.calls.length).toBeGreaterThan(0);
      for (let i = 0; i < journey.calls.length; i++) {
        const call = journey.calls[i];
        expect(call.stopRef).toMatch(/^STIF:/);
        expect(new Date(call.time).toISOString()).toBe(call.time);
        expect(typeof call.minutesFromNow).toBe('number');
        if (i > 0) expect(call.time >= journey.calls[i - 1].time).toBe(true);
      }
    }
  });
});

describe('cancelled trips', () => {
  it('reads call statuses in both PRIM spellings', () => {
    expect(normalizeCallStatus('onTime')).toBe('onTime');
    expect(normalizeCallStatus('ON_TIME')).toBe('onTime');
    expect(normalizeCallStatus('cancelled')).toBe('cancelled');
    expect(normalizeCallStatus('CANCELLED')).toBe('cancelled');
    expect(normalizeCallStatus('NO_REPORT')).toBe('noReport');
    expect(normalizeCallStatus('')).toBe('unknown');
    expect(normalizeCallStatus(undefined)).toBe('unknown');
  });

  // Captured 2026-10-18 at Gentilly: the 10:14 RER B to Robinson is cancelled
  // but still listed with its time. Read it four minutes before.
  const before = new Date('2026-10-18T08:10:00Z');

  it('marks a cancelled stop-monitoring visit instead of counting down to it', () => {
    const departures = parseDepartures(gentillyCancelled, { now: before });
    const cancelled = departures.filter((d) => d.cancelled);

    expect(cancelled).toHaveLength(1);
    expect(cancelled[0]).toMatchObject({
      destination: 'Robinson',
      departureStatus: 'cancelled',
      displayTime: 'Supprimé',
      vehicleAtStop: false,
      minutesUntil: 4,
    });
    expect(cancelled[0].journeyRef).toContain('2fc6df05');
    expect(departures.filter((d) => !d.cancelled).length).toBeGreaterThan(10);
    expect(departures.every((d) => d.cancelled || d.displayTime !== 'Supprimé')).toBe(true);
  });

  it('drops a cancelled visit once its time has passed, like any other', () => {
    const atCapture = new Date(gentillyCancelled.Siri.ServiceDelivery.ResponseTimestamp);
    expect(parseDepartures(gentillyCancelled, { now: atCapture }).some((d) => d.cancelled)).toBe(false);
  });

  it('marks cancelled calls in the estimated timetable (upper-case statuses)', () => {
    const journeys = parseEstimatedTimetable(timetableRerBCancelled, { now: before });
    const journey = journeys.find((j) => j.journeyRef.includes('2fc6df05'));
    expect(journey.calls.some((call) => call.cancelled)).toBe(true);

    const allCalls = journeys.flatMap((j) => j.calls);
    expect(allCalls.filter((call) => call.cancelled).length).toBe(8);
    expect(allCalls.filter((call) => !call.cancelled).length).toBeGreaterThan(500);
  });
});
