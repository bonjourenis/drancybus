import Image from 'next/image';

/** App title bar; `children` sits on the right (the profile tabs on desktop). */
export default function AppHeader({ children }) {
  return (
    <header className="bg-white dark:bg-zinc-800 shadow-sm border-b border-zinc-200 dark:border-zinc-700">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Image src="/icon.svg" alt="" width={44} height={44} unoptimized priority />
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-white">DrancyBus</h1>
            <p className="text-zinc-500 dark:text-zinc-400">Transports en temps réel - Drancy</p>
          </div>
        </div>
        {children}
      </div>
    </header>
  );
}
