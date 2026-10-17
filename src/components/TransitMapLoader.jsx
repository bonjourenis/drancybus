'use client';

import dynamic from 'next/dynamic';
import LoadingSpinner from './LoadingSpinner';

// Leaflet touches `window` at import time, so the map is client-only.
const TransitMap = dynamic(() => import('./TransitMap'), {
  loading: () => (
    <div className="h-[400px] md:h-[500px] w-full rounded-xl bg-zinc-100 dark:bg-zinc-800 flex items-center justify-center">
      <LoadingSpinner message="Chargement de la carte..." />
    </div>
  ),
  ssr: false,
});

export default function TransitMapLoader(props) {
  return <TransitMap {...props} />;
}
