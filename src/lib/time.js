/**
 * Time-zone helpers built on Intl only, safe in the browser and on the
 * server. The commute is in Paris, so "before noon" means Paris time
 * whatever the clock of the device or the server.
 */

const formatters = new Map();

function partsIn(date, timeZone) {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    });
    formatters.set(timeZone, formatter);
  }
  const parts = {};
  for (const part of formatter.formatToParts(date)) parts[part.type] = part.value;
  return parts;
}

/** Hour of day (0-23) in the given time zone. */
export function hourInTimeZone(date, timeZone) {
  return Number(partsIn(date, timeZone).hour);
}

/**
 * Wall-clock time in the given zone as "YYYYMMDDTHHmmss", the format IDFM
 * uses for disruption periods. Such strings compare correctly as text.
 */
export function compactLocalDateTime(date, timeZone) {
  const p = partsIn(date, timeZone);
  return `${p.year}${p.month}${p.day}T${p.hour}${p.minute}${p.second}`;
}

/**
 * "20261017T120000" -> "17/10 12:00", adding the year when it differs from
 * `referenceYear`. Returns null for malformed input.
 */
export function formatCompactLocal(value, referenceYear) {
  const match = String(value ?? '').match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})/);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const date = Number(year) === Number(referenceYear) ? `${day}/${month}` : `${day}/${month}/${year}`;
  return `${date} ${hour}:${minute}`;
}
