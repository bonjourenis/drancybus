'use client';

import { useEffect, useRef } from 'react';
import { useVehicles } from '@/hooks/useVehicles';
import { stopTitle } from '@/lib/config-utils';
import { profileConnections } from '@/lib/profiles';
import { SCREEN } from '@/lib/screen-theme';
import ErrorBoundary from './ErrorBoundary';
import ScreenCard from './ScreenCard';
import TransitMapLoader from './TransitMapLoader';

/**
 * Modal map of one stop and the vehicles heading to it. Vehicle positions
 * are polled only while it is open. A bottom sheet on mobile, centred on
 * desktop; Escape, the close button or a click outside closes it.
 */
export default function StopMapDialog({ stop, profileId, config, departures, departuresLoading, onClose }) {
  const dialog = useRef(null);
  const vehicleState = useVehicles(profileId, config.settings.vehicleRefreshInterval);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  // The profile's vehicles, with the wait at this stop rather than at the
  // nearest stop each was seen from.
  const vehicles = vehicleState.vehicles
    .filter((vehicle) => vehicle.stopEtas?.[stop.id] != null)
    .map((vehicle) => ({ ...vehicle, minutesUntil: vehicle.stopEtas[stop.id] }))
    .sort((a, b) => a.minutesUntil - b.minutesUntil);

  const lineIds = new Set(stop.lines.map((line) => line.lineId));
  const lines = config.trackedLines.filter((line) => lineIds.has(line.lineId));
  const titleId = `map-title-${profileId}`;

  return (
    <dialog
      ref={dialog}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current.close();
      }}
      className="m-0 mt-auto w-full max-w-none max-h-dvh overflow-y-auto bg-transparent p-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop:bg-black/60 md:m-auto md:max-w-3xl md:p-0"
    >
      <ScreenCard
        title={<span id={titleId}>{stopTitle(stop)}</span>}
        aside={
          <button
            type="button"
            onClick={() => dialog.current.close()}
            aria-label="Fermer la carte"
            className="shrink-0 rounded-md p-1.5 text-white hover:bg-white/15"
          >
            <svg viewBox="0 0 24 24" className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
              <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        }
      >
        <p
          className="flex items-center justify-between gap-3 bg-white px-3 py-2 text-sm font-bold"
          style={{ color: SCREEN.navy }}
        >
          <span>
            {vehicleState.loading && vehicleState.vehicles.length === 0
              ? 'Recherche des véhicules...'
              : `${vehicles.length} véhicule${vehicles.length !== 1 ? 's' : ''} en approche`}
          </span>
          {vehicleState.loading && vehicleState.vehicles.length > 0 && (
            <span className="text-xs" style={{ color: SCREEN.muted }}>
              Actualisation...
            </span>
          )}
        </p>
        <ErrorBoundary fallbackMessage="La carte n'a pas pu être affichée.">
          <TransitMapLoader
            lines={lines}
            stop={stop}
            connections={profileConnections(config, { stops: [stop] })}
            vehicles={vehicles}
            error={vehicleState.error}
            departures={departures}
            departuresLoading={departuresLoading}
          />
        </ErrorBoundary>
      </ScreenCard>
    </dialog>
  );
}
