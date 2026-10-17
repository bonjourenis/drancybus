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
