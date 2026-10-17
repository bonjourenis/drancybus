/**
 * Turn the IDFM bulk disruptions feed into a per-line status.
 *
 * Feed shape: { disruptions: [{ id, title, message (HTML), severity
 * BLOQUANTE|PERTURBEE|INFORMATION, cause PERTURBATION|TRAVAUX|INFORMATION,
 * applicationPeriods: [{ begin, end }], lastUpdate }], lines: [{ id
 * "line:IDFM:C01375", impactedObjects: [{ type line|stop_point|…, name,
 * disruptionIds }] }] }. Period times are Paris wall-clock strings
 * ("20261017T120000").
 */
import { compactLocalDateTime, formatCompactLocal } from './time';

const SEVERITY = { BLOQUANTE: 'blocking', PERTURBEE: 'disrupted', INFORMATION: 'info' };
const SEVERITY_RANK = { blocking: 3, disrupted: 2, info: 1 };
const CAUSE = { PERTURBATION: 'disruption', TRAVAUX: 'works', INFORMATION: 'info' };

export const STATUS_LABELS = {
  blocked: 'Interrompu',
  disrupted: 'Perturbé',
  info: 'Information',
  normal: 'Trafic normal',
};

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };

/** Plain text from the feed's HTML messages. Never render the HTML itself. */
export function htmlToText(html) {
  return String(html ?? '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/\s*(p|div|li|h\d)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (entity, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        return Number.isFinite(n) ? String.fromCodePoint(n) : entity;
      }
      return ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

function periodState(periods, nowLocal, horizonLocal) {
  let next = null;
  for (const period of periods ?? []) {
    const { begin, end } = period ?? {};
    if (!begin || !end) continue;
    if (begin <= nowLocal && nowLocal <= end) return { state: 'active', period };
    if (begin > nowLocal && begin <= horizonLocal && (!next || begin < next.begin)) next = period;
  }
  return next ? { state: 'upcoming', period: next } : null;
}

/**
 * @param {Object} bulk      raw feed
 * @param {Object} options
 * @param {Array}  options.lines         [{ lineId, name, shortName, type, color }]
 * @param {Date}   [options.now]
 * @param {string} [options.timeZone]
 * @param {number} [options.upcomingDays]
 */
export function summarizeDisruptions(
  bulk,
  { lines, now = new Date(), timeZone = 'Europe/Paris', upcomingDays = 7 }
) {
  const nowLocal = compactLocalDateTime(now, timeZone);
  const horizonLocal = compactLocalDateTime(new Date(now.getTime() + upcomingDays * 86400000), timeZone);
  const year = nowLocal.slice(0, 4);

  const byId = new Map((bulk?.disruptions ?? []).map((d) => [d.id, d]));
  const feedLines = new Map((bulk?.lines ?? []).map((line) => [line.id, line]));

  return lines.map((line) => {
    const feedLine = feedLines.get(`line:${line.lineId}`);

    // disruption id -> { lineWide, stops:Set }
    const scopes = new Map();
    for (const object of feedLine?.impactedObjects ?? []) {
      for (const id of object.disruptionIds ?? []) {
        const scope = scopes.get(id) ?? { lineWide: false, stops: new Set() };
        if (object.type === 'line') scope.lineWide = true;
        else if (object.name) scope.stops.add(object.name);
        scopes.set(id, scope);
      }
    }

    const items = [];
    for (const [id, scope] of scopes) {
      const disruption = byId.get(id);
      if (!disruption) continue;
      const timing = periodState(disruption.applicationPeriods, nowLocal, horizonLocal);
      if (!timing) continue; // past, or too far in the future

      items.push({
        id,
        state: timing.state,
        severity: SEVERITY[disruption.severity] ?? 'info',
        cause: CAUSE[disruption.cause] ?? 'info',
        title: htmlToText(disruption.title) || 'Perturbation',
        message: htmlToText(disruption.message).slice(0, 1200),
        scope: scope.lineWide ? 'line' : 'stops',
        stops: scope.lineWide ? [] : [...scope.stops].sort(),
        begin: formatCompactLocal(timing.period.begin, year),
        end: formatCompactLocal(timing.period.end, year),
        updatedAt: formatCompactLocal(disruption.lastUpdate, year),
      });
    }

    items.sort(
      (a, b) =>
        (a.state === 'active' ? 0 : 1) - (b.state === 'active' ? 0 : 1) ||
        SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity] ||
        String(a.begin).localeCompare(String(b.begin))
    );

    const active = items.filter((item) => item.state === 'active');
    let status = 'normal';
    if (active.some((item) => item.severity === 'blocking' && item.scope === 'line')) status = 'blocked';
    else if (active.some((item) => item.severity !== 'info')) status = 'disrupted';
    else if (active.length > 0) status = 'info';

    return {
      ...line,
      status,
      statusLabel: STATUS_LABELS[status],
      active,
      upcoming: items.filter((item) => item.state === 'upcoming'),
    };
  });
}
