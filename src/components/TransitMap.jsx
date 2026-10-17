'use client';

import { useEffect } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import 'leaflet-defaulticon-compatibility/dist/leaflet-defaulticon-compatibility.css';
import 'leaflet-defaulticon-compatibility';

import { useVehicles } from '@/hooks/useVehicles';
import { useDepartures } from '@/hooks/useDepartures';
import { MAP_TILES, LINE_COLORS } from '@/lib/constants';
import { getContrastTextColor } from '@/lib/color-utils';
import RefreshIndicator from './RefreshIndicator';

// Create custom vehicle icon with time until arrival
function createVehicleIcon(color, type = 'bus', minutesUntil = null) {
  const size = type === 'bus' ? 28 : 32;
  const showTime = minutesUntil !== null && minutesUntil >= 0;
  const timeText = showTime ? (minutesUntil <= 1 ? '!' : minutesUntil) : '';

  return L.divIcon({
    html: `
      <div style="
        position: relative;
        background-color: ${color};
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 6px rgba(0,0,0,0.4);
        display: flex;
        align-items: center;
        justify-content: center;
      ">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
          ${type === 'bus'
            ? '<path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>'
            : '<path d="M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>'
          }
        </svg>
        ${showTime ? `
          <div style="
            position: absolute;
            top: -8px;
            right: -8px;
            background-color: ${minutesUntil <= 1 ? '#22c55e' : '#3b82f6'};
            color: white;
            font-size: 10px;
            font-weight: bold;
            min-width: 16px;
            height: 16px;
            border-radius: 8px;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0 3px;
            border: 1px solid white;
          ">${timeText}</div>
        ` : ''}
      </div>
    `,
    className: 'vehicle-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

// Create stop icon
function createStopIcon() {
  return L.divIcon({
    html: `
      <div style="
        background-color: #EF4444;
        width: 12px;
        height: 12px;
        border-radius: 50%;
        border: 2px solid white;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
      "></div>
    `,
    className: 'stop-marker',
    iconSize: [12, 12],
    iconAnchor: [6, 6],
    popupAnchor: [0, -8],
  });
}

// Component to fit map to markers
function MapBoundsUpdater({ vehicles, stops }) {
  const map = useMap();

  useEffect(() => {
    const points = [
      ...vehicles.map(v => [v.position.lat, v.position.lng]),
      ...stops.filter(s => s.coordinates).map(s => [s.coordinates.lat, s.coordinates.lng]),
    ];

    if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
    }
  }, [map, vehicles.length, stops.length]);

  return null;
}

export default function TransitMap({ lines, stops, center, zoom, refreshInterval }) {
  const { vehicles, loading, error, lastUpdated, refresh } = useVehicles(lines, stops, refreshInterval);
  const { departures } = useDepartures(stops, refreshInterval);

  // Deduplicate stops by ID, merging their lines arrays
  const uniqueStops = Object.values(
    stops.reduce((acc, stop) => {
      if (acc[stop.id]) {
        acc[stop.id].lines = [...acc[stop.id].lines, ...stop.lines];
      } else {
        acc[stop.id] = { ...stop, lines: [...stop.lines] };
      }
      return acc;
    }, {})
  );

  // Create line color lookup
  const lineColors = {};
  const lineTypes = {};
  lines.forEach(l => {
    lineColors[l.lineId] = l.color || LINE_COLORS[l.lineId] || '#666';
    lineTypes[l.lineId] = l.type || 'bus';
  });

  const stopIcon = createStopIcon();

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {vehicles.length} véhicule{vehicles.length !== 1 ? 's' : ''} en circulation
          </span>
          {loading && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
              Actualisation...
            </span>
          )}
        </div>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} />
      </div>

      <div className="h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden shadow-md border border-zinc-200 dark:border-zinc-700">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution={MAP_TILES.attribution}
            url={MAP_TILES.url}
          />

          {/* Stop markers */}
          {uniqueStops.filter(s => s.coordinates).map(stop => (
            <Marker
              key={stop.id}
              position={[stop.coordinates.lat, stop.coordinates.lng]}
              icon={stopIcon}
            >
              <Popup>
                <div className="font-sans min-w-[200px]">
                  <strong className="text-base">{stop.name}</strong>
                  <p className="text-sm text-zinc-600 mt-1 mb-2">
                    {stop.lines.map(l => `Ligne ${l.lineName}`).join(', ')}
                  </p>
                  {departures[stop.id]?.departures?.length > 0 ? (
                    <div className="border-t border-zinc-200 pt-2">
                      <p className="text-xs text-zinc-500 mb-1">Prochains passages:</p>
                      {departures[stop.id].departures.slice(0, 4).map((dep, idx) => {
                        const badgeColor = lineColors[dep.lineRef] || '#3B82F6';
                        return (
                        <div key={dep.id || idx} className="flex items-center justify-between text-sm py-1">
                          <div className="flex items-center gap-2">
                            <span
                              className="inline-flex items-center justify-center min-w-[1.8rem] h-5 px-1 text-xs font-bold rounded"
                              style={{ backgroundColor: badgeColor, color: getContrastTextColor(badgeColor) }}
                            >
                              {dep.lineName}
                            </span>
                            <span className="text-zinc-700 truncate max-w-[100px]">{dep.destination}</span>
                          </div>
                          <span className={`font-mono font-medium ${dep.minutesUntil <= 1 ? 'text-green-600' : dep.minutesUntil <= 5 ? 'text-orange-600' : 'text-zinc-900'}`}>
                            {dep.displayTime}
                          </span>
                        </div>
                      );})}
                    </div>
                  ) : (
                    <p className="text-xs text-zinc-400 italic">Chargement...</p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          {/* Vehicle markers */}
          {vehicles.map(vehicle => (
            <Marker
              key={vehicle.id}
              position={[vehicle.position.lat, vehicle.position.lng]}
              icon={createVehicleIcon(
                lineColors[vehicle.lineRef] || '#666',
                lineTypes[vehicle.lineRef] || 'bus',
                vehicle.minutesUntil
              )}
            >
              <Popup>
                <div className="font-sans">
                  <strong className="text-base">Ligne {vehicle.lineName}</strong>
                  <p className="text-sm text-zinc-600 mt-1">
                    Direction: {vehicle.destination}
                  </p>
                  {vehicle.minutesUntil !== undefined && (
                    <p className="text-sm font-medium text-blue-600 mt-1">
                      {vehicle.minutesUntil <= 1 ? 'Arrivée imminente' : `Dans ${vehicle.minutesUntil} min`}
                    </p>
                  )}
                  {vehicle.isEstimated && (
                    <p className="text-xs text-zinc-400 mt-1 italic">
                      Position estimée
                    </p>
                  )}
                </div>
              </Popup>
            </Marker>
          ))}

          <MapBoundsUpdater vehicles={vehicles} stops={uniqueStops} />
        </MapContainer>
      </div>

      {error && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Impossible de charger les positions des véhicules
        </p>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 justify-center pt-2">
        {lines.map(line => (
          <div key={line.lineId} className="flex items-center gap-2 text-sm">
            <span
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: line.color || LINE_COLORS[line.lineId] }}
            />
            <span className="text-zinc-700 dark:text-zinc-300">{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
