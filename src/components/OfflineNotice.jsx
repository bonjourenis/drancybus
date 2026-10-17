'use client';

import { useSyncExternalStore } from 'react';

function subscribe(onChange) {
  window.addEventListener('online', onChange);
  window.addEventListener('offline', onChange);
  return () => {
    window.removeEventListener('online', onChange);
    window.removeEventListener('offline', onChange);
  };
}

const getSnapshot = () => navigator.onLine;
const getServerSnapshot = () => true;

/** Banner shown while the device has no network connection. */
export default function OfflineNotice() {
  const online = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  if (online) return null;

  return (
    <div
      role="status"
      className="sticky top-0 z-[1100] bg-amber-400 text-amber-950 text-sm font-medium text-center px-4 py-2 shadow"
    >
      Hors ligne : affichage des dernières données reçues, elles ne sont plus en temps réel.
    </div>
  );
}
