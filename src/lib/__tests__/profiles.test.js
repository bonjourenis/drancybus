import { describe, expect, it } from 'vitest';
import favorites from '@/config/favorites.json';
import { defaultProfileId, getProfile, listProfiles, profileConnections, scopeConfig } from '../profiles';
import { compactLocalDateTime, formatCompactLocal, hourInTimeZone } from '../time';

describe('time helpers', () => {
  it('reads the wall clock in Paris across daylight-saving changes', () => {
    expect(hourInTimeZone(new Date('2026-10-17T09:59:00Z'), 'Europe/Paris')).toBe(11); // CEST, UTC+2
    expect(hourInTimeZone(new Date('2026-12-01T10:59:00Z'), 'Europe/Paris')).toBe(11); // CET, UTC+1
    expect(hourInTimeZone(new Date('2026-10-17T22:30:00Z'), 'Europe/Paris')).toBe(0);
  });

  it('formats the compact local form used by IDFM disruption periods', () => {
    expect(compactLocalDateTime(new Date('2026-10-17T18:25:07Z'), 'Europe/Paris')).toBe('20261017T202507');
    expect(compactLocalDateTime(new Date('2026-12-01T10:00:00Z'), 'Europe/Paris')).toBe('20261201T110000');
  });

  it('renders compact local times for display', () => {
    expect(formatCompactLocal('20261019T040000', 2026)).toBe('19/10 04:00');
    expect(formatCompactLocal('20311218T235900', 2026)).toBe('18/12/2031 23:59');
    expect(formatCompactLocal('garbage', 2026)).toBeNull();
  });
});

describe('profiles', () => {
  it('lists the configured profiles', () => {
    expect(listProfiles(favorites).map((p) => p.id)).toEqual(['aller', 'retour', 'favoris']);
  });

  it('finds a profile by id, defaults to the first, rejects unknown ids', () => {
    expect(getProfile(favorites, 'retour').id).toBe('retour');
    expect(getProfile(favorites, null).id).toBe('aller');
    expect(getProfile(favorites, 'nope')).toBeNull();
  });

  it('opens Aller before noon and Retour from noon, Paris time', () => {
    expect(defaultProfileId(favorites, new Date('2026-10-17T05:00:00Z'))).toBe('aller'); // 07:00
    expect(defaultProfileId(favorites, new Date('2026-10-17T09:59:00Z'))).toBe('aller'); // 11:59
    expect(defaultProfileId(favorites, new Date('2026-10-17T10:00:00Z'))).toBe('retour'); // 12:00
    expect(defaultProfileId(favorites, new Date('2026-10-17T21:59:00Z'))).toBe('retour'); // 23:59
    expect(defaultProfileId(favorites, new Date('2026-10-17T22:00:00Z'))).toBe('aller'); // 00:00
    // winter time
    expect(defaultProfileId(favorites, new Date('2026-12-01T10:59:00Z'))).toBe('aller'); // 11:59
    expect(defaultProfileId(favorites, new Date('2026-12-01T11:00:00Z'))).toBe('retour'); // 12:00
  });

  it('supports windows that wrap past midnight', () => {
    const config = {
      settings: { timeZone: 'Europe/Paris' },
      profiles: [
        { id: 'day', defaultHours: { from: 6, to: 20 } },
        { id: 'night', defaultHours: { from: 20, to: 6 } },
      ],
    };
    expect(defaultProfileId(config, new Date('2026-10-17T20:00:00Z'))).toBe('night'); // 22:00
    expect(defaultProfileId(config, new Date('2026-10-17T02:00:00Z'))).toBe('night'); // 04:00
    expect(defaultProfileId(config, new Date('2026-10-17T08:00:00Z'))).toBe('day'); // 10:00
  });

  it('scopes the config to one profile for the services', () => {
    const scoped = scopeConfig(favorites, getProfile(favorites, 'retour'));
    expect(scoped.profileId).toBe('retour');
    expect(scoped.stops.map((s) => s.name)).toEqual(['Cheminots', 'Bobigny - Pablo Picasso']);
    expect(scoped.trackedLines).toBe(favorites.trackedLines);
  });

  it('lists only the connections a profile uses', () => {
    expect(profileConnections(favorites, getProfile(favorites, 'aller')).map((c) => c.id)).toEqual(['metro-5', 'rer-b']);
    expect(profileConnections(favorites, getProfile(favorites, 'retour'))).toEqual([]);
    expect(profileConnections(favorites, getProfile(favorites, 'favoris'))).toEqual([]);
  });

  it('every towards in the config names a defined connection', () => {
    for (const profile of favorites.profiles) {
      for (const stop of profile.stops) {
        for (const line of stop.lines) {
          if (line.towards) expect(favorites.connections).toHaveProperty(line.towards);
        }
      }
    }
  });
});
