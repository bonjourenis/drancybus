'use client';

import { useRef } from 'react';

export default function ProfileTabs({ profiles, activeId, onSelect }) {
  const buttons = useRef([]);

  const onKeyDown = (event, index) => {
    const step = { ArrowRight: 1, ArrowLeft: -1 }[event.key];
    if (!step) return;
    event.preventDefault();
    const next = (index + step + profiles.length) % profiles.length;
    onSelect(profiles[next].id);
    buttons.current[next]?.focus();
  };

  // Below md the tabs become a bar fixed to the bottom of the screen, above
  // the Leaflet map controls (z-index 1000).
  return (
    <div
      role="tablist"
      aria-label="Trajet"
      className="fixed inset-x-0 bottom-0 z-[1100] flex gap-1 border-t border-zinc-200 bg-zinc-100/95 px-2 pt-2 pb-[calc(0.5rem+env(safe-area-inset-bottom))] backdrop-blur dark:border-zinc-700 dark:bg-zinc-900/95 md:static md:z-auto md:inline-flex md:rounded-xl md:border-0 md:bg-zinc-200/70 md:p-1 md:backdrop-blur-none md:dark:bg-zinc-900"
    >
      {profiles.map((profile, index) => {
        const selected = profile.id === activeId;
        return (
          <button
            key={profile.id}
            ref={(element) => {
              buttons.current[index] = element;
            }}
            type="button"
            role="tab"
            id={`tab-${profile.id}`}
            aria-selected={selected}
            aria-controls={`panel-${profile.id}`}
            tabIndex={selected || (!activeId && index === 0) ? 0 : -1}
            onClick={() => onSelect(profile.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className={`flex-1 min-w-0 px-5 py-2 rounded-lg text-sm font-semibold transition-colors md:flex-none ${
              selected
                ? 'bg-white dark:bg-zinc-700 text-zinc-900 dark:text-white shadow-sm'
                : 'text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-white'
            }`}
          >
            <span className="block">{profile.label}</span>
            {profile.description && (
              <span className="block truncate text-xs font-normal opacity-80">{profile.description}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}
