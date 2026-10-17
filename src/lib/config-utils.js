/**
 * Helpers for the favorites.json configuration. No data imports here so the
 * module is safe to use in client bundles.
 */

/**
 * Merge stop entries that share an ID so each stop is fetched and rendered
 * once, with the union of their line rules.
 */
export function groupStopsById(stops = []) {
  const byId = new Map();
  for (const stop of stops) {
    const existing = byId.get(stop.id);
    if (existing) {
      existing.lines = [...existing.lines, ...(stop.lines ?? [])];
    } else {
      byId.set(stop.id, { ...stop, lines: [...(stop.lines ?? [])] });
    }
  }
  return Array.from(byId.values());
}

/**
 * Strip "IDFM:C0" style prefixes: IDFM:C01173 -> 1173. Only used when no
 * better name is known.
 */
export function shortNameFromLineId(lineId) {
  const match = String(lineId ?? '').match(/C0*(\d+)/);
  return match ? match[1] : String(lineId ?? '?');
}
