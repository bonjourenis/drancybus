# DrancyBus

Real-time departures and a live map for the public transport around Drancy
(bus 148, bus 146, bus 248, métro 5, RER B), built on the Île-de-France Mobilités
PRIM API.

## Getting started

```bash
cp .env.local.example .env.local   # then add your PRIM API key
npm install
npm run dev                        # http://localhost:3000
```

Get an API key at <https://prim.iledefrance-mobilites.fr/>. The server logs a
warning at startup and the API routes answer 503 while the key is missing.

Road traffic needs a second, optional key: add `TOMTOM_API_KEY` to
`.env.local` (free tier at <https://developer.tomtom.com/>, 2,500 requests a
day). Without it the traffic card says it is not configured and everything
else works.

## Scripts

| Command                | What it does                                              |
| ---------------------- | --------------------------------------------------------- |
| `npm run dev`          | Development server                                        |
| `npm run build`        | Production build                                          |
| `npm run start`        | Serve the production build                                |
| `npm run lint`         | ESLint                                                    |
| `npm test`             | Unit tests (Vitest)                                       |
| `npm run lines:update` | Refresh `src/data/line-data.json` from IDFM open data     |
| `npm run icons`        | Re-render `public/icons/*.png` from `src/app/icon.svg` (needs Chrome, `CHROME_PATH` to override) |

## Configuration

Everything the app shows is driven by [`src/config/favorites.json`](src/config/favorites.json):

- **`profiles`**: one tab each, "Aller", "Retour" and "Favoris". `defaultHours`
  (`{ "from": 0, "to": 12 }`) picks the tab that opens by default, in
  `settings.timeZone` (Paris); a profile without it never opens by default.
  `/#aller`, `/#retour` or `/#favoris` forces a tab. A profile has:
  - **`stops`**: the stops to display. Each entry has a PRIM `MonitoringRef`
    (`STIF:StopPoint:Q:…:` for one platform, `STIF:StopArea:SP:…:` for a
    whole station), a display name, an optional `heading` shown in the card
    title (`Danton → Bobigny - Pablo Picasso`), coordinates for the map, and
    the lines to show there. A line entry may restrict directions:
    - `direction` / `excludeDirection`: substring match on the destination
      name. Case, accents and punctuation are ignored, so `"Le Bourget RER"`
      matches the feed's `"Le Bourget <RER>"`.
    - `directionRef` / `excludeDirectionRef`: exact match on the SIRI
      `DestinationRef`.
    - `towards`: a key of `connections`. Vehicles matched on that entry get
      that connection's colour on their minute counter on the map.
  - **`traffic`**: road routes to check, `{ id, name, from, to, alongLine }`.
    `alongLine` keeps the car route on that bus line's road.
- **`connections`**: what a bus can be heading to, e.g. `"metro-5"` (orange)
  and `"rer-b"` (blue).
- **`trackedLines`**: lines shared by all profiles, with name, mode (`bus`,
  `tram`, `metro`, `rer`) and colour. They appear in the line status table;
  a line only produces vehicles if a stop of the active profile lists it.
- **`settings`**: time zone, refresh intervals, departures per stop, and
  `vehicleHorizonMinutes`, the furthest-out departure turned into a marker.

Clicking a stop's card opens a map of that stop and the vehicles heading to
it; vehicle positions are only polled while that map is open.

After changing `trackedLines`, run `npm run lines:update` so the route traces
and stop lists for the new lines are available.

## API

| Endpoint | Returns |
| --- | --- |
| `GET /api/idfm/departures?profile=aller` | Next departures per stop of the profile |
| `GET /api/idfm/vehicles?profile=aller` | Estimated vehicle positions, with `towards` and `stopEtas` (minutes to each stop) |
| `GET /api/idfm/disruptions` | Status of every tracked line: active and upcoming (7 days) disruptions |
| `GET /api/traffic?profile=aller` | Car travel time with live traffic vs free flow on the profile's routes |

`profile` defaults to the first profile; an unknown one answers 400.

## How it works

```
browser ──/api/idfm/departures───▶ departures-service ─┐
        ──/api/idfm/vehicles─────▶ vehicles-service ───┼─▶ stop-monitoring-cache ──────▶ PRIM stop-monitoring (per stop)
                                         │              └─▶ estimated-timetable-cache ─▶ PRIM estimated-timetable (per line)
                                   position-estimator  (+ src/data/line-data.json)
        ──/api/idfm/disruptions──▶ disruptions-service ───▶ PRIM disruptions_bulk (whole network)
        ──/api/traffic───────────▶ traffic-service ───────▶ TomTom calculateRoute (per route)
```

- **One upstream call per stop.** Both routes read the same cached SIRI
  response per stop. Responses are reused for 15 s, concurrent requests share
  one fetch, and when PRIM fails the last good response is served for up to
  10 min flagged `stale`. Every upstream call has an 8 s timeout.
- **Static route data.** Route traces and stop lists come from IDFM open data
  but change rarely, so they are committed in `src/data/line-data.json`
  instead of being fetched at runtime.
- **Vehicle positions are estimates.** No IDFM feed carries GPS. Stop
  monitoring decides which vehicles to show and how far they are from the
  configured stops. The estimator picks the trace segment on which the stop
  comes before the journey's destination (direction of travel), preferring
  the full-length route variant over short turns, and walks the vehicle back
  from the stop. The estimated-timetable feed (one call per line, cached
  30 s) can supply a closer anchor: an upcoming call that lies upstream of
  the stop and implies a plausible speed for the mode. The bus feed often
  lists stops of the other direction or times that contradict route order,
  so calls failing those checks are ignored. Otherwise the vehicle is walked
  back at the mode's average speed. When the walk-back runs past the start of
  the route the vehicle is flagged `atTerminus`. Vehicles are identified by
  the SIRI dated journey reference, so a bus seen from two stops is one
  marker.
- **Disruptions** come from the IDFM bulk feed (whole network, ~1.5 MB, one
  call cached 2 min). A line is "Interrompu" only for an active line-wide
  blocking disruption; station closures count as "Perturbé".
- **Traffic** comes from TomTom routing with live traffic, cached 3 min per
  route. The level compares travel time to free-flow time.
- **Client polling** pauses while the tab is hidden, refreshes on return and
  when the browser comes back online, aborts superseded requests and keeps the
  last good data when a refresh fails.

## Installing on a phone (PWA)

The app is installable and works offline once opened online.

- **Android / Chrome / Edge**: "Installer l'application" in the browser menu
  (or the install icon in the address bar). Long-press the home-screen icon
  for the Aller and Retour shortcuts.
- **iPhone / iPad**: Safari, Share, "Sur l'écran d'accueil".

Pieces: `src/app/manifest.js` (manifest), `public/icons/` (192/512 icons,
plain and maskable), `public/sw.js` (service worker, production only),
`src/components/ServiceWorkerRegister.jsx` and `OfflineNotice.jsx`.

Offline behaviour, from `public/sw.js`:

- The page is network-first: online you always get the latest deployment.
- Build assets are precached from the page's HTML and then served
  cache-first (their URLs are content-hashed).
- API calls are network-first with a 6 s timeout. When the network fails, is
  slow or the server errors, the last good response is replayed with an
  `x-drancybus-cache: hit` header; the page flags it as stale and shows its
  real age from the response `timestamp`. Each profile is cached separately.
- Map tiles are not cached by the worker (only by the browser's HTTP cache).

To ship a worker change that must drop old caches, bump `VERSION` in
`public/sw.js`. In development the worker is unregistered automatically; if a
dev page ever looks stale after a production run on the same port, reload once.

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
