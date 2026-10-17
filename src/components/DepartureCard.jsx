import DepartureRow from './DepartureRow';
import ScreenCard, { ScreenMessage } from './ScreenCard';

const DEPARTURES_PER_ROW = 2;

/**
 * Groups departures by line and destination, keeping the soonest first, the
 * way RATP screens show one row per destination with the next two waits.
 */
function groupDepartures(departures) {
  const groups = new Map();
  for (const departure of departures) {
    const key = `${departure.lineRef}|${departure.destination}`;
    const group = groups.get(key);
    if (!group) {
      groups.set(key, { key, first: departure, departures: [departure] });
    } else if (group.departures.length < DEPARTURES_PER_ROW) {
      group.departures.push(departure);
    }
  }
  return Array.from(groups.values());
}

export default function DepartureCard({ stop, departures, error = null, lineColors, lineTypes }) {
  const groups = groupDepartures(departures);

  return (
    <ScreenCard title={stop.name} bodyClassName="min-h-24">
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
  );
}
