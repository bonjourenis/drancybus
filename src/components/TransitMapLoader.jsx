'use client';

import dynamic from 'next/dynamic';
import { SCREEN } from '@/lib/screen-theme';
import LoadingSpinner from './LoadingSpinner';

// Leaflet touches `window` at import time, so the map is client-only.
const TransitMap = dynamic(() => import('./TransitMap'), {
  loading: () => (
    <div
      className="h-[55dvh] md:h-[500px] w-full flex items-center justify-center"
      style={{ backgroundColor: SCREEN.background }}
    >
      <LoadingSpinner message="Chargement de la carte..." />
    </div>
  ),
  ssr: false,
});

export default function TransitMapLoader(props) {
  return <TransitMap {...props} />;
}
