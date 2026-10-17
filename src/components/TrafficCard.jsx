'use client';

import { useTraffic } from '@/hooks/useTraffic';
import { SCREEN } from '@/lib/screen-theme';
import RefreshIndicator from './RefreshIndicator';
import ScreenCard, { ScreenMessage } from './ScreenCard';
import { StatusMark } from './ScreenIcons';

const LEVEL_COLORS = { fluid: SCREEN.ok, slow: SCREEN.warning, heavy: SCREEN.alert, blocked: SCREEN.alert };

// Material Design "directions_car" glyph.
const CAR_PATH =
  'M18.92 6.01C18.72 5.42 18.16 5 17.5 5h-11c-.66 0-1.21.42-1.42 1.01L3 12v8c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h12v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-8l-2.08-5.99zM6.5 16c-.83 0-1.5-.67-1.5-1.5S5.67 13 6.5 13s1.5.67 1.5 1.5S7.33 16 6.5 16zm11 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zM5 11l1.5-4.5h11L19 11H5z';

function ScreenRow({ children, className = '' }) {
  return (
    <div className={`flex items-center gap-3 bg-white px-3 py-2 ${className}`} style={{ color: SCREEN.navy }}>
      {children}
    </div>
  );
}

function RouteTraffic({ route }) {
  if (route.status === 'not-configured') {
    return (
      <ScreenMessage className="text-sm">
        Trafic routier non configuré : ajoutez <code className="font-mono text-xs">TOMTOM_API_KEY</code> dans{' '}
        <code className="font-mono text-xs">.env.local</code> (clé gratuite sur developer.tomtom.com).
      </ScreenMessage>
    );
  }
  if (route.status === 'error') {
    return <ScreenMessage>Trafic indisponible : {route.error}</ScreenMessage>;
  }

  const delay = route.delayMinutes ?? 0;
  return (
    <>
      <ScreenRow className="pl-1.5 pr-2 py-1.5">
        <span
          className="inline-flex shrink-0 items-center justify-center h-9 min-w-12 rounded-md"
          style={{ backgroundColor: SCREEN.navy }}
        >
          <svg viewBox="0 0 24 24" className="w-6 h-6" fill="white" aria-hidden="true">
            <path d={CAR_PATH} />
          </svg>
        </span>
        <span className="flex-1 min-w-0 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="font-bold">En voiture</span>
          <span
            className="rounded-md px-2 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: LEVEL_COLORS[route.level] ?? SCREEN.muted }}
          >
            {route.levelLabel}
          </span>
        </span>
        <span
          className="inline-flex shrink-0 items-baseline gap-1 rounded-md bg-black px-2.5 py-1 font-bold tabular-nums leading-none"
          style={{ color: SCREEN.amber }}
        >
          <span className="text-2xl">{route.travelMinutes}</span>
          <span className="text-xs">min</span>
        </span>
      </ScreenRow>
      <ScreenRow className="text-sm">
        <span>
          {delay > 0 ? `+${delay} min par rapport au trafic fluide` : 'Pas de retard dû au trafic'}
          {route.typicalMinutes != null && ` · habituellement ${route.typicalMinutes} min à cette heure`}
        </span>
      </ScreenRow>
      {route.incidents.map((incident, index) => (
        <ScreenRow key={index} className="text-sm">
          <StatusMark kind="disrupted" size="sm" className="shrink-0" />
          <span>
            {incident.label}
            {incident.delayMinutes > 0 && ` (+${incident.delayMinutes} min)`}
            {incident.speedKmh != null && ` · ${incident.speedKmh} km/h`}
          </span>
        </ScreenRow>
      ))}
    </>
  );
}

export default function TrafficCard({ profileId, refreshInterval }) {
  const { routes, loading, error, lastUpdated, refresh } = useTraffic(profileId, refreshInterval);
  if (!loading && !error && routes.length === 0) return null;

  return (
    <section aria-labelledby={`traffic-${profileId}`} className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 id={`traffic-${profileId}`} className="text-xl font-semibold text-zinc-900 dark:text-white">
          Trafic routier
        </h2>
        <RefreshIndicator lastUpdated={lastUpdated} onRefresh={refresh} loading={loading} />
      </div>
      {error && routes.length === 0 ? (
        <p className="text-sm text-amber-700 dark:text-amber-400">Trafic indisponible : {error}</p>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {routes.map((route) => (
            <ScreenCard key={route.id} title={route.name}>
              <RouteTraffic route={route} />
            </ScreenCard>
          ))}
        </div>
      )}
    </section>
  );
}
