'use client';

import { useDepartures } from '@/hooks/useDepartures';
import { useVehicles } from '@/hooks/useVehicles';
import { profileConnections } from '@/lib/profiles';
import DepartureBoard from './DepartureBoard';
import ErrorBoundary from './ErrorBoundary';
import RefreshIndicator from './RefreshIndicator';
import TrafficCard from './TrafficCard';
import TransitMapLoader from './TransitMapLoader';

/**
 * One profile's view. Owns the polling hooks so departures are fetched once
 * and shared by the board and the map popups.
 */
export default function TransitDashboard({ profile, config }) {
  const { settings, trackedLines } = config;
  const departures = useDepartures(profile.id, settings.departureRefreshInterval);
  const vehicles = useVehicles(profile.id, settings.vehicleRefreshInterval);

  const lineColors = Object.fromEntries(trackedLines.map((line) => [line.lineId, line.color]));
  const lineTypes = Object.fromEntries(trackedLines.map((line) => [line.lineId, line.type]));

  return (
    <>
      <section>
        <DepartureBoard
          stops={departures.stops}
          loading={departures.loading}
          error={departures.error}
          stale={departures.stale}
          fromCache={departures.fromCache}
          lastUpdated={departures.lastUpdated}
          partialErrors={departures.partialErrors}
          refresh={departures.refresh}
          lineColors={lineColors}
          lineTypes={lineTypes}
        />
      </section>

      {(profile.traffic ?? []).length > 0 && (
        <TrafficCard profileId={profile.id} refreshInterval={settings.trafficRefreshInterval} />
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Carte des véhicules</h2>
          <RefreshIndicator
            lastUpdated={vehicles.lastUpdated}
            onRefresh={vehicles.refresh}
            loading={vehicles.loading}
            stale={vehicles.stale}
          />
        </div>
        <ErrorBoundary fallbackMessage="La carte n'a pas pu être affichée.">
          <TransitMapLoader
            lines={trackedLines}
            stops={profile.stops}
            connections={profileConnections(config, profile)}
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
