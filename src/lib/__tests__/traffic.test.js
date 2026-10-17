import { afterEach, describe, expect, it, vi } from 'vitest';
import favorites from '@/config/favorites.json';
import lineData from '@/data/line-data.json';
import { haversineDistance } from '../geo';
import { fetchRouteWithTraffic, parseRoute, TrafficApiError, trafficLevel } from '../tomtom-client';
import { clearTrafficCache, getTraffic, routeLocations } from '../traffic-service';
// Built from the response schema in TomTom's Calculate Route documentation;
// not captured live (no TomTom key was available).
import tomtomRoute from '../__fixtures__/tomtom-calculate-route.json';

const aller = favorites.profiles.find((p) => p.id === 'aller');
const route = aller.traffic[0];
const config = { ...favorites, traffic: aller.traffic };

afterEach(() => {
  clearTrafficCache();
  vi.restoreAllMocks();
});

describe('parseRoute', () => {
  it('reads the summary and traffic sections', () => {
    expect(parseRoute(tomtomRoute)).toEqual({
      lengthMeters: 2140,
      travelSeconds: 540,
      delaySeconds: 180,
      freeFlowSeconds: 330,
      typicalSeconds: 420,
      incidents: [{ category: 'JAM', label: 'Bouchon', magnitude: 2, delaySeconds: 150, speedKmh: 12 }],
    });
  });

  it('rejects a response without a route', () => {
    expect(() => parseRoute({ routes: [] })).toThrow(TrafficApiError);
  });
});

describe('trafficLevel', () => {
  it('classifies by ratio to free flow', () => {
    expect(trafficLevel({ travelSeconds: 540, freeFlowSeconds: 330 })).toBe('heavy'); // x1.64
    expect(trafficLevel({ travelSeconds: 440, freeFlowSeconds: 330 })).toBe('slow'); // x1.33
    expect(trafficLevel({ travelSeconds: 380, freeFlowSeconds: 330 })).toBe('fluid'); // under a minute
    expect(trafficLevel({ travelSeconds: 300, freeFlowSeconds: 330 })).toBe('fluid');
  });

  it('falls back to the reported delay without free-flow time, and flags closures', () => {
    expect(trafficLevel({ travelSeconds: 600, freeFlowSeconds: null, delaySeconds: 300 })).toBe('heavy');
    expect(trafficLevel({ travelSeconds: 300, freeFlowSeconds: 290, incidents: [{ category: 'ROAD_CLOSURE' }] })).toBe('blocked');
  });
});

describe('routeLocations', () => {
  it('adds two via points along the bus trace between origin and destination', () => {
    const locations = routeLocations(route, lineData);
    expect(locations).toHaveLength(4);
    expect(locations[0]).toEqual(route.from);
    expect(locations[3]).toEqual(route.to);

    const total = haversineDistance(route.from, route.to);
    const d1 = haversineDistance(route.from, locations[1]);
    const d2 = haversineDistance(route.from, locations[2]);
    expect(d1).toBeGreaterThan(100);
    expect(d2).toBeGreaterThan(d1);
    expect(haversineDistance(locations[2], route.to)).toBeLessThan(total);
  });

  it('works for the return route and without a line', () => {
    const retour = favorites.profiles.find((p) => p.id === 'retour').traffic[0];
    expect(routeLocations(retour, lineData)).toHaveLength(4);
    expect(routeLocations({ from: route.from, to: route.to }, lineData)).toEqual([route.from, route.to]);
  });
});

describe('fetchRouteWithTraffic', () => {
  it('requests live traffic for car travel through the given points', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(tomtomRoute), { status: 200 }));
    await fetchRouteWithTraffic([{ lat: 48.9, lng: 2.4 }, { lat: 48.91, lng: 2.41 }], { apiKey: 'k123', fetchImpl });

    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.pathname).toBe('/routing/1/calculateRoute/48.900000,2.400000:48.910000,2.410000/json');
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      key: 'k123',
      traffic: 'true',
      travelMode: 'car',
      computeTravelTimeFor: 'all',
      sectionType: 'traffic',
    });
  });

  it('maps HTTP errors without leaking the key', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchImpl = vi.fn(async () => new Response('{"detailedError":{"code":"Forbidden"}}', { status: 403 }));

    const error = await fetchRouteWithTraffic([route.from, route.to], { apiKey: 'secret-key', fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(TrafficApiError);
    expect(error.code).toBe('AUTH');
    expect(error.safeMessage).toBe('Clé TomTom refusée');
    expect(JSON.stringify(logged.mock.calls)).not.toContain('secret-key');
    expect(error.message).not.toContain('secret-key');
  });
});

describe('getTraffic', () => {
  it('reports not-configured without a key and never calls TomTom', async () => {
    const fetchRoute = vi.fn();
    const result = await getTraffic({ config, lineData, apiKey: null, fetchRoute });
    expect(result).toEqual({
      configured: false,
      routes: [{ id: 'danton-bobigny', name: route.name, status: 'not-configured' }],
    });
    expect(fetchRoute).not.toHaveBeenCalled();
  });

  it('summarizes each route and caches the upstream call', async () => {
    const fetchRoute = vi.fn(async () => tomtomRoute);
    const first = await getTraffic({ config, lineData, apiKey: 'k', fetchRoute });
    await getTraffic({ config, lineData, apiKey: 'k', fetchRoute });

    expect(fetchRoute).toHaveBeenCalledTimes(1);
    expect(fetchRoute.mock.calls[0][0]).toHaveLength(4);
    expect(first.routes[0]).toMatchObject({
      id: 'danton-bobigny',
      status: 'ok',
      level: 'heavy',
      levelLabel: 'Dense',
      travelMinutes: 9,
      freeFlowMinutes: 6,
      typicalMinutes: 7,
      delayMinutes: 4,
      incidents: [{ label: 'Bouchon', category: 'JAM', delayMinutes: 3, speedKmh: 12 }],
    });
  });

  it('isolates a failing route behind a safe message', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchRoute = vi.fn(async () => {
      throw new TrafficApiError('TomTom responded with HTTP 429', { code: 'QUOTA', safeMessage: 'Quota TomTom dépassé' });
    });
    const result = await getTraffic({ config, lineData, apiKey: 'k', fetchRoute });
    expect(result.routes[0]).toMatchObject({ status: 'error', error: 'Quota TomTom dépassé', code: 'QUOTA' });
  });
});
