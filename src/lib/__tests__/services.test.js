import { describe, expect, it, vi } from 'vitest';
import { getDepartures } from '../departures-service';
import { getVehicles } from '../vehicles-service';
import { IdfmApiError } from '../idfm-client';
import { normalizeText } from '../geo';
import { findDirectedSegment, getPreparedLine, projectOnSegment, resolveStop } from '../position-estimator';
import { getProfile, scopeConfig } from '../profiles';
import favorites from '@/config/favorites.json';
import lineData from '@/data/line-data.json';
import cheminots from '../__fixtures__/stop-monitoring-cheminots.json';
import bobignyPicasso from '../__fixtures__/stop-monitoring-bobigny-pablo-picasso.json';
import timetable146Evening from '../__fixtures__/estimated-timetable-146-evening.json';
import timetable148Evening from '../__fixtures__/estimated-timetable-148-evening.json';
import regressionDanton from '../__fixtures__/regression-stop-monitoring-danton.json';
import regressionTimetable146 from '../__fixtures__/regression-estimated-timetable-146.json';
import danton from '../__fixtures__/stop-monitoring-danton.json';
import lamartine from '../__fixtures__/stop-monitoring-lamartine.json';
import leBourget from '../__fixtures__/stop-monitoring-le-bourget-rer.json';
import timetable148 from '../__fixtures__/estimated-timetable-148.json';
import timetable146 from '../__fixtures__/estimated-timetable-146.json';

const DANTON = 'STIF:StopPoint:Q:7948:';
const LAMARTINE = 'STIF:StopPoint:Q:23530:';
const LE_BOURGET = 'STIF:StopArea:SP:43231:';

const config = {
  stops: [
    {
      id: DANTON,
      name: 'Danton',
      lines: [
        { lineId: 'IDFM:C01173', lineName: '148', towards: 'metro-5' },
        { lineId: 'IDFM:C01171', lineName: '146', towards: 'metro-5' },
      ],
      coordinates: { lat: 48.91956, lng: 2.43796 },
    },
    {
      id: LAMARTINE,
      name: 'Lamartine - François Rude',
      lines: [{ lineId: 'IDFM:C01171', lineName: '146', direction: 'Le Bourget RER', towards: 'rer-b' }],
      coordinates: { lat: 48.92545, lng: 2.43174 },
    },
    {
      id: LE_BOURGET,
      name: 'Le Bourget RER',
      lines: [{ lineId: 'IDFM:C01743', lineName: 'RER B', excludeDirection: ['Aéroport', 'Mitry'] }],
      coordinates: { lat: 48.9315, lng: 2.4256 },
    },
  ],
  trackedLines: [
    { lineId: 'IDFM:C01173', name: 'Bus 148', type: 'bus', color: '#6e491e' },
    { lineId: 'IDFM:C01171', name: 'Bus 146', type: 'bus', color: '#E4B4D3' },
    { lineId: 'IDFM:C01375', name: 'Metro 5', type: 'metro', color: '#F68F4B' },
    { lineId: 'IDFM:C01743', name: 'RER B', type: 'rer', color: '#7BA3DC' },
  ],
  connections: {
    'metro-5': { label: 'Métro 5', color: '#EA580C' },
    'rer-b': { label: 'RER B', color: '#2563EB' },
  },
  settings: { maxDeparturesPerStop: 5, vehicleHorizonMinutes: 30 },
};

const fixtures = { [DANTON]: danton, [LAMARTINE]: lamartine, [LE_BOURGET]: leBourget };
const now = new Date(danton.Siri.ServiceDelivery.ResponseTimestamp);

const fakeMonitoring = (overrides = {}) =>
  vi.fn(async (stopId) => {
    if (overrides[stopId]) return overrides[stopId]();
    return { data: fixtures[stopId], fetchedAt: now.getTime(), stale: false };
  });

