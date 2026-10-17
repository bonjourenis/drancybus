/**
 * Runs the real public/sw.js against a fake CacheStorage and network.
 */
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGIN = 'http://localhost:3000';
const SOURCE = readFileSync(new URL('../../../public/sw.js', import.meta.url), 'utf8');

class FakeCache {
  constructor(network) {
    this.entries = new Map();
    this.network = network;
  }
  key(request) {
    return new URL(typeof request === 'string' ? request : request.url, ORIGIN).href;
  }
  async match(request, { ignoreSearch = false } = {}) {
    const key = this.key(request);
    let found = this.entries.get(key);
    if (!found && ignoreSearch) {
      const base = key.split('?')[0];
      found = [...this.entries].find(([k]) => k.split('?')[0] === base)?.[1];
    }
    return found ? found.clone() : undefined;
  }
  async put(request, response) {
    this.entries.set(this.key(request), response.clone());
  }
  async add(url) {
    const response = await this.network({ url: new URL(url, ORIGIN).href, method: 'GET', mode: 'cors' });
    if (!response.ok) throw new TypeError(`HTTP ${response.status}`);
    await this.put(url, response);
  }
  async keys() {
    return [...this.entries.keys()].map((url) => ({ url }));
  }
  async delete(request) {
    return this.entries.delete(this.key(request));
  }
}

function setup() {
  const listeners = {};
  const routes = new Map(); // pathname+search -> () => Response | Promise<Response>
  const state = { offline: false };
  const network = vi.fn(async (request) => {
    if (state.offline) throw new TypeError('Failed to fetch');
    const url = new URL(request.url);
    const route = routes.get(url.pathname + url.search) ?? routes.get(url.pathname);
    return route ? route() : new Response('not found', { status: 404 });
  });
  const stores = new Map();
  const caches = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new FakeCache(network));
      return stores.get(name);
    },
    async keys() {
      return [...stores.keys()];
    },
    async delete(name) {
      return stores.delete(name);
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type, fn) => {
      listeners[type] = fn;
    },
    skipWaiting: vi.fn(async () => {}),
    clients: { claim: vi.fn(async () => {}) },
  };
  const run = new Function('self', 'caches', 'fetch', 'setTimeout', 'clearTimeout', SOURCE);
  run(
    self,
    caches,
    network,
    (...args) => globalThis.setTimeout(...args),
    (...args) => globalThis.clearTimeout(...args)
  );

  const dispatch = (type, extra = {}) => {
    const waits = [];
    let response;
    const event = {
      ...extra,
      waitUntil: (promise) => waits.push(promise),
      respondWith: (promise) => {
        response = Promise.resolve(promise);
      },
    };
    listeners[type](event);
    return {
      get responded() {
        return response !== undefined;
      },
      response: () => response,
      settled: async () => {
        while (waits.length) await Promise.allSettled(waits.splice(0));
      },
    };
  };

  const fetchEvent = (path, { mode = 'cors', method = 'GET' } = {}) =>
    dispatch('fetch', { request: { url: new URL(path, ORIGIN).href, method, mode } });

  return { routes, state, network, stores, caches, self, dispatch, fetchEvent };
}

const json = (body, init = {}) =>
  new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' }, ...init });

const PAGE = `<!doctype html><html><head>
<link rel="stylesheet" href="/_next/static/css/app-1.css">
<link rel="preload" href="/_next/static/media/font-1.woff2" as="font">
</head><body><script src="/_next/static/chunks/main-1.js"></script>
<script src="/_next/static/chunks/main-1.js"></script></body></html>`;

function servePage(sw, html = PAGE) {
  sw.routes.set('/', () => new Response(html, { headers: { 'Content-Type': 'text/html' } }));
  for (const asset of html.matchAll(/(?:src|href)="(\/_next\/static\/[^"]+)"/g)) {
    sw.routes.set(asset[1], () => new Response(`asset ${asset[1]}`));
  }
}

describe('install and activate', () => {
  it('caches the page and the assets it references, even if an optional file is missing', async () => {
    const sw = setup();
    servePage(sw);
    sw.routes.set('/manifest.webmanifest', () => json({ name: 'DrancyBus' }));
    // /icon.svg and the PNG icons are deliberately missing (404)

    const install = sw.dispatch('install');
    await install.settled();

    expect(await (await sw.caches.open('drancybus-shell-v1')).match('/')).toBeDefined();
    const staticCache = await sw.caches.open('drancybus-static-v1');
    expect((await staticCache.keys()).map((k) => new URL(k.url).pathname).sort()).toEqual([
      '/_next/static/chunks/main-1.js',
      '/_next/static/css/app-1.css',
      '/_next/static/media/font-1.woff2',
    ]);
    expect(sw.self.skipWaiting).toHaveBeenCalled();
  });

  it('fails the install when the page itself cannot be fetched', async () => {
    const sw = setup();
    sw.state.offline = true;
    const install = sw.dispatch('install');
    const [result] = await Promise.allSettled([install.settled().then(() => sw.self.skipWaiting.mock.calls.length)]);
    expect(result.value).toBe(0);
  });

  it('removes caches of older versions only', async () => {
    const sw = setup();
    await sw.caches.open('drancybus-shell-v0');
    await sw.caches.open('drancybus-api-v1');
    await sw.caches.open('some-other-app');

    const activate = sw.dispatch('activate');
    await activate.settled();

    expect((await sw.caches.keys()).sort()).toEqual(['drancybus-api-v1', 'some-other-app']);
    expect(sw.self.clients.claim).toHaveBeenCalled();
  });
});

