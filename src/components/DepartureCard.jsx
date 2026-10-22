import { stopTitle } from '@/lib/config-utils';
import { groupDepartures } from '@/lib/departure-groups';
import DepartureRow from './DepartureRow';
import ScreenCard, { ScreenMessage } from './ScreenCard';
import { MapIcon } from './ScreenIcons';

/**
 * Departures at one stop. Clicking anywhere on the card opens its map; the
 * title-bar button is the keyboard and screen-reader way in.
 */
export default function DepartureCard({ stop, departures, error = null, lineColors, lineTypes, onOpenMap }) {
  const groups = groupDepartures(departures);
  const title = stopTitle(stop);

  return (
    <div onClick={() => onOpenMap(stop)} className="min-w-0 cursor-pointer rounded-xl transition-transform active:scale-[0.99]">
      <ScreenCard
        title={title}
        aside={
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMap(stop);
            }}
            aria-label={`Carte : ${title}`}
            title="Voir sur la carte"
            className="shrink-0 rounded-md p-1.5 text-white hover:bg-white/15"
          >
            <MapIcon />
          </button>
        }
        bodyClassName="min-h-24"
      >
        {error ? (
          <ScreenMessage>Horaires indisponibles pour cet arrêt</ScreenMessage>
        ) : groups.length === 0 ? (
          <ScreenMessage>Aucun départ prévu</ScreenMessage>
        ) : (
          groups.map((group) => (
            <DepartureRow
              key={group.key}
              lineName={group.first.lineName}
              lineColor={lineColors?.[group.first.lineRef]}
              lineType={lineTypes?.[group.first.lineRef]}
              destination={group.first.destination}
              departures={group.departures}
            />
          ))
        )}
      </ScreenCard>
    </div>
  );
}
