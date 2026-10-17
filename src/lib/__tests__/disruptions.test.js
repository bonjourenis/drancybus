import { describe, expect, it } from 'vitest';
import { htmlToText, summarizeDisruptions } from '../disruptions';
import bulk from '../__fixtures__/disruptions-bulk.json';

const LINES = [
  { lineId: 'IDFM:C01173', name: 'Bus 148', shortName: '148', type: 'bus', color: '#6e491e' },
  { lineId: 'IDFM:C01171', name: 'Bus 146', shortName: '146', type: 'bus', color: '#E4B4D3' },
  { lineId: 'IDFM:C01375', name: 'Metro 5', shortName: '5', type: 'metro', color: '#F68F4B' },
  { lineId: 'IDFM:C01743', name: 'RER B', shortName: 'B', type: 'rer', color: '#7BA3DC' },
];

// Fixture captured 2026-10-17 20:25 Paris time.
const NOW = new Date('2026-10-17T18:25:00Z');

const byLine = (result) => Object.fromEntries(result.map((line) => [line.shortName, line]));

describe('htmlToText', () => {
  it('strips tags, keeps line breaks and decodes entities', () => {
    expect(htmlToText('<p>Trafic <b>interrompu</b>&nbsp;entre A &amp; B.</p><p>Reprise&#160;à 6h</p>')).toBe(
      'Trafic interrompu entre A & B.\nReprise à 6h'
    );
    expect(htmlToText('ligne 1<br/>ligne 2')).toBe('ligne 1\nligne 2');
    expect(htmlToText('<script>alert(1)</script>ok')).toBe('alert(1)ok');
    expect(htmlToText(null)).toBe('');
  });
});

describe('summarizeDisruptions', () => {
  const list = summarizeDisruptions(bulk, { lines: LINES, now: NOW, upcomingDays: 7 });
  const result = byLine(list);

  it('keeps the tracked-line order and reports lines absent from the feed as normal', () => {
    expect(list.map((line) => line.shortName)).toEqual(['148', '146', '5', 'B']);
    expect(result['148']).toMatchObject({ status: 'normal', statusLabel: 'Trafic normal', active: [], upcoming: [] });
  });

  it('marks stop-level closures as disrupted, not interrupted', () => {
    const m5 = result['5'];
    expect(m5.status).toBe('disrupted');
    expect(m5.active).toHaveLength(4);
    for (const item of m5.active) {
      expect(item).toMatchObject({ state: 'active', severity: 'blocking', scope: 'stops' });
      expect(item.stops.length).toBeGreaterThan(0);
      expect(item.end).toBe('18/10 04:30');
      expect(item.message).not.toMatch(/<[a-z/]/i);
    }
    expect(m5.active.map((item) => item.title)).toContain('Métro 5 : Manifestation - Arrêt non desservi');
  });

  it('lists disruptions starting within the horizon as upcoming only', () => {
    expect(result['146'].status).toBe('normal');
    expect(result['146'].upcoming).toHaveLength(1);
    expect(result['146'].upcoming[0]).toMatchObject({ state: 'upcoming', begin: '19/10 04:00', scope: 'stops' });

    // works from the 19th are upcoming; the match on the 25th is beyond 7 days
    expect(result.B.status).toBe('normal');
    expect(result.B.upcoming.map((item) => item.cause)).toEqual(['works']);
    expect(result.B.upcoming[0].scope).toBe('line');
  });

  it('reports a line-wide blocking disruption as interrupted, and info-only as info', () => {
    const synthetic = {
      disruptions: [
        { id: 'a', severity: 'BLOQUANTE', cause: 'PERTURBATION', title: 'Trafic interrompu', message: '', applicationPeriods: [{ begin: '20261017T000000', end: '20261018T000000' }] },
        { id: 'b', severity: 'INFORMATION', cause: 'INFORMATION', title: 'Info', message: '', applicationPeriods: [{ begin: '20261017T000000', end: '20261018T000000' }] },
        { id: 'c', severity: 'PERTURBEE', cause: 'TRAVAUX', title: 'Ancien', message: '', applicationPeriods: [{ begin: '20261001T000000', end: '20261002T000000' }] },
      ],
      lines: [
        { id: 'line:IDFM:C01173', impactedObjects: [{ type: 'line', name: '148', disruptionIds: ['a', 'c'] }] },
        { id: 'line:IDFM:C01171', impactedObjects: [{ type: 'line', name: '146', disruptionIds: ['b'] }] },
      ],
    };
    const summary = byLine(summarizeDisruptions(synthetic, { lines: LINES, now: NOW }));
    expect(summary['148'].status).toBe('blocked');
    expect(summary['148'].statusLabel).toBe('Interrompu');
    expect(summary['148'].active.map((i) => i.id)).toEqual(['a']); // past one dropped
    expect(summary['146'].status).toBe('info');
  });

  it('survives an empty or malformed feed', () => {
    expect(summarizeDisruptions({}, { lines: LINES, now: NOW }).every((l) => l.status === 'normal')).toBe(true);
    expect(summarizeDisruptions(null, { lines: LINES, now: NOW })).toHaveLength(4);
  });
});
