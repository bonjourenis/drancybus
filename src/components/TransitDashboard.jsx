'use client';

import { useState } from 'react';
import { useDepartures } from '@/hooks/useDepartures';
import DepartureBoard from './DepartureBoard';
import StopMapDialog from './StopMapDialog';
import TrafficCard from './TrafficCard';

/**
 * One profile's view. Owns the departures polling so departures are fetched
 * once and shared by the board and the map popups. Clicking a stop's card
 * opens its map.
 */
export default function TransitDashboard({ profile, config }) {
  const { settings, trackedLines } = config;
  const departures = useDepartures(profile.id, settings.departureRefreshInterval);
  const [mapStop, setMapStop] = useState(null);

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
          onOpenMap={setMapStop}
        />
      </section>

      {(profile.traffic ?? []).length > 0 && (
        <TrafficCard profileId={profile.id} refreshInterval={settings.trafficRefreshInterval} />
      )}

      {mapStop?.coordinates && (
        <StopMapDialog
          key={mapStop.id}
          stop={mapStop}
          profileId={profile.id}
          config={config}
          departures={departures.byStop[mapStop.id]}
          departuresLoading={departures.loading && departures.stops.length === 0}
          onClose={() => setMapStop(null)}
        />
      )}
    </>
  );
}
