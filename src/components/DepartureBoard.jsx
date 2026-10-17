'use client';

import DepartureCard from './DepartureCard';
import RefreshIndicator from './RefreshIndicator';
import LoadingSpinner from './LoadingSpinner';

export default function DepartureBoard({
  stops,
  loading,
  error,
  stale,
  lastUpdated,
  partialErrors,
  refresh,
  lineColors,
}) {
  const hasData = stops.length > 0;

  if (loading && !hasData) {
    return <LoadingSpinner message="Chargement des horaires..." />;
  }

  if (error && !hasData) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 p-6 rounded-xl border border-red-200 dark:border-red-800">
        <h3 className="text-red-800 dark:text-red-200 font-semibold mb-2">Erreur de chargement</h3>
        <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
        <button
          type="button"
          onClick={refresh}
          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const hadProblem = Boolean(error) || partialErrors.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-zinc-900 dark:text-white">Prochains départs</h2>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} stale={stale} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {stops.map(({ stop, departures, error: stopError }) => (
          <DepartureCard
            key={stop.id}
            stop={stop}
            departures={departures}
            error={stopError}
            lineColors={lineColors}
          />
        ))}
      </div>

      {hadProblem && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Certaines données n&apos;ont pas pu être mises à jour
        </p>
      )}
      {stale && !hadProblem && (
        <p className="text-sm text-amber-600 dark:text-amber-400 text-center">
          Le service IDFM répond mal : horaires possiblement obsolètes
        </p>
      )}
    </div>
  );
}