describe('API requests', () => {
  const PATH = '/api/idfm/departures?profile=aller';
  const body = { success: true, data: [1], timestamp: '2026-10-17T18:00:00.000Z' };

  it('answers from the network when it can, and saves the response', async () => {
    const sw = setup();
    sw.routes.set(PATH, () => json(body));

    const event = sw.fetchEvent(PATH);
    const response = await event.response();
    await event.settled();

    expect(response.headers.get('x-drancybus-cache')).toBeNull();
    expect(await response.json()).toEqual(body);
    expect(await (await sw.caches.open('drancybus-api-v1')).match(PATH)).toBeDefined();
  });

  it('replays the saved response, marked, when the network is down', async () => {
    const sw = setup();
    sw.routes.set(PATH, () => json(body));
    await sw.fetchEvent(PATH).settled();

    sw.state.offline = true;
    const response = await sw.fetchEvent(PATH).response();

    expect(response.headers.get('x-drancybus-cache')).toBe('hit');
    expect(await response.json()).toEqual(body); // original timestamp kept
  });

  it('keeps profiles apart', async () => {
    const sw = setup();
    sw.routes.set(PATH, () => json(body));
    await sw.fetchEvent(PATH).settled();

    sw.state.offline = true;
    await expect(sw.fetchEvent('/api/idfm/departures?profile=retour').response()).rejects.toThrow('Failed to fetch');
  });

  it('prefers the saved response over a server error, and passes the error through otherwise', async () => {
    const sw = setup();
    sw.routes.set(PATH, () => json(body));
    await sw.fetchEvent(PATH).settled();

    sw.routes.set(PATH, () => json({ success: false, error: 'Le service IDFM ne répond pas' }, { status: 504 }));
    const replayed = await sw.fetchEvent(PATH).response();
    expect(replayed.status).toBe(200);
    expect(replayed.headers.get('x-drancybus-cache')).toBe('hit');

    const other = '/api/idfm/disruptions';
    sw.routes.set(other, () => json({ success: false }, { status: 504 }));
    expect((await sw.fetchEvent(other).response()).status).toBe(504);
  });

  describe('slow network', () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it('gives up after 6 s, serves the saved copy, then refreshes it in the background', async () => {
      const sw = setup();
      sw.routes.set(PATH, () => json(body));
      await sw.fetchEvent(PATH).settled();

      const fresh = { ...body, timestamp: '2026-10-17T18:05:00.000Z' };
      let release;
      sw.routes.set(PATH, () => new Promise((resolve) => (release = () => resolve(json(fresh)))));

      const event = sw.fetchEvent(PATH);
      await vi.advanceTimersByTimeAsync(6000);
      const response = await event.response();
      expect(response.headers.get('x-drancybus-cache')).toBe('hit');
      expect((await response.json()).timestamp).toBe(body.timestamp);

      release();
      await event.settled();
      const saved = await (await sw.caches.open('drancybus-api-v1')).match(PATH);
      expect((await saved.json()).timestamp).toBe(fresh.timestamp);
    });
  });
});

describe('page and assets', () => {
  it('serves the saved page offline, and a minimal page when nothing is saved', async () => {
    const empty = setup();
    empty.state.offline = true;
    const fallback = await empty.fetchEvent('/', { mode: 'navigate' }).response();
    expect(fallback.status).toBe(503);
    expect(await fallback.text()).toContain('Hors ligne');

    const sw = setup();
    servePage(sw);
    await sw.fetchEvent('/', { mode: 'navigate' }).settled();
    sw.state.offline = true;
    const page = await sw.fetchEvent('/?utm=home', { mode: 'navigate' }).response();
    expect(await page.text()).toContain('main-1.js');
  });

  it('picks up the assets of a new deployment and keeps the static cache bounded', async () => {
    const sw = setup();
    const many = Array.from({ length: 160 }, (_, i) => `<script src="/_next/static/chunks/c-${i}.js"></script>`).join('');
    servePage(sw, `<html><body>${many}</body></html>`);

    const event = sw.fetchEvent('/', { mode: 'navigate' });
    expect((await event.response()).ok).toBe(true);
    await event.settled();

    const keys = await (await sw.caches.open('drancybus-static-v1')).keys();
    expect(keys).toHaveLength(150);
    expect(keys.at(-1).url).toContain('c-159.js'); // newest kept, oldest dropped
  });

  it('serves hashed assets from the cache once saved', async () => {
    const sw = setup();
    sw.routes.set('/_next/static/chunks/map.js', () => new Response('map'));
    await (await sw.fetchEvent('/_next/static/chunks/map.js').response()).text();
    sw.state.offline = true;

    const response = await sw.fetchEvent('/_next/static/chunks/map.js').response();
    expect(await response.text()).toBe('map');
    expect(sw.network).toHaveBeenCalledTimes(1);
  });

  it('leaves cross-origin, non-GET and unknown requests to the browser', () => {
    const sw = setup();
    expect(sw.fetchEvent('https://a.tile.openstreetmap.org/14/1/1.png').responded).toBe(false);
    expect(sw.fetchEvent('/api/idfm/departures', { method: 'POST' }).responded).toBe(false);
    expect(sw.fetchEvent('/robots.txt').responded).toBe(false);
  });
});
