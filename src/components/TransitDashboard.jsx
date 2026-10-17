'use client';

import { useDepartures } from '@/hooks/useDepartures';
import { useVehicles } from '@/hooks/useVehicles';
import DepartureBoard from './DepartureBoard';
import ErrorBoundary from './ErrorBoundary';
import TransitMapLoader from './TransitMapLoader';

/**
 * Owns the two polling hooks so departures are fetched once and shared by the
 * board and the map popups.
 */
export default function TransitDashboard({ stops, lines, settings }) {
  const departures = useDepartures(settings.departureRefreshInterval);
  const vehicles = useVehicles(settings.vehicleRefreshInterval);

  const lineColors = Object.fromEntries(lines.map((line) => [line.lineId, line.color]));

  return (
    <>
      <section>
        <DepartureBoard
          stops={departures.stops}
          loading={departures.loading}
          error={departures.error}
          stale={departures.stale}
          lastUpdated={departures.lastUpdated}
          partialErrors={departures.partialErrors}
          refresh={departures.refresh}
          lineColors={lineColors}
        />
      </section>

      <section>
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white mb-4">
          Carte des véhicules
        </h2>
        <ErrorBoundary fallbackMessage="La carte n'a pas pu être affichée.">
          <TransitMapLoader
            lines={lines}
            stops={stops}
            center={settings.mapCenter}
            zoom={settings.mapZoom}
            vehicles={vehicles}
            departuresByStop={departures.byStop}
            departuresLoading={departures.loading && departures.stops.length === 0}
          />
        </ErrorBoundary>
      </section>
    </>
  );
}
