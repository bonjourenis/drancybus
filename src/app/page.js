import CommuteApp from '@/components/CommuteApp';
import favorites from '@/config/favorites.json';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 pb-[calc(4.5rem+env(safe-area-inset-bottom))] md:pb-0">
      <CommuteApp config={favorites} />

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
            {' · '}Trafic routier : TomTom
          </p>
        </div>
      </footer>
    </div>
  );
}
