'use client';

import { useEffect } from 'react';

/**
 * Registers /sw.js in production. In development any worker left over from a
 * production run on the same origin is removed, so dev builds are never
 * served from its cache.
 */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    if (process.env.NODE_ENV !== 'production') {
      navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => Promise.all(registrations.map((registration) => registration.unregister())))
        .catch(() => {});
      return;
    }

    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch((error) => {
      console.error('[pwa] service worker registration failed:', error);
    });
  }, []);

  return null;
}
