'use client';

import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

export default function RefreshIndicator({ lastUpdated, onRefresh, loading = false }) {
  const timeAgo = lastUpdated
    ? formatDistanceToNow(lastUpdated, { addSuffix: true, locale: fr })
    : null;

  return (
    <div className="flex items-center gap-3 text-sm text-zinc-500 dark:text-zinc-400">
      {timeAgo && (
        <span>Mis à jour {timeAgo}</span>
      )}
      <button
        onClick={onRefresh}
        disabled={loading}
        className="p-2 rounded-full hover:bg-zinc-100 dark:hover:bg-zinc-700 transition-colors disabled:opacity-50"
        title="Actualiser"
      >
        <svg
          className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
      </button>
    </div>
  );
}
