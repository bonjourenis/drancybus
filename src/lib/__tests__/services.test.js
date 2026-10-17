import { describe, expect, it, vi } from 'vitest';
import { getDepartures } from '../departures-service';
import { getVehicles } from '../vehicles-service';
import { IdfmApiError } from '../idfm-client';
import { normalizeText } from '../geo';
import lineData from '@/data/line-data.json';
import danton from '../__fixtures__/stop-monitoring-danton.json';
import lamartine from '../__fixtures__/stop-monitoring-lamartine.json';
import leBourget from '../__fixtures__/stop-monitoring-le-bourget-rer.json';

const DANTON = 'STIF:StopPoint:Q:7948:';
const LAMARTINE = 'STIF:StopPoint:Q:23530:';
const LE_BOURGET = 'STIF:StopArea:SP:43231:';

const config = {
  stops: [
    {
      id: DANTON,
      name: 'Danton',
      lines: [
        { lineId: 'IDFM:C01173', lineName: '148' },
        { lineId: 'IDFM:C01171', lineName: '146' },
      ],
      coordinates: { lat: 48.91956, lng: 2.43796 },
    },
    {
      id: LAMARTINE,
      name: 'Lamartine - François Rude',
      lines: [{ lineId: 'IDFM:C01171', lineName: '146', direction: 'Le Bourget RER' }],
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
  settings: { maxDeparturesPerStop: 5, vehicleHorizonMinutes: 30 },
};

const fixtures = { [DANTON]: danton, [LAMARTINE]: lamartine, [LE_BOURGET]: leBourget };
const now = new Date(danton.Siri.ServiceDelivery.ResponseTimestamp);

const fakeMonitoring = (overrides = {}) =>
  vi.fn(async (stopId) => {
    if (overrides[stopId]) return overrides[stopId]();
    return { data: fixtures[stopId], fetchedAt: now.getTime(), stale: false };
  });

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
    const result = await getVehicles({ config, lineData, now, getMonitoring: fakeMonitoring() });

    expect(result.allFailed).toBe(false);
    expect(result.vehicles.length).toBeGreaterThan(0);

    const ids = result.vehicles.map((vehicle) => vehicle.id);
    expect(new Set(ids).size).toBe(ids.length);

    for (const vehicle of result.vehicles) {
      expect(vehicle.id).toMatch(/VehicleJourney/);
      expect(vehicle.minutesUntil).toBeLessThanOrEqual(30);
      expect(Number.isFinite(vehicle.position.lat)).toBe(true);
      expect(Number.isFinite(vehicle.position.lng)).toBe(true);
      expect(['route', 'at-stop']).toContain(vehicle.positionMethod);
      expect(normalizeText(vehicle.destination)).not.toMatch(/aeroport|mitry/);
    }
  });

  it('spreads RER trains along the line instead of stacking them', async () => {
    const result = await getVehicles({ config, lineData, now, getMonitoring: fakeMonitoring() });
    const trains = result.vehicles.filter((vehicle) => vehicle.lineRef === 'IDFM:C01743' && vehicle.minutesUntil > 1);
    const distinctPositions = new Set(trains.map((t) => `${t.position.lat.toFixed(4)},${t.position.lng.toFixed(4)}`));
    expect(trains.length).toBeGreaterThan(1);
    // Before the fix every train sat on one fallback coordinate.
    expect(distinctPositions.size).toBeGreaterThan(1);
  });

  it('keeps going when one stop fails', async () => {
    const getMonitoring = fakeMonitoring({
      [LE_BOURGET]: () => { throw new IdfmApiError('down', { code: 'UPSTREAM' }); },
    });
    const result = await getVehicles({ config, lineData, now, getMonitoring });
    expect(result.allFailed).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.vehicles.every((vehicle) => vehicle.lineRef !== 'IDFM:C01743')).toBe(true);
  });
});
