/**
 * Line metadata, merged from favorites.json (what the user chose to track and
 * how to label it) and line-data.json (official short names and colours from
 * IDFM open data). favorites.json wins when both define a value.
 */
import { DEFAULT_LINE_COLOR } from './constants';
import { shortNameFromLineId } from './config-utils';

const ROUTE_TYPE_TO_MODE = { Bus: 'bus', Subway: 'metro', Rail: 'rer', Tram: 'tram' };

/**
 * @returns {Map<string, {lineId, name, shortName, type, color}>}
 */
export function buildLineLookup(config, lineData) {
  const lookup = new Map();
  for (const line of config.trackedLines ?? []) {
    const record = lineData?.lines?.[line.lineId];
    lookup.set(line.lineId, {
      lineId: line.lineId,
      name: line.name || record?.longName || line.lineId,
      shortName: record?.shortName || shortNameFromLineId(line.lineId),
      type: line.type || ROUTE_TYPE_TO_MODE[record?.routeType] || 'bus',
      color: line.color || record?.officialColor || DEFAULT_LINE_COLOR,
    });
  }
  return lookup;
}

/**
 * lineId -> short display name, for every line mentioned in the config.
 */
export function buildLineNames(config, lineData) {
  const names = {};
  for (const [lineId, meta] of buildLineLookup(config, lineData)) {
    names[lineId] = meta.shortName;
  }
  for (const stop of config.stops ?? []) {
    for (const line of stop.lines ?? []) {
      if (line.lineId && line.lineName && !names[line.lineId]) {
        names[line.lineId] = line.lineName;
      }
    }
  }
  return names;
}
