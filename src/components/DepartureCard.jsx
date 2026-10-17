import DepartureRow from './DepartureRow';

export default function DepartureCard({ stop, departures, error = null, lineColors }) {
  const lineNames = Array.from(new Set(stop.lines.map((line) => line.lineName)));

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden border border-zinc-200 dark:border-zinc-700">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
        <h3 className="font-semibold text-lg text-white">{stop.name}</h3>
        <p className="text-sm text-blue-100">
          Ligne{lineNames.length > 1 ? 's' : ''} {lineNames.join(', ')}
        </p>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
        {error ? (
          <p className="px-4 py-6 text-amber-700 dark:text-amber-400 text-center italic">
            Horaires indisponibles pour cet arrêt
          </p>
        ) : departures.length === 0 ? (
          <p className="px-4 py-6 text-zinc-500 dark:text-zinc-400 text-center italic">
            Aucun départ prévu
          </p>
        ) : (
          departures.map((departure) => (
            <DepartureRow key={departure.id} departure={departure} lineColors={lineColors} />
          ))
        )}
      </div>
    </div>
  );
}
