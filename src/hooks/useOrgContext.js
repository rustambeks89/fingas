// [CREATED BY CLAUDE CLI - 2026-05-25]
// Project: Fingas
// Purpose: One-stop hook to read the current user's org_id / station_id +
// list of stations. Every form needs these.

import { useEffect, useState } from 'react';
import { useAuth } from './useAuth';
import { listStations } from '@/services/stationService';

export function useOrgContext() {
  const { user } = useAuth();
  const organizationId = user?.profile?.organization_id ?? null;
  const stationId = user?.profile?.station_id ?? null;
  const [stations, setStations] = useState([]);

  useEffect(() => {
    if (!organizationId) {
      setStations([]);
      return;
    }
    let cancelled = false;
    listStations(organizationId)
      .then((s) => { if (!cancelled) setStations(s); })
      .catch(() => { if (!cancelled) setStations([]); });
    return () => { cancelled = true; };
  }, [organizationId]);

  return { user, organizationId, stationId, stations };
}
