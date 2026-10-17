// OpenStreetMap tile configuration
export const MAP_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

// Used when a line has no colour in favorites.json and no official colour in line-data.json
export const DEFAULT_LINE_COLOR = '#3B82F6';

/**
 * Average commercial speed per mode, in metres per minute. Used to estimate
 * how far a vehicle still is from the stop it is heading to.
 */
export const AVERAGE_SPEED_M_PER_MIN = {
  bus: 250,
  tram: 300,
  metro: 500,
  rer: 800,
};

/**
 * How far (metres) a stop may sit from the route trace and still be
 * considered "on" that trace. Rail station centroids are further from the
 * tracks than bus stops are from the road.
 */
export const MAX_SNAP_DISTANCE_M = {
  bus: 150,
  tram: 150,
  metro: 400,
  rer: 500,
};

// Server-side cache for PRIM stop-monitoring responses
export const STOP_MONITORING_CACHE = {
  freshMs: 15_000,          // serve from memory without calling PRIM
  staleMaxMs: 10 * 60_000,  // serve last good data this long when PRIM fails
};

// Hard limit on every upstream request
export const UPSTREAM_TIMEOUT_MS = 8_000;

// Server-side cache for PRIM estimated-timetable responses (one per line).
// Fresh window is longer than stop monitoring because the feed is heavier and
// its quota is lower; stale window is shorter because positions age fast.
export const ESTIMATED_TIMETABLE_CACHE = {
  freshMs: 30_000,
  staleMaxMs: 5 * 60_000,
};

/**
 * Plausible speeds per mode, in metres per minute. A timetable call is only
 * used as a position anchor when the speed it implies between that call and
 * the monitored stop falls in this range: the bus feed sometimes lists
 * stops of the wrong direction or with times that contradict route order.
 */
export const SPEED_BOUNDS_M_PER_MIN = {
  bus: { min: 60, max: 500 }, //   3.6 - 30 km/h average, stops included
  tram: { min: 60, max: 600 },
  metro: { min: 100, max: 900 },
  rer: { min: 150, max: 1600 }, // up to ~95 km/h
};

// IDFM bulk disruptions feed: about 1.5 MB for the whole network.
export const DISRUPTIONS_CACHE = {
  freshMs: 2 * 60_000,
  staleMaxMs: 30 * 60_000,
  timeoutMs: 15_000,
  upcomingDays: 7,
};

// TomTom routing with live traffic. The free tier allows 2,500 calls a day.
export const TRAFFIC_CACHE = {
  freshMs: 3 * 60_000,
  staleMaxMs: 15 * 60_000,
};

/**
 * Traffic level from the ratio between travel time with traffic and
 * free-flow travel time. Delays under `minDelaySeconds` always count as fluid.
 */
export const TRAFFIC_LEVELS = {
  minDelaySeconds: 60,
  slowRatio: 1.25,
  heavyRatio: 1.6,
};
