import { SCREEN } from '@/lib/screen-theme';
import LineBadge from './LineBadge';

function WaitBox({ departure }) {
  if (departure.cancelled) {
    return (
      <span
        className="inline-flex items-center justify-center h-9 min-w-9 sm:min-w-11 px-1.5 sm:px-2 rounded-md bg-black text-xs font-bold leading-none"
        style={{ color: SCREEN.alert }}
        title={`Trajet de ${departure.minutesUntil} min supprimé`}
      >
        Supprimé
      </span>
    );
  }

  const label = departure.vehicleAtStop ? "À l'arrêt" : String(departure.minutesUntil);
  const imminent = !departure.vehicleAtStop && departure.minutesUntil === 0;

  return (
    <span
      className={`inline-flex items-center justify-center h-9 min-w-9 sm:min-w-11 px-1.5 sm:px-2 rounded-md bg-black font-bold tabular-nums leading-none ${
        departure.vehicleAtStop ? 'text-xs' : 'text-xl sm:text-2xl'
      } ${departure.isRealtime ? '' : 'opacity-60'} ${imminent ? 'animate-pulse' : ''}`}
      style={{ color: SCREEN.amber }}
      title={departure.isRealtime ? 'Temps réel' : 'Horaire théorique'}
    >
      {label}
    </span>
  );
}

export default function DepartureRow({ lineName, lineColor, lineType, destination, departures }) {
  return (
    <div className="flex items-center gap-2 sm:gap-3 bg-white pl-1.5 pr-1.5 sm:pr-2 py-1.5">
      <LineBadge name={lineName} color={lineColor} type={lineType} />

      <p className="flex-1 min-w-0 truncate font-bold" style={{ color: SCREEN.navy }}>
        {destination}
      </p>

      <div className="flex shrink-0 gap-1.5 sm:gap-2">
        {departures.map((departure) => (
          <WaitBox key={departure.id} departure={departure} />
        ))}
      </div>
    </div>
  );
}