const timetables = { 'IDFM:C01173': timetable148, 'IDFM:C01171': timetable146 };

// Bus lines have a timetable; the RER B one fails, exercising the fallback.
const fakeTimetable = (overrides = {}) =>
  vi.fn(async (lineId) => {
    if (overrides[lineId]) return overrides[lineId]();
    if (!timetables[lineId]) throw new IdfmApiError('IDFM API responded with HTTP 500', { status: 500 });
    return { data: timetables[lineId], fetchedAt: now.getTime(), stale: false };
  });

const vehicleOptions = (extra = {}) => ({
  config,
  lineData,
  now,
  getMonitoring: fakeMonitoring(),
  getTimetable: fakeTimetable(),
  ...extra,
});

/**
 * The vehicle must sit on the trace before the stop it is heading to: that is
 * what "upstream" means for a bus that has not reached the stop yet.
 */
function expectUpstreamOfStop(vehicle, cfg) {
  const stop = cfg.stops.find((s) => s.id === vehicle.nextStopId);
  const prepared = getPreparedLine(lineData.lines[vehicle.lineRef]);
  const monitored = resolveStop(prepared, { ref: stop.id, fallback: stop.coordinates });
  const destination = resolveStop(prepared, { ref: vehicle.destinationRef, name: vehicle.destination });
  const directed = findDirectedSegment(prepared, monitored, destination, vehicle.type);
  expect(directed).not.toBeNull();
  const vehicleAlong = projectOnSegment(directed.segment, vehicle.position).distAlong;
  expect(vehicleAlong).toBeLessThanOrEqual(directed.from.distAlong);
}

describe('getDepartures', () => {
  it('applies each stop\'s line and direction rules', async () => {
    const result = await getDepartures({ config, lineData, now, getMonitoring: fakeMonitoring() });
    const byStop = Object.fromEntries(result.stops.map((entry) => [entry.stop.id, entry]));

    expect(result.allFailed).toBe(false);
    expect(result.errors).toEqual([]);
    expect(result.stale).toBe(false);

    // "Le Bourget RER" in the config must match the feed's "Le Bourget <RER>"
    expect(byStop[LAMARTINE].departures.length).toBeGreaterThan(0);
    for (const departure of byStop[LAMARTINE].departures) {
      expect(normalizeText(departure.destination)).toContain('le bourget rer');
      expect(departure.lineName).toBe('146');
    }

    expect(byStop[LE_BOURGET].departures.length).toBeGreaterThan(0);
    expect(byStop[LE_BOURGET].departures.length).toBeLessThanOrEqual(5);
    for (const departure of byStop[LE_BOURGET].departures) {
      expect(normalizeText(departure.destination)).not.toMatch(/aeroport|mitry/);
      expect(departure.lineName).toBe('B');
    }

    for (const departure of byStop[DANTON].departures) {
      expect(['148', '146']).toContain(departure.lineName);
    }
  });

  it('isolates a failing stop from the others', async () => {
    const getMonitoring = fakeMonitoring({
      [LAMARTINE]: () => { throw new IdfmApiError('IDFM request timed out after 8000 ms', { code: 'TIMEOUT' }); },
    });
    const result = await getDepartures({ config, lineData, now, getMonitoring });
    const byStop = Object.fromEntries(result.stops.map((entry) => [entry.stop.id, entry]));

    expect(result.allFailed).toBe(false);
    expect(result.errors).toEqual([{ stopId: LAMARTINE, message: 'IDFM request timed out after 8000 ms', code: 'TIMEOUT' }]);
    expect(byStop[LAMARTINE].departures).toEqual([]);
    expect(byStop[DANTON].departures.length).toBeGreaterThan(0);
  });

  it('never forwards unexpected error details', async () => {
    const getMonitoring = fakeMonitoring({
      [DANTON]: () => { throw new Error('secret internal detail'); },
    });
    const result = await getDepartures({ config, lineData, now, getMonitoring });
    expect(result.errors[0].message).toBe('Erreur interne');
  });

  it('reports allFailed and propagates the stale flag', async () => {
    const failing = vi.fn(async () => { throw new IdfmApiError('down', { code: 'NETWORK' }); });
    const failed = await getDepartures({ config, lineData, now, getMonitoring: failing });
    expect(failed.allFailed).toBe(true);
    expect(failed.errors).toHaveLength(3);

    const staleMonitoring = vi.fn(async (stopId) => ({ data: fixtures[stopId], fetchedAt: now.getTime(), stale: true }));
    const stale = await getDepartures({ config, lineData, now, getMonitoring: staleMonitoring });
    expect(stale.stale).toBe(true);
  });
});

