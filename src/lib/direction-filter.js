import { normalizeText } from './geo';

const toArray = (value) => (value == null ? [] : Array.isArray(value) ? value : [value]);

/**
 * Decide whether a parsed departure matches the direction rules of a line
 * entry in favorites.json. All rules present on the entry are applied:
 *
 *   directionRef / excludeDirectionRef  exact match on the SIRI DestinationRef
 *   direction / excludeDirection        substring match on the destination
 *                                       name, ignoring case, accents and
 *                                       punctuation
 */
export function matchesDirection(departure, lineConfig) {
  if (!lineConfig) return true;

  const includeRefs = toArray(lineConfig.directionRef);
  if (includeRefs.length > 0 && !includeRefs.includes(departure.destinationRef)) {
    return false;
  }

  const excludeRefs = toArray(lineConfig.excludeDirectionRef);
  if (excludeRefs.length > 0 && excludeRefs.includes(departure.destinationRef)) {
    return false;
  }

  const destination = normalizeText(departure.destination);

  const includeNames = toArray(lineConfig.direction).map(normalizeText).filter(Boolean);
  if (includeNames.length > 0 && !includeNames.some((name) => destination.includes(name))) {
    return false;
  }

  const excludeNames = toArray(lineConfig.excludeDirection).map(normalizeText).filter(Boolean);
  if (excludeNames.length > 0 && excludeNames.some((name) => destination.includes(name))) {
    return false;
  }

  return true;
}

/**
 * The stop's line entry this departure matches (right line, direction rules
 * pass), or null.
 */
export function findMatchingLineConfig(departure, stopConfig) {
  return (
    (stopConfig.lines ?? []).find(
      (line) => line.lineId === departure.lineRef && matchesDirection(departure, line)
    ) ?? null
  );
}

/**
 * True when the departure belongs to one of the stop's configured lines and
 * passes that line's direction rules.
 */
export function matchesStopConfig(departure, stopConfig) {
  return findMatchingLineConfig(departure, stopConfig) !== null;
}
