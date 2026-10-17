#!/usr/bin/env node
/**
 * Snapshot route shapes and stop lists for every tracked line into
 * src/data/line-data.json.
 *
 * The data comes from the IDFM open-data portal and changes only a few
 * times a year, so it is committed to the repo rather than fetched at
 * runtime. Re-run with `npm run lines:update` after editing
 * src/config/favorites.json or when IDFM publishes new traces.
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://data.iledefrance-mobilites.fr/api/explore/v2.1/catalog/datasets';
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FAVORITES = path.join(ROOT, 'src/config/favorites.json');
const OUT = path.join(ROOT, 'src/data/line-data.json');

const round = (n) => Math.round(n * 1e6) / 1e6;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(url, { attempts = 4, timeoutMs = 20000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} for ${url}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error;
      console.warn(`  attempt ${attempt}/${attempts} failed: ${error.message}`);
      if (attempt < attempts) await sleep(1500 * attempt);
    }
  }
  throw lastError;
}

async function fetchShape(lineId) {
  const url = new URL(`${API}/traces-des-lignes-de-transport-en-commun-idfm/records`);
  url.searchParams.set('where', `route_id="${lineId}"`);
  url.searchParams.set('limit', '1');

  const data = await getJson(url);
  const record = data.results?.[0];
  if (!record) {
    throw new Error(`No route trace found for ${lineId}`);
  }

  const geometry = record.shape?.geometry;
  let rawSegments = [];
  if (geometry?.type === 'MultiLineString') {
    rawSegments = geometry.coordinates;
  } else if (geometry?.type === 'LineString') {
    rawSegments = [geometry.coordinates];
  }

  return {
    shortName: record.route_short_name,
    longName: record.route_long_name,
    routeType: record.route_type,
    officialColor: record.route_color ? `#${record.route_color}` : null,
    operator: record.operatorname ?? null,
    // Stored as [lat, lng] to match Leaflet; the source is GeoJSON [lng, lat].
    segments: rawSegments
      .filter((segment) => Array.isArray(segment) && segment.length > 1)
      .map((segment) => segment.map(([lng, lat]) => [round(lat), round(lng)])),
  };
}

async function fetchStops(lineId) {
  const rows = [];
  const limit = 100;
  let offset = 0;

  for (;;) {
    const url = new URL(`${API}/arrets-lignes/records`);
    url.searchParams.set('where', `id="${lineId}"`);
    url.searchParams.set('select', 'stop_id,stop_name,stop_lat,stop_lon');
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('offset', String(offset));

    const data = await getJson(url);
    const page = data.results ?? [];
    rows.push(...page);
    offset += page.length;
    if (page.length < limit || offset >= (data.total_count ?? 0)) break;
  }

  return rows
    .map((row) => ({
      id: row.stop_id,
      name: row.stop_name,
      lat: round(Number(row.stop_lat)),
      lng: round(Number(row.stop_lon)),
    }))
    .filter((stop) => stop.id && Number.isFinite(stop.lat) && Number.isFinite(stop.lng));
}

async function main() {
  const favorites = JSON.parse(await readFile(FAVORITES, 'utf8'));
  const lineIds = [...new Set((favorites.trackedLines ?? []).map((line) => line.lineId))];

  if (lineIds.length === 0) {
    throw new Error('No trackedLines found in favorites.json');
  }

  const lines = {};
  for (const lineId of lineIds) {
    console.log(`Fetching ${lineId} ...`);
    const [shape, stops] = await Promise.all([fetchShape(lineId), fetchStops(lineId)]);
    const pointCount = shape.segments.reduce((sum, segment) => sum + segment.length, 0);
    console.log(`  ${shape.shortName}: ${shape.segments.length} segments, ${pointCount} points, ${stops.length} stops`);
    lines[lineId] = { lineId, ...shape, stops };
  }

  const output = {
    generatedAt: new Date().toISOString(),
    source: API,
    coordinateOrder: 'lat,lng',
    lines,
  };

  await mkdir(path.dirname(OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify(output));
  console.log(`Wrote ${OUT}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
