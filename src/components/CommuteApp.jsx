'use client';

import { useState } from 'react';
import { useDefaultProfile } from '@/hooks/useDefaultProfile';
import { getProfile, listProfiles } from '@/lib/profiles';
import AppHeader from './AppHeader';
import LineStatusTable from './LineStatusTable';
import LoadingSpinner from './LoadingSpinner';
import ProfileTabs from './ProfileTabs';
import TransitDashboard from './TransitDashboard';

/**
 * Tabs for each commute profile. Before noon (Paris time) "Aller" opens by
 * default, afternoon "Retour"; a click overrides that until reload. The tabs
 * sit in the header on desktop and in a bottom bar on mobile.
 */
export default function CommuteApp({ config }) {
  const defaultId = useDefaultProfile(config);
  const [selectedId, setSelectedId] = useState(null);
  const activeId = selectedId ?? defaultId;
  const profile = activeId ? getProfile(config, activeId) : null;

  return (
    <>
      <AppHeader>
        <ProfileTabs profiles={listProfiles(config)} activeId={activeId} onSelect={setSelectedId} />
      </AppHeader>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {profile ? (
          <div role="tabpanel" id={`panel-${profile.id}`} aria-labelledby={`tab-${profile.id}`} className="space-y-8">
            <TransitDashboard key={profile.id} profile={profile} config={config} />
          </div>
        ) : (
          <LoadingSpinner message="Chargement..." />
        )}

        <LineStatusTable refreshInterval={config.settings.disruptionsRefreshInterval} />
      </main>
    </>
  );
}
