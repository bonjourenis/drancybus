'use client';

import { useSyncExternalStore } from 'react';
import { SCREEN } from '@/lib/screen-theme';

const formatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

function subscribe(onChange) {
  const id = setInterval(onChange, 1000);
  return () => clearInterval(id);
}

const getTime = () => formatter.format(new Date());
const getServerTime = () => null;

/** Amber-on-black clock of the RATP screens. Rendered on the client only. */
export default function ScreenClock() {
  const time = useSyncExternalStore(subscribe, getTime, getServerTime);

  return (
    <span
      className="inline-block rounded-md bg-black px-2.5 py-1.5 text-2xl font-bold tabular-nums leading-none"
      style={{ color: SCREEN.amber }}
    >
      {time ?? '--:--'}
    </span>
  );
}
