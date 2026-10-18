import { afterEach, describe, expect, it, vi } from 'vitest';
import favorites from '@/config/favorites.json';
import lineData from '@/data/line-data.json';
import { haversineDistance } from '../geo';
import { fetchRouteWithTraffic, parseRoute, TrafficApiError, trafficLevel } from '../tomtom-client';
import { clearTrafficCache, getTraffic, routePath } from '../traffic-service';
import { findDirectedSegment, getPreparedLine, projectOnSegment } from '../position-estimator';
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

describe('routePath', () => {
  it('follows the 148 trace from Danton to Bobigny - Pablo Picasso, in order', () => {
    const path = routePath(route, lineData);
    expect(path.length).toBeGreaterThan(50);
    expect(path[0]).toEqual(route.from);
    expect(path.at(-1)).toEqual(route.to);

    const prepared = getPreparedLine(lineData.lines[route.alongLine]);
    const { segment } = findDirectedSegment(prepared, route.from, route.to, 'bus');
    const along = path.slice(1, -1).map((point) => projectOnSegment(segment, point));
    for (let i = 0; i < along.length; i++) {
      expect(along[i].distance).toBeLessThan(1); // trace vertices themselves
      if (i > 0) expect(along[i].distAlong).toBeGreaterThan(along[i - 1].distAlong);
    }
    // about the 2.1 km of road between the two stops, not the whole line
    const length = path.slice(1).reduce((sum, point, i) => sum + haversineDistance(path[i], point), 0);
    expect(length).toBeGreaterThan(1900);
    expect(length).toBeLessThan(2500);
  });

  it('builds the return path too, and nothing without a line', () => {
    const retour = favorites.profiles.find((p) => p.id === 'retour').traffic[0];
    const back = routePath(retour, lineData);
    expect(back[0]).toEqual(retour.from);
    expect(back.at(-1)).toEqual(retour.to);
    expect(routePath({ from: route.from, to: route.to }, lineData)).toBeNull();
    expect(routePath({ ...route, alongLine: 'IDFM:C99999' }, lineData)).toBeNull();
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

  it('posts the path to follow when given supporting points', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify(tomtomRoute), { status: 200 }));
    const path = [{ lat: 48.9, lng: 2.4 }, { lat: 48.905, lng: 2.405 }, { lat: 48.91, lng: 2.41 }];
    await fetchRouteWithTraffic([path[0], path[2]], { apiKey: 'k123', fetchImpl, supportingPoints: path });

    const [url, init] = fetchImpl.mock.calls[0];
    expect(new URL(url).pathname).toBe('/routing/1/calculateRoute/48.900000,2.400000:48.910000,2.410000/json');
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(init.body)).toEqual({
      supportingPoints: [
        { latitude: 48.9, longitude: 2.4 },
        { latitude: 48.905, longitude: 2.405 },
        { latitude: 48.91, longitude: 2.41 },
      ],
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
    const [locations, options] = fetchRoute.mock.calls[0];
    expect(locations).toEqual([route.from, route.to]);
    expect(options.supportingPoints.length).toBeGreaterThan(50);
    expect(first.routes[0].followsLine).toBe(true);
    expect(first.routes[0]).toMatchObject({
      id: 'danton-bobigny',
      status: 'ok',
      level: 'heavy',
      levelLabel: 'Dense',
      travelMinutes: 9,
      freeFlowMinutes: 6,
      typicalMinutes: 7,
      delayMinutes: 4, // 540 s vs 330 s free flow
      typicalDelayMinutes: 2, // 540 s vs 420 s usual at this hour
      incidents: [{ label: 'Bouchon', category: 'JAM', delayMinutes: 3, speedKmh: 12 }],
    });
  });

  it('falls back to TomTom\'s own route when it cannot follow the bus path', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const fetchRoute = vi.fn(async (locations, { supportingPoints }) => {
      if (supportingPoints) {
        throw new TrafficApiError('TomTom responded with HTTP 400', { status: 400, code: 'NO_ROUTE', safeMessage: 'Itinéraire introuvable' });
      }
      return tomtomRoute;
    });
    const result = await getTraffic({ config, lineData, apiKey: 'k', fetchRoute });

    expect(fetchRoute).toHaveBeenCalledTimes(2);
    expect(fetchRoute.mock.calls[1][1].supportingPoints).toBeUndefined();
    expect(result.routes[0]).toMatchObject({ status: 'ok', followsLine: false, travelMinutes: 9 });
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

describe('comparison with usual traffic', () => {
  it('rounds to +0 when the trip takes as long as usual, and goes negative when faster', async () => {
    const usual = {
      routes: [{ summary: { lengthInMeters: 2144, travelTimeInSeconds: 362, trafficDelayInSeconds: 0, noTrafficTravelTimeInSeconds: 321, historicTrafficTravelTimeInSeconds: 356 }, sections: [] }],
    };
    const faster = structuredClone(usual);
    faster.routes[0].summary.historicTrafficTravelTimeInSeconds = 480;

    const [now] = (await getTraffic({ config, lineData, apiKey: 'k', fetchRoute: vi.fn(async () => usual) })).routes;
    // the live values from 2026-10-17 behind "+1 min par rapport au trafic fluide"
    expect(now).toMatchObject({ travelMinutes: 6, delayMinutes: 1, typicalDelayMinutes: 0 });

    clearTrafficCache();
    const [quick] = (await getTraffic({ config, lineData, apiKey: 'k', fetchRoute: vi.fn(async () => faster) })).routes;
    expect(quick.typicalDelayMinutes).toBe(-2);
  });

  it('leaves the comparison out when TomTom has no historic time', async () => {
    const noHistory = { routes: [{ summary: { travelTimeInSeconds: 362, noTrafficTravelTimeInSeconds: 321 }, sections: [] }] };
    const [route] = (await getTraffic({ config, lineData, apiKey: 'k', fetchRoute: vi.fn(async () => noHistory) })).routes;
    expect(route.typicalDelayMinutes).toBeNull();
  });
});
