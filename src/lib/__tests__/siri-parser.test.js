import { describe, expect, it } from 'vitest';
import { normalizeLineRef, parseDepartures } from '../siri-parser';
import danton from '../__fixtures__/stop-monitoring-danton.json';
import leBourget from '../__fixtures__/stop-monitoring-le-bourget-rer.json';

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