describe('getVehicles', () => {
  it('produces one placed vehicle per journey within the horizon', async () => {
    const result = await getVehicles(vehicleOptions());

    expect(result.allFailed).toBe(false);
    expect(result.vehicles.length).toBeGreaterThan(0);

    const ids = result.vehicles.map((vehicle) => vehicle.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const vehicle of result.vehicles) {
      expect(vehicle.id).toMatch(/VehicleJourney/);
      expect(vehicle.minutesUntil).toBeLessThanOrEqual(30);
      expect(Number.isFinite(vehicle.position.lat)).toBe(true);
      expect(Number.isFinite(vehicle.position.lng)).toBe(true);
      expect(['timetable', 'route', 'at-stop']).toContain(vehicle.positionMethod);
      expect(normalizeText(vehicle.destination)).not.toMatch(/aeroport|mitry/);
    }
  });

  it('positions buses from the timetable and falls back to the route for lines without one', async () => {
    const result = await getVehicles(vehicleOptions());

    expect(result.timetable.lines.sort()).toEqual(['IDFM:C01171', 'IDFM:C01173']);
    expect(result.timetable.errors).toEqual([
      { lineId: 'IDFM:C01743', message: 'IDFM API responded with HTTP 500', code: 'UPSTREAM' },
    ]);

    const buses = result.vehicles.filter((vehicle) => vehicle.type === 'bus' && vehicle.minutesUntil > 0);
    const fromTimetable = buses.filter((vehicle) => vehicle.positionMethod === 'timetable');
    expect(fromTimetable.length).toBeGreaterThan(0);
    for (const vehicle of fromTimetable) {
      expect(typeof vehicle.anchorStopName).toBe('string');
      expect(vehicle.minutesToAnchor).toBeGreaterThan(0);
      expect(vehicle.minutesToAnchor).toBeLessThan(vehicle.minutesUntil);
      expectUpstreamOfStop(vehicle, config);
    }

    const trains = result.vehicles.filter((vehicle) => vehicle.lineRef === 'IDFM:C01743');
    expect(trains.length).toBeGreaterThan(0);
    for (const vehicle of trains) {
      expect(['route', 'at-stop']).toContain(vehicle.positionMethod);
      expect(vehicle.anchorStopName).toBeNull();
    }
  });

  it('spreads RER trains along the line instead of stacking them', async () => {
    const result = await getVehicles(vehicleOptions());
    const trains = result.vehicles.filter((vehicle) => vehicle.lineRef === 'IDFM:C01743' && vehicle.minutesUntil > 1);
    const distinctPositions = new Set(trains.map((t) => `${t.position.lat.toFixed(4)},${t.position.lng.toFixed(4)}`));
    expect(trains.length).toBeGreaterThan(1);
    // Before the fix every train sat on one fallback coordinate.
    expect(distinctPositions.size).toBeGreaterThan(1);
  });

  it('keeps going when one stop fails', async () => {
    const result = await getVehicles(
      vehicleOptions({
        getMonitoring: fakeMonitoring({
          [LE_BOURGET]: () => { throw new IdfmApiError('down', { code: 'UPSTREAM' }); },
        }),
      })
    );
    expect(result.allFailed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.vehicles.every((vehicle) => vehicle.lineRef !== 'IDFM:C01743')).toBe(true);
  });

  it('still places every vehicle when the whole timetable feed is down', async () => {
    const failing = vi.fn(async () => { throw new IdfmApiError('down', { code: 'NETWORK' }); });
    const withTimetable = await getVehicles(vehicleOptions());
    const without = await getVehicles(vehicleOptions({ getTimetable: failing }));

    expect(without.allFailed).toBe(false);
    expect(without.timetable.lines).toEqual([]);
    expect(without.timetable.errors).toHaveLength(3);
    expect(without.vehicles.map((v) => v.id).sort()).toEqual(withTimetable.vehicles.map((v) => v.id).sort());
    expect(without.vehicles.every((vehicle) => vehicle.positionMethod !== 'timetable')).toBe(true);
  });

  it('flags the response stale when the timetable is stale', async () => {
    const staleTimetable = vi.fn(async (lineId) => ({
      data: timetables[lineId] ?? { Siri: {} },
      fetchedAt: now.getTime(),
      stale: true,
    }));
    const result = await getVehicles(vehicleOptions({ getTimetable: staleTimetable }));
    expect(result.stale).toBe(true);
  });
});

