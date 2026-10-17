// IDFM Line Reference IDs
export const LINES = {
  BUS_148: 'IDFM:C01173',
  BUS_146: 'IDFM:C01171',
  METRO_5: 'IDFM:C01375',
  RER_B: 'IDFM:C01743',
};

// Line type configuration
export const LINE_TYPES = {
  bus: { icon: 'bus', prefix: 'Bus' },
  metro: { icon: 'train', prefix: 'Metro' },
  rer: { icon: 'train', prefix: 'RER' },
  tram: { icon: 'tram', prefix: 'Tram' },
};

// Official RATP/IDFM line colors
export const LINE_COLORS = {
  [LINES.BUS_148]: '#6BC24A',
  [LINES.BUS_146]: '#E4B4D3',
  [LINES.METRO_5]: '#F68F4B',
  [LINES.RER_B]: '#7BA3DC',
};

// Line display names mapping
export const LINE_NAMES = {
  [LINES.BUS_148]: '148',
  [LINES.BUS_146]: '146',
  [LINES.METRO_5]: '5',
  [LINES.RER_B]: 'B',
};

// OpenStreetMap tile configuration
export const MAP_TILES = {
  url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
};

// Default map center (Drancy area)
export const DEFAULT_CENTER = {
  lat: 48.92,
  lng: 2.45,
};

// Refresh intervals (ms)
export const REFRESH_INTERVALS = {
  departures: 60000, // 1 minute
  vehicles: 60000,   // 1 minute
};
