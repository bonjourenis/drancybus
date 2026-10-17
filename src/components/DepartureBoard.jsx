'use client';

import { useDepartures } from '@/hooks/useDepartures';
import DepartureCard from './DepartureCard';
import RefreshIndicator from './RefreshIndicator';
import LoadingSpinner from './LoadingSpinner';

export default function DepartureBoard({ stops, lines, refreshInterval }) {
  const { departures, loading, error, lastUpdated, refresh } = useDepartures(
    stops,
    refreshInterval
  );

  // Build color lookup from tracked lines
  const lineColors = {};
  lines?.forEach(l => {
    lineColors[l.lineId] = l.color;
  });

  if (loading && Object.keys(departures).length === 0) {
    return <LoadingSpinner message="Chargement des horaires..." />;
  }

  if (error && Object.keys(departures).length === 0) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl border border-red-200 dark:border-red-800">
        <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">
          Erreur de chargement
        </h3>
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          onClick={refresh}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">
          Prochains départs
        </h2>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {Object.values(departures).map(({ stop, departures: deps }) => (
          <DepartureCard
            key={stop.id}
            stop={stop}
            departures={deps}
            lineColors={lineColors}
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Certaines données n'ont pas pu être mises à jour
        </p>
      )}
    </div>
  );
}
