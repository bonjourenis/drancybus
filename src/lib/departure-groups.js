/**
 * Group departures the way RATP screens show them: one row per line and
 * destination with the next waits. Each row keeps `perRow` running
 * departures; a cancelled one due before them is shown in its place in time
 * order, up to `perRow + 1` boxes, so a cancellation never hides the next
 * bus that actually runs.
 */
export function groupDepartures(departures, perRow = 2) {
  const groups = new Map();
  for (const departure of departures) {
    const key = `${departure.lineRef}|${departure.destination}`;
    let group = groups.get(key);
    if (!group) {
      group = { key, first: departure, departures: [], running: 0 };
      groups.set(key, group);
    }
    if (group.running >= perRow || group.departures.length >= perRow + 1) continue;
    group.departures.push(departure);
    if (!departure.cancelled) group.running += 1;
  }
  return Array.from(groups.values(), ({ running, ...group }) => group);
}
