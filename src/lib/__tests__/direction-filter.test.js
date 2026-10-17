import { describe, expect, it } from 'vitest';
import { matchesDirection, matchesStopConfig } from '../direction-filter';

const dep = (destination, destinationRef = null, lineRef = 'IDFM:C01171') => ({
  destination,
  destinationRef,
  lineRef,
});

describe('matchesDirection', () => {
  it('matches destination names ignoring punctuation, case and accents', () => {
    const rule = { direction: 'Le Bourget RER' };
    expect(matchesDirection(dep('Le Bourget <RER>'), rule)).toBe(true);
    expect(matchesDirection(dep('LE BOURGET RER'), rule)).toBe(true);
    expect(matchesDirection(dep('Les Bosquets'), rule)).toBe(false);

    expect(matchesDirection(dep('Aéroport Charles de Gaulle 2 (Terminal 2)'), { direction: 'aeroport' })).toBe(true);
  });

  it('excludes by destination name', () => {
    const rule = { excludeDirection: ['Aéroport', 'Mitry'] };
    expect(matchesDirection(dep('Aéroport Charles de Gaulle 2 (Terminal 2)'), rule)).toBe(false);
    expect(matchesDirection(dep('Mitry - Claye'), rule)).toBe(false);
    expect(matchesDirection(dep('Robinson'), rule)).toBe(true);
    expect(matchesDirection(dep('Saint-Rémy-lès-Chevreuse'), rule)).toBe(true);
  });

  it('matches and excludes by destination reference', () => {
    expect(matchesDirection(dep('X', 'STIF:StopPoint:Q:1:'), { directionRef: 'STIF:StopPoint:Q:1:' })).toBe(true);
    expect(matchesDirection(dep('X', 'STIF:StopPoint:Q:2:'), { directionRef: ['STIF:StopPoint:Q:1:'] })).toBe(false);
    expect(matchesDirection(dep('X', 'STIF:StopPoint:Q:1:'), { excludeDirectionRef: 'STIF:StopPoint:Q:1:' })).toBe(false);
  });

  it('applies every rule present on the entry', () => {
    const rule = { direction: 'Bourget', excludeDirectionRef: 'STIF:StopPoint:Q:9:' };
    expect(matchesDirection(dep('Le Bourget <RER>', 'STIF:StopPoint:Q:9:'), rule)).toBe(false);
    expect(matchesDirection(dep('Le Bourget <RER>', 'STIF:StopPoint:Q:8:'), rule)).toBe(true);
  });

  it('accepts everything when there are no rules', () => {
    expect(matchesDirection(dep('Anything'), {})).toBe(true);
    expect(matchesDirection(dep('Anything'), undefined)).toBe(true);
  });
});

describe('matchesStopConfig', () => {
  const stop = {
    lines: [
      { lineId: 'IDFM:C01171', direction: 'Le Bourget RER' },
      { lineId: 'IDFM:C01173' },
    ],
  };

  it('requires the line to be configured at the stop', () => {
    expect(matchesStopConfig(dep('Le Bourget <RER>', null, 'IDFM:C01171'), stop)).toBe(true);
    expect(matchesStopConfig(dep('Les Bosquets', null, 'IDFM:C01171'), stop)).toBe(false);
    expect(matchesStopConfig(dep('Anywhere', null, 'IDFM:C01173'), stop)).toBe(true);
    expect(matchesStopConfig(dep('Anywhere', null, 'IDFM:C00000'), stop)).toBe(false);
  });
});
