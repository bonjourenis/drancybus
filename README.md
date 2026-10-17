# DranCyBus

Real-time departures and a live map for the public transport around Drancy
(bus 148, bus 146, métro 5, RER B), built on the Île-de-France Mobilités
PRIM API.

## Getting started

```bash
cp .env.local.example .env.local   # then add your PRIM API key
npm install
npm run dev                        # http://localhost:3000
```

Get an API key at <https://prim.iledefrance-mobilites.fr/>. The server logs a
warning at startup and the API routes answer 503 while the key is missing.

## Scripts

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Development server                                        |
| `npm run build`        | Production build                                          |
| `npm run start`        | Serve the production build                                |
| `npm run lint`         | ESLint                                                    |
| `npm test`             | Unit tests (Vitest)                                       |
| `npm run lines:update` | Refresh `src/data/line-data.json` from IDFM open data     |

## Configuration

Everything the app shows is driven by [`src/config/favorites.json`](src/config/favorites.json):

- **`stops`**: the stops to display. Each entry has a PRIM `MonitoringRef`
  (`STIF:StopPoint:Q:…:` for a platform, `STIF:StopArea:SP:…:` for a whole
  station), a display name, coordinates for the map, and the lines to show
  there. A line entry may restrict directions:
  - `direction` / `excludeDirection`: substring match on the destination name.
    Case, accents and punctuation are ignored, so `"Le Bourget RER"` matches the
    feed's `"Le Bourget <RER>"`.
  - `directionRef` / `excludeDirectionRef`: exact match on the SIRI
    `DestinationRef`.
  All rules present on an entry are applied.
- **`trackedLines`**: lines drawn on the map, with name, mode (`bus`, `tram`,
  `metro`, `rer`) and colour. A line only produces vehicles if at least one
  configured stop lists it.
- **`settings`**: refresh intervals, departures per stop, map centre and zoom,
  and `vehicleHorizonMinutes`, the furthest-out departure turned into a marker.

After changing `trackedLines`, run `npm run lines:update` so the route traces
and stop lists for the new lines are available.

## How it works

```
browser ──/api/idfm/departures──▶ departures-service ─┐
        ──/api/idfm/vehicles────▶ vehicles-service ───┼─▶ stop-monitoring-cache ─▶ PRIM stop-monitoring
                                                       │
                                  position-estimator ◀─┘  (+ src/data/line-data.json)
```

- **One upstream call per stop.** Both routes read the same cached SIRI
  response per stop. Responses are reused for 15 s, concurrent requests share
  one fetch, and when PRIM fails the last good response is served for up to
  10 min flagged `stale`. Every upstream call has an 8 s timeout.
- **Static route data.** Route traces and stop lists come from IDFM open data
  but change rarely, so they are committed in `src/data/line-data.json`
  instead of being fetched at runtime.
- **Vehicle positions are estimates.** The stop-monitoring feed has no GPS.
  For each departure the estimator picks the trace segment that passes the
  monitored stop before the journey's destination (which fixes the direction
  of travel) and walks back from the stop by `minutes × average speed` for the
  mode. Vehicles are identified by the SIRI dated journey reference, so a bus
  seen from two stops is one marker.
- **Client polling** pauses while the tab is hidden, refreshes on return and
  when the browser comes back online, aborts superseded requests and keeps the
  last good data when a refresh fails.

## Project layout

```
src/app/            Next.js app router (page + API routes)
src/components/     UI (TransitDashboard owns the data hooks)
src/hooks/          usePolling and the two data hooks
src/lib/            Pure logic: parser, filters, estimator, cache, services
src/lib/__tests__/  Vitest unit tests, with real SIRI responses as fixtures
src/config/         favorites.json
src/data/           line-data.json (generated)
scripts/            fetch-line-data.mjs
```