describe('connections (towards)', () => {
  it('tags each vehicle with the connection of the stop line it was matched on', async () => {
    const result = await getVehicles(vehicleOptions());
    const byLineAndStop = (lineRef, stopId) =>
      result.vehicles.filter((v) => v.lineRef === lineRef && v.nextStopId === stopId);

    const towardsMetro = [...byLineAndStop('IDFM:C01173', DANTON), ...byLineAndStop('IDFM:C01171', DANTON)];
    expect(towardsMetro.length).toBeGreaterThan(0);
    for (const vehicle of towardsMetro) {
      expect(vehicle.towards).toEqual({ id: 'metro-5', label: 'Métro 5', color: '#EA580C' });
    }

    const towardsRer = byLineAndStop('IDFM:C01171', LAMARTINE);
    expect(towardsRer.length).toBeGreaterThan(0);
    for (const vehicle of towardsRer) {
      expect(vehicle.towards).toEqual({ id: 'rer-b', label: 'RER B', color: '#2563EB' });
    }

    for (const vehicle of result.vehicles.filter((v) => v.lineRef === 'IDFM:C01743')) {
      expect(vehicle.towards).toBeNull();
    }
  });

  it('leaves towards empty when the referenced connection is not defined', async () => {
    const result = await getVehicles(vehicleOptions({ config: { ...config, connections: {} } }));
    expect(result.vehicles.every((vehicle) => vehicle.towards === null)).toBe(true);
  });
});

