'use client';

import { useSyncExternalStore } from 'react';
import { defaultProfileId } from '@/lib/profiles';

function subscribe(onChange) {
  // Re-evaluate every minute so a page left open switches tab at noon,
  // and when the URL hash or the tab's visibility changes.
  const timer = setInterval(onChange, 60_000);
  window.addEventListener('hashchange', onChange);
  document.addEventListener('visibilitychange', onChange);
  return () => {
    clearInterval(timer);
    window.removeEventListener('hashchange', onChange);
    document.removeEventListener('visibilitychange', onChange);
  };
}

const getServerSnapshot = () => null;

/**
 * The profile to show when the user has not picked one: the URL hash if it
 * names a profile (e.g. /#retour), otherwise the profile whose defaultHours
 * contain the current Paris time. Null during server rendering, so the
 * prerendered HTML never bakes in the build time.
 */
export function useDefaultProfile(config) {
  const getSnapshot = () => {
    const hash = window.location.hash.replace(/^#/, '');
    if ((config.profiles ?? []).some((profile) => profile.id === hash)) return hash;
    return defaultProfileId(config, new Date());
  };
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
