/*
 * DrancyBus service worker.
 *
 * - The page (navigation) is network-first: online you always get the latest
 *   deployment; offline the last copy is shown.
 * - Hashed build assets (/_next/static) are cache-first: their URL changes
 *   whenever their content does. The ones the page references are precached
 *   at install, read from the page's own HTML.
 * - API responses are network-first with a short timeout. When the network
 *   fails, is too slow or answers an error, the last good response is served
 *   with an `x-drancybus-cache: hit` header so the page can flag it as old
 *   (the body keeps its original `timestamp`).
 * - Cross-origin requests (map tiles, TomTom is server-side) are left to the
 *   browser: caching opaque tile responses would eat the storage quota.
 */

const VERSION = 'v1';
const SHELL_CACHE = `drancybus-shell-${VERSION}`;
const STATIC_CACHE = `drancybus-static-${VERSION}`;
const API_CACHE = `drancybus-api-${VERSION}`;
const CACHES = [SHELL_CACHE, STATIC_CACHE, API_CACHE];

const SHELL_URLS = [
  '/',
  '/manifest.webmanifest',
  '/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
];
const SHELL_PATHS = new Set(SHELL_URLS);

const API_TIMEOUT_MS = 6000;
const MAX_STATIC_ENTRIES = 150;
const CACHE_HEADER = 'x-drancybus-cache';

/** /_next/static URLs referenced by an HTML page (scripts, styles, fonts). */
function extractStaticAssets(html) {
  const urls = new Set();
  const pattern = /(?:src|href)="(\/_next\/static\/[^"]+)"/g;
  let match;
  while ((match = pattern.exec(html))) {
    urls.add(match[1].replace(/&amp;/g, '&'));
  }
  return [...urls];
}

async function precacheAssets(html) {
  const cache = await caches.open(STATIC_CACHE);
  await Promise.all(
    extractStaticAssets(html).map(async (url) => {
      if (await cache.match(url)) return;
      try {
        await cache.add(url);
      } catch {
        // A missing asset must not break the install; it will be fetched on use.
      }
    })
  );
}

async function trimCache(name, maxEntries) {
  const cache = await caches.open(name);
  const keys = await cache.keys();
  // keys() lists entries in insertion order: drop the oldest.
  await Promise.all(keys.slice(0, Math.max(0, keys.length - maxEntries)).map((key) => cache.delete(key)));
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      }
    );
  });
}

function markAsCached(response) {
  const headers = new Headers(response.headers);
  headers.set(CACHE_HEADER, 'hit');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const shell = await caches.open(SHELL_CACHE);
      await shell.add('/'); // required: without the page there is no offline mode
      await Promise.all(SHELL_URLS.slice(1).map((url) => shell.add(url).catch(() => {})));
      const page = await shell.match('/');
      if (page) await precacheAssets(await page.text());
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names.filter((name) => name.startsWith('drancybus-') && !CACHES.includes(name)).map((name) => caches.delete(name))
      );
      await self.clients.claim();
    })()
  );
});

async function handleNavigation(event) {
  const cache = await caches.open(SHELL_CACHE);
  try {
    const response = await fetch(event.request);
    if (response.ok) {
      const copy = response.clone();
      event.waitUntil(
        (async () => {
          await cache.put('/', copy.clone());
          await precacheAssets(await copy.text());
          await trimCache(STATIC_CACHE, MAX_STATIC_ENTRIES);
        })()
      );
    }
    return response;
  } catch {
    const cached = (await cache.match(event.request, { ignoreSearch: true })) ?? (await cache.match('/'));
    if (cached) return cached;
    return new Response('<!doctype html><meta charset="utf-8"><title>DrancyBus</title><p>Hors ligne.</p>', {
      status: 503,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

async function handleApi(event) {
  const { request } = event;
  const cache = await caches.open(API_CACHE);

  const network = fetch(request).then(async (response) => {
    if (response.ok) await cache.put(request, response.clone());
    return response;
  });
  // Keep the worker alive so a slow response still refreshes the cache.
  event.waitUntil(network.catch(() => undefined));

  try {
    const response = await withTimeout(network, API_TIMEOUT_MS);
    if (response.ok) return response;
    const cached = await cache.match(request);
    return cached ? markAsCached(cached) : response;
  } catch {
    const cached = await cache.match(request);
    if (cached) return markAsCached(cached);
    return network; // nothing cached: let the page see the real outcome
  }
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) await cache.put(request, response.clone());
  return response;
}

async function handleShellAsset(event) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(event.request, { ignoreSearch: true });
  const refresh = fetch(event.request)
    .then(async (response) => {
      if (response.ok) await cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => undefined);
  event.waitUntil(refresh);
  return cached ?? (await refresh) ?? Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith('/api/')) {
    event.respondWith(handleApi(event));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(handleStatic(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(event));
  } else if (SHELL_PATHS.has(url.pathname)) {
    event.respondWith(handleShellAsset(event));
  }
});
