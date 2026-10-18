import { groupDepartures } from '@/lib/departure-groups';
import DepartureRow from './DepartureRow';
import ScreenCard, { ScreenMessage } from './ScreenCard';

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
