'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_TILES, DEFAULT_LINE_COLOR } from '@/lib/constants';
import { getContrastTextColor } from '@/lib/color-utils';
import { groupStopsById } from '@/lib/config-utils';
import RefreshIndicator from './RefreshIndicator';

const BUS_PATH =
  'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z';
const TRAIN_PATH =
  'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z';

// Leaflet icons are plain objects; build each distinct one once.
const vehicleIconCache = new Map();
const STOP_ICON = L.divIcon({
  html: '<div style="background-color:#EF4444;width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>',
  className: 'stop-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

function getVehicleIcon(color, type, minutesUntil) {
  const key = `${color}|${type}|${minutesUntil ?? ''}`;
  let icon = vehicleIconCache.get(key);
  if (!icon) {
    icon = createVehicleIcon(color, type, minutesUntil);
    vehicleIconCache.set(key, icon);
  }
  return icon;
}

function createVehicleIcon(color, type, minutesUntil) {
  const size = type === 'bus' ? 28 : 32;
  const showTime = typeof minutesUntil === 'number' && minutesUntil >= 0;
  const timeText = showTime ? (minutesUntil <= 1 ? '!' : String(minutesUntil)) : '';
  const badgeColor = minutesUntil <= 1 ? '#22c55e' : '#3b82f6';

  return L.divIcon({
    html: `
      <div style="position:relative;background-color:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="${type === 'bus' ? BUS_PATH : TRAIN_PATH}"/>
        </svg>
        ${
          showTime
            ? `<div style="position:absolute;top:-8px;right:-8px;background-color:${badgeColor};color:white;font-size:10px;font-weight:bold;min-width:16px;height:16px;border-radius:8px;display:flex;align-items:center;justify-content:center;padding:0 3px;border:1px solid white;">${timeText}</div>`
            : ''
        }
      </div>`,
    className: 'vehicle-marker',
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

/**
 * Frame the configured stops once on mount, then leave the view alone so
 * refreshes never move the map under the user.
 */
function FitBoundsOnce({ stops }) {
  const map = useMap();
  const fitted = useRef(false);

  useEffect(() => {
    if (fitted.current) return;
    const points = stops
      .filter((stop) => stop.coordinates)
      .map((stop) => [stop.coordinates.lat, stop.coordinates.lng]);
    if (points.length < 2) return;
    fitted.current = true;
    map.fitBounds(L.latLngBounds(points), { padding: [50, 50], maxZoom: 15 });
  }, [map, stops]);

  return null;
}

function timeClass(minutesUntil) {
  if (minutesUntil <= 1) return 'text-green-600';
  if (minutesUntil <= 5) return 'text-orange-600';
  return 'text-zinc-900';
}

function StopPopupContent({ stop, entry, loading, lineColors }) {
  const lineNames = Array.from(new Set(stop.lines.map((line) => `Ligne ${line.lineName}`)));

  let body;
  if (!entry && loading) {
    body = <p className="text-xs text-zinc-400 italic">Chargement...</p>;
  } else if (entry?.error) {
    body = <p className="text-xs text-amber-600 italic">Horaires indisponibles</p>;
  } else if (!entry || entry.departures.length === 0) {
    body = <p className="text-xs text-zinc-400 italic">Aucun départ prévu</p>;
  } else {
    body = (
      <div className="border-t border-zinc-200 pt-2">
        <p className="text-xs text-zinc-500 mb-1">Prochains passages:</p>
        {entry.departures.slice(0, 4).map((departure) => {
          const badgeColor = lineColors[departure.lineRef] || DEFAULT_LINE_COLOR;
          return (
            <div key={departure.id} className="flex items-center justify-between text-sm py-1">
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center justify-center min-w-[1.8rem] h-5 px-1 text-xs font-bold rounded"
                  style={{ backgroundColor: badgeColor, color: getContrastTextColor(badgeColor) }}
                >
                  {departure.lineName}
                </span>
                <span className="text-zinc-700 truncate max-w-[100px]">{departure.destination}</span>
              </div>
              <span className={`font-mono font-medium ${timeClass(departure.minutesUntil)}`}>
                {departure.displayTime}
              </span>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="font-sans min-w-[200px]">
      <strong className="text-base">{stop.name}</strong>
      <p className="text-sm text-zinc-600 mt-1 mb-2">{lineNames.join(', ')}</p>
      {body}
    </div>
  );
}

export default function TransitMap({
  lines,
  stops,
  center,
  zoom,
  vehicles: vehicleState,
  departuresByStop,
  departuresLoading,
}) {
  const { vehicles, loading, error, stale, lastUpdated, unplaced, refresh } = vehicleState;
  const uniqueStops = groupStopsById(stops);

  const lineColors = {};
  const lineTypes = {};
  for (const line of lines) {
    lineColors[line.lineId] = line.color || DEFAULT_LINE_COLOR;
    lineTypes[line.lineId] = line.type || 'bus';
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600 dark:text-zinc-400">
            {vehicles.length} véhicule{vehicles.length !== 1 ? 's' : ''} en approche
          </span>
          {loading && (
            <span className="text-xs text-blue-600 dark:text-blue-400">Actualisation...</span>
          )}
        </div>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} stale={stale} />
      </div>

      <div className="h-[400px] md:h-[500px] w-full rounded-xl overflow-hidden shadow-md border border-zinc-200 dark:border-zinc-700">
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer attribution={MAP_TILES.attribution} url={MAP_TILES.url} />

          {uniqueStops
            .filter((stop) => stop.coordinates)
            .map((stop) => (
              <Marker
                key={stop.id}
                position={[stop.coordinates.lat, stop.coordinates.lng]}
                icon={STOP_ICON}
              >
                <Popup>
                  <StopPopupContent
                    stop={stop}
                    entry={departuresByStop[stop.id]}
                    loading={departuresLoading}
                    lineColors={lineColors}
                  />
                </Popup>
              </Marker>
            ))}

          {vehicles.map((vehicle) => (
            <Marker
              key={vehicle.id}
              position={[vehicle.position.lat, vehicle.position.lng]}
              icon={getVehicleIcon(
                lineColors[vehicle.lineRef] || vehicle.color || DEFAULT_LINE_COLOR,
                lineTypes[vehicle.lineRef] || vehicle.type || 'bus',
                vehicle.minutesUntil
              )}
            >
              <Popup>
                <div className="font-sans">
                  <strong className="text-base">Ligne {vehicle.lineName}</strong>
                  <p className="text-sm text-zinc-600 mt-1">Direction : {vehicle.destination}</p>
                  <p className="text-sm text-zinc-600">Prochain arrêt suivi : {vehicle.nextStopName}</p>
                  <p className="text-sm font-medium text-blue-600 mt-1">
                    {vehicle.minutesUntil <= 1 ? 'Arrivée imminente' : `Dans ${vehicle.minutesUntil} min`}
                  </p>
                  {vehicle.positionMethod === 'timetable' && vehicle.anchorStopName && (
                    <p className="text-xs text-zinc-500 mt-1">
                      Prochain arrêt : {vehicle.anchorStopName}
                      {vehicle.minutesToAnchor > 1 ? ` (${Math.round(vehicle.minutesToAnchor)} min)` : ''}
                    </p>
                  )}
                  <p className="text-xs text-zinc-400 mt-1 italic">
                    {vehicle.positionMethod === 'timetable'
                      ? "Position estimée d'après l'horaire temps réel"
                      : 'Position estimée'}
                  </p>
                </div>
              </Popup>
            </Marker>
          ))}

          <FitBoundsOnce stops={uniqueStops} />
        </MapContainer>
      </div>

      {error && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Impossible d&apos;actualiser les positions des véhicules
        </p>
      )}
      {!error && unplaced > 0 && (
        <p className="text-xs text-zinc-500 dark:text-zinc-400 text-center">
          {unplaced} véhicule{unplaced > 1 ? 's' : ''} non localisable{unplaced > 1 ? 's' : ''} sur le tracé
        </p>
      )}

      <div className="flex flex-wrap gap-4 justify-center pt-2">
        {lines.map((line) => (
          <div key={line.lineId} className="flex items-center gap-2 text-sm">
            <span
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: line.color || DEFAULT_LINE_COLOR }}
            />
            <span className="text-zinc-700 dark:text-zinc-300">{line.name}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
