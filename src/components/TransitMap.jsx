'use client';

import { useEffect, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

import { MAP_TILES, DEFAULT_LINE_COLOR } from '@/lib/constants';
import { groupStopsById } from '@/lib/config-utils';
import { SCREEN, SCREEN_FONT } from '@/lib/screen-theme';
import LineBadge from './LineBadge';
import ScreenCard, { ScreenMessage } from './ScreenCard';

const BUS_PATH =
  'M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z';
const TRAIN_PATH =
  'M12 2c-4 0-8 .5-8 4v9.5C4 17.43 5.57 19 7.5 19L6 20.5v.5h2l2-2h4l2 2h2v-.5L16.5 19c1.93 0 3.5-1.57 3.5-3.5V6c0-3.5-4-4-8-4zM7.5 17c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm3.5-6H6V6h5v5zm2 0V6h5v5h-5zm3.5 6c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5z';

// Leaflet icons are plain objects; build each distinct one once.
const vehicleIconCache = new Map();
const STOP_ICON = L.divIcon({
  html: `<div style="background-color:${SCREEN.navy};width:12px;height:12px;border-radius:50%;border:2px solid white;box-shadow:0 1px 3px rgba(0,0,0,0.3);"></div>`,
  className: 'stop-marker',
  iconSize: [12, 12],
  iconAnchor: [6, 6],
  popupAnchor: [0, -8],
});

// Minute-counter background when the vehicle has no `towards` connection:
// amber on black like the screens, green when imminent.
const BADGE_IMMINENT = SCREEN.ok;
const BADGE_DEFAULT = '#000000';

function badgeColorFor(vehicle) {
  if (vehicle.towards?.color) return vehicle.towards.color;
  return vehicle.minutesUntil <= 1 ? BADGE_IMMINENT : BADGE_DEFAULT;
}

function getVehicleIcon(color, type, minutesUntil, badgeColor) {
  const key = `${color}|${type}|${minutesUntil ?? ''}|${badgeColor}`;
  let icon = vehicleIconCache.get(key);
  if (!icon) {
    icon = createVehicleIcon(color, type, minutesUntil, badgeColor);
    vehicleIconCache.set(key, icon);
  }
  return icon;
}

function createVehicleIcon(color, type, minutesUntil, badgeColor) {
  const size = type === 'bus' ? 28 : 32;
  const showTime = typeof minutesUntil === 'number' && minutesUntil >= 0;
  const timeText = showTime ? (minutesUntil <= 1 ? '!' : String(minutesUntil)) : '';
  const timeColor = badgeColor === BADGE_DEFAULT ? SCREEN.amber : 'white';

  return L.divIcon({
    html: `
      <div style="position:relative;background-color:${color};width:${size}px;height:${size}px;border-radius:50%;border:3px solid white;box-shadow:0 2px 6px rgba(0,0,0,0.4);display:flex;align-items:center;justify-content:center;">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="white" aria-hidden="true">
          <path d="${type === 'bus' ? BUS_PATH : TRAIN_PATH}"/>
        </svg>
        ${
          showTime
            ? `<div style="position:absolute;top:-9px;right:-10px;background-color:${badgeColor};color:${timeColor};font-size:11px;font-weight:bold;min-width:18px;height:18px;border-radius:9px;display:flex;align-items:center;justify-content:center;padding:0 4px;border:1.5px solid white;box-shadow:0 1px 2px rgba(0,0,0,0.35);">${timeText}</div>`
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

// Base map recoloured as a duotone of the screens: dark tones become navy,
// mid tones lavender, light tones white. Applied to the tile pane in CSS.
const TINT_FILTER_ID = 'ratp-map-tint';
const TINT_STOPS = [SCREEN.navy, SCREEN.trafficBackground, '#FFFFFF'];
const LUMINANCE_ROW = '0.2126 0.7152 0.0722 0 0';

function tintTable(channel) {
  return TINT_STOPS.map((hex) => (parseInt(hex.slice(1 + channel * 2, 3 + channel * 2), 16) / 255).toFixed(3)).join(' ');
}

function MapTintFilter() {
  return (
    <svg aria-hidden="true" width="0" height="0" className="absolute">
      <filter id={TINT_FILTER_ID} colorInterpolationFilters="sRGB">
        <feColorMatrix type="matrix" values={`${LUMINANCE_ROW} ${LUMINANCE_ROW} ${LUMINANCE_ROW} 0 0 0 1 0`} />
        <feComponentTransfer>
          <feFuncR type="table" tableValues={tintTable(0)} />
          <feFuncG type="table" tableValues={tintTable(1)} />
          <feFuncB type="table" tableValues={tintTable(2)} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

function MinutesBox({ children }) {
  return (
    <span
      className="inline-flex items-center justify-center h-6 min-w-7 px-1.5 rounded bg-black text-sm font-bold tabular-nums"
      style={{ color: SCREEN.amber }}
    >
      {children}
    </span>
  );
}

function StopPopupContent({ stop, entry, loading, lineColors, lineTypes }) {
  const lineNames = Array.from(new Set(stop.lines.map((line) => `Ligne ${line.lineName}`)));

  let body;
  if (!entry && loading) {
    body = <p className="text-xs italic" style={{ color: SCREEN.muted }}>Chargement...</p>;
  } else if (entry?.error) {
    body = <p className="text-xs italic" style={{ color: SCREEN.muted }}>Horaires indisponibles</p>;
  } else if (!entry || entry.departures.length === 0) {
    body = <p className="text-xs italic" style={{ color: SCREEN.muted }}>Aucun départ prévu</p>;
  } else {
    body = (
      <div className="border-t pt-2" style={{ borderColor: SCREEN.divider }}>
        <p className="text-xs mb-1" style={{ color: SCREEN.muted }}>Prochains passages :</p>
        {entry.departures.slice(0, 4).map((departure) => (
          <div key={departure.id} className="flex items-center justify-between gap-3 text-sm py-1">
            <div className="flex items-center gap-2 min-w-0">
              <LineBadge
                name={departure.lineName}
                color={lineColors[departure.lineRef]}
                type={lineTypes[departure.lineRef]}
                size="sm"
              />
              <span className="font-bold truncate max-w-[120px]" style={{ color: SCREEN.navy }}>
                {departure.destination}
              </span>
            </div>
            <MinutesBox>{departure.vehicleAtStop ? "À l'arrêt" : departure.minutesUntil}</MinutesBox>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="min-w-[220px]" style={{ fontFamily: SCREEN_FONT }}>
      <strong className="text-base" style={{ color: SCREEN.navy }}>{stop.name}</strong>
      <p className="text-sm mt-1 mb-2" style={{ color: SCREEN.muted }}>{lineNames.join(', ')}</p>
      {body}
    </div>
  );
}

export default function TransitMap({
  lines,
  stops,
  connections = [],
  center,
  zoom,
  vehicles: vehicleState,
  departuresByStop,
  departuresLoading,
}) {
  const { vehicles, loading, error, unplaced } = vehicleState;
  const uniqueStops = groupStopsById(stops);

  const lineColors = {};
  const lineTypes = {};
  for (const line of lines) {
    lineColors[line.lineId] = line.color || DEFAULT_LINE_COLOR;
    lineTypes[line.lineId] = line.type || 'bus';
  }

  const title = `${vehicles.length} véhicule${vehicles.length !== 1 ? 's' : ''} en approche`;

  return (
    <ScreenCard
      title={title}
      aside={
        loading && (
          <span className="text-xs font-bold" style={{ color: SCREEN.amber }}>
            Actualisation...
          </span>
        )
      }
    >
      <div
        className="ratp-map h-[400px] md:h-[500px] w-full"
        style={{ '--screen-navy': SCREEN.navy, '--screen-amber': SCREEN.amber }}
      >
        <MapTintFilter />
        <MapContainer
          center={[center.lat, center.lng]}
          zoom={zoom}
          style={{ height: '100%', width: '100%', backgroundColor: SCREEN.divider }}
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
                    lineTypes={lineTypes}
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
                vehicle.minutesUntil,
                badgeColorFor(vehicle)
              )}
            >
              <Popup>
                <div style={{ fontFamily: SCREEN_FONT, color: SCREEN.muted }}>
                  <strong className="text-base" style={{ color: SCREEN.navy }}>
                    Ligne {vehicle.lineName}
                  </strong>
                  <p className="text-sm mt-1">Direction : {vehicle.destination}</p>
                  {vehicle.towards && (
                    <p className="text-sm font-semibold mt-1" style={{ color: vehicle.towards.color }}>
                      Vers {vehicle.towards.label}
                    </p>
                  )}
                  <p className="text-sm">Prochain arrêt suivi : {vehicle.nextStopName}</p>
                  <p className="text-sm font-bold mt-1 flex items-center gap-2" style={{ color: SCREEN.navy }}>
                    {vehicle.minutesUntil <= 1 ? (
                      'Arrivée imminente'
                    ) : (
                      <>
                        Dans <MinutesBox>{vehicle.minutesUntil}</MinutesBox> min
                      </>
                    )}
                  </p>
                  {vehicle.positionMethod === 'timetable' && vehicle.anchorStopName && (
                    <p className="text-xs mt-1">
                      Prochain arrêt : {vehicle.anchorStopName}
                      {vehicle.minutesToAnchor > 1 ? ` (${Math.round(vehicle.minutesToAnchor)} min)` : ''}
                    </p>
                  )}
                  {vehicle.atTerminus && (
                    <p className="text-xs mt-1">Au terminus ou en fin de trajet précédent</p>
                  )}
                  <p className="text-xs mt-1 italic">
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
        <ScreenMessage className="py-2 text-sm text-center">
          Impossible d&apos;actualiser les positions des véhicules
        </ScreenMessage>
      )}
      {!error && unplaced > 0 && (
        <ScreenMessage className="py-2 text-xs text-center">
          {unplaced} véhicule{unplaced > 1 ? 's' : ''} non localisable{unplaced > 1 ? 's' : ''} sur le tracé
        </ScreenMessage>
      )}

      <div
        className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 bg-white px-3 py-2.5 text-sm font-bold"
        style={{ color: SCREEN.navy }}
      >
        {lines.map((line) => (
          <div key={line.lineId} className="flex items-center gap-2">
            <span
              className="w-4 h-4 rounded-full border-2 border-white shadow"
              style={{ backgroundColor: line.color || DEFAULT_LINE_COLOR }}
            />
            <span>{line.name}</span>
          </div>
        ))}
        {connections.map((connection) => (
          <div key={connection.id} className="flex items-center gap-2">
            <span
              className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[11px] font-bold text-white"
              style={{ backgroundColor: connection.color }}
              aria-hidden="true"
            >
              4
            </span>
            <span>Vers {connection.label}</span>
          </div>
        ))}
      </div>
    </ScreenCard>
  );
}
