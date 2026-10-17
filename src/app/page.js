import TransitDashboard from '@/components/TransitDashboard';
import favorites from '@/config/favorites.json';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900">
      <header className="bg-white dark:bg-zinc-800 shadow-sm border-b border-zinc-200 dark:border-zinc-700">
        <div className="max-w-6xl mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">DranCyBus</h1>
          <p className="text-zinc-500 dark:text-zinc-400">Transports en temps réel - Drancy</p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        <TransitDashboard
          stops={favorites.stops}
          lines={favorites.trackedLines}
          settings={favorites.settings}
        />
      </main>

      <footer className="mt-12 py-6 border-t border-zinc-200 dark:border-zinc-700">
        <div className="max-w-6xl mx-auto px-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
          <p>Données fournies par Île-de-France Mobilités via PRIM API</p>
          <p className="mt-1">
            <a
              href="https://prim.iledefrance-mobilites.fr/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 dark:text-blue-400 hover:underline"
            >
              prim.iledefrance-mobilites.fr
            </a>
          </p>
        </div>
      </footer>
    </div>
  );
}
