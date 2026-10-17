import favorites from '@/config/favorites.json';
import { listProfiles } from '@/lib/profiles';

/**
 * Web app manifest, served at /manifest.webmanifest and linked by Next.js.
 * Icons are rendered from src/app/icon.svg by scripts/generate-icons.mjs.
 */
export default function manifest() {
  return {
    id: '/',
    name: 'DrancyBus - Transports Drancy',
    short_name: 'DrancyBus',
    description: 'Horaires en temps réel des bus 148 et 146, du métro 5 et du RER B à Drancy',
    lang: 'fr',
    dir: 'ltr',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#0A0086',
    theme_color: '#0A0086',
    categories: ['travel', 'navigation'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    // Long-press shortcuts on the home-screen icon, one per commute profile.
    shortcuts: listProfiles(favorites).map((profile) => ({
      name: profile.label,
      short_name: profile.label,
      description: profile.description ?? undefined,
      url: `/#${profile.id}`,
      icons: [{ src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' }],
    })),
  };
}
