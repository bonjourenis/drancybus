/**
 * Commute profiles ("Aller", "Retour") from favorites.json. No data imports
 * so the module is safe in client bundles.
 */
import { hourInTimeZone } from './time';

const DEFAULT_TIME_ZONE = 'Europe/Paris';

export function listProfiles(config) {
  return (config.profiles ?? []).map(({ id, label, description, defaultHours }) => ({
    id,
    label,
    description: description ?? null,
    defaultHours: defaultHours ?? null,
  }));
}

/** The profile with this id, the first profile when id is empty, else null. */
export function getProfile(config, id) {
  const profiles = config.profiles ?? [];
  if (!id) return profiles[0] ?? null;
  return profiles.find((profile) => profile.id === id) ?? null;
}

/**
 * A config object shaped like a single-profile config, so the services can
 * keep reading `config.stops`.
 */
export function scopeConfig(config, profile) {
  return {
    ...config,
    profileId: profile.id,
    stops: profile.stops ?? [],
    traffic: profile.traffic ?? [],
  };
}

/**
 * Profile to open by default: the first whose defaultHours window
 * [from, to) contains the current hour in the configured time zone.
 */
export function defaultProfileId(config, date = new Date()) {
  const profiles = config.profiles ?? [];
  if (profiles.length === 0) return null;

  const hour = hourInTimeZone(date, config.settings?.timeZone ?? DEFAULT_TIME_ZONE);
  const match = profiles.find(({ defaultHours }) => {
    if (!defaultHours) return false;
    const { from = 0, to = 24 } = defaultHours;
    return from <= to ? hour >= from && hour < to : hour >= from || hour < to;
  });
  return (match ?? profiles[0]).id;
}

/** Connections referenced by the profile's stops, in config order. */
export function profileConnections(config, profile) {
  const used = new Set(
    (profile?.stops ?? []).flatMap((stop) => (stop.lines ?? []).map((line) => line.towards).filter(Boolean))
  );
  return Object.entries(config.connections ?? {})
    .filter(([id]) => used.has(id))
    .map(([id, connection]) => ({ id, ...connection }));
}