describe('evening profile (real favorites.json)', () => {
  const retour = scopeConfig(favorites, getProfile(favorites, 'retour'));
  const CHEMINOTS = 'STIF:StopPoint:Q:479720:';
  const BOBIGNY = 'STIF:StopArea:SP:463865:';
  const eveningFixtures = { [CHEMINOTS]: cheminots, [BOBIGNY]: bobignyPicasso };
  const eveningNow = new Date(bobignyPicasso.Siri.ServiceDelivery.ResponseTimestamp);
  const eveningMonitoring = vi.fn(async (stopId) => ({
    data: eveningFixtures[stopId],
    fetchedAt: eveningNow.getTime(),
    stale: false,
  }));
  const eveningTimetables = { 'IDFM:C01171': timetable146Evening, 'IDFM:C01173': timetable148Evening };
  const eveningTimetable = vi.fn(async (lineId) => {
    if (!eveningTimetables[lineId]) throw new IdfmApiError('not tracked here', { code: 'UPSTREAM' });
    return { data: eveningTimetables[lineId], fetchedAt: eveningNow.getTime(), stale: false };
  });

  it('shows only buses heading towards Danton at Cheminots and Bobigny - Pablo Picasso', async () => {
    const result = await getDepartures({ config: retour, lineData, now: eveningNow, getMonitoring: eveningMonitoring });
    const byStop = Object.fromEntries(result.stops.map((entry) => [entry.stop.id, entry]));

    expect(byStop[CHEMINOTS].departures.length).toBeGreaterThan(0);
    for (const departure of byStop[CHEMINOTS].departures) {
      expect(departure.lineName).toBe('146');
      expect(departure.destination).toBe('Les Bosquets');
    }

    const bobigny = byStop[BOBIGNY].departures;
    expect(new Set(bobigny.map((d) => d.lineName))).toEqual(new Set(['146', '148']));
    for (const departure of bobigny) {
      // 30 visits at the station, many lines and both directions: only these survive
      if (departure.lineName === '146') expect(normalizeText(departure.destination)).toContain('le bourget');
      if (departure.lineName === '148') expect(normalizeText(departure.destination)).not.toContain('pablo picasso');
    }
  });

  it('places evening vehicles upstream of the stop they are heading to', async () => {
    const result = await getVehicles({
      config: retour,
      lineData,
      now: eveningNow,
      getMonitoring: eveningMonitoring,
      getTimetable: eveningTimetable,
    });
    expect(result.vehicles.length).toBeGreaterThan(0);
    expect(result.unplaced).toBe(0);
    for (const vehicle of result.vehicles) {
      expect(vehicle.towards).toBeNull();
      if (vehicle.positionMethod !== 'at-stop') expectUpstreamOfStop(vehicle, retour);
    }
  });
});

describe('regression: scrambled bus timetable', () => {
  // Captured 2026-10-17 20:20 Paris. The bus timetable mixes stops of both
  // directions with times that contradict route order: journey
  // 20261017.54.A reaches Danton in 8 min but lists Jean-Baptiste Clément -
  // Jaurès, well past Danton towards Les Bosquets, at 1 min. The previous
  // estimator anchored on the earliest call and drew that bus at lng 2.496,
  // about 4 km past a stop it had not reached; 55.A lists Léon Blum, also
  // downstream, before Danton too.
  const aller = scopeConfig(favorites, getProfile(favorites, 'aller'));
  // Horizon raised so the 31-minute journey is included.
  const dantonOnly = {
    ...aller,
    stops: aller.stops.filter((stop) => stop.id === DANTON),
    settings: { ...aller.settings, vehicleHorizonMinutes: 40 },
  };
  const regressionNow = new Date(regressionDanton.Siri.ServiceDelivery.ResponseTimestamp);

  it('never anchors on a call downstream of the monitored stop', async () => {
    const result = await getVehicles({
      config: dantonOnly,
      lineData,
      now: regressionNow,
      getMonitoring: vi.fn(async () => ({ data: regressionDanton, fetchedAt: regressionNow.getTime(), stale: false })),
      getTimetable: vi.fn(async (lineId) => {
        if (lineId !== 'IDFM:C01171') throw new IdfmApiError('only 146 captured', { code: 'UPSTREAM' });
        return { data: regressionTimetable146, fetchedAt: regressionNow.getTime(), stale: false };
      }),
    });

    const buses146 = result.vehicles.filter((vehicle) => vehicle.lineRef === 'IDFM:C01171');
    expect(buses146.length).toBeGreaterThanOrEqual(2);
    for (const vehicle of buses146) {
      expect(['Jean-Baptiste Clément - Jaurès', 'Léon Blum']).not.toContain(vehicle.anchorStopName);
      expect(vehicle.towards?.id).toBe('metro-5');
      if (vehicle.positionMethod !== 'at-stop') expectUpstreamOfStop(vehicle, dantonOnly);
      // Les Bosquets is east (2.56); a bus that has not reached Danton (2.438) is west of it
      expect(vehicle.position.lng).toBeLessThan(2.45);
    }
  });
});
