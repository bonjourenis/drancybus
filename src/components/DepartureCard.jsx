import DepartureRow from './DepartureRow';

export default function DepartureCard({ stop, departures, lineColors }) {
  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-md overflow-hidden border border-zinc-200 dark:border-zinc-700">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3">
        <h3 className="font-semibold text-lg text-white">{stop.name}</h3>
        <p className="text-sm text-blue-100">
          Ligne{stop.lines.length > 1 ? 's' : ''} {stop.lines.map(l => l.lineName).join(', ')}
        </p>
      </div>

      <div className="divide-y divide-zinc-100 dark:divide-zinc-700">
        {departures.length === 0 ? (
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
