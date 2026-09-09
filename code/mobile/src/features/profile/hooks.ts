import { useCallback, useEffect, useState } from 'react';
import { useSession } from '../auth/hooks';
import { getMyProfile } from './api';
import type { ProfileMe } from './types';

/** The caller's profile row, or null when signed out / backend unreachable. */
export function useProfile() {
  const { session, loading: sessionLoading } = useSession();
  const [profile, setProfile] = useState<ProfileMe | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!session) {
      setProfile(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setProfile(await getMyProfile());
    setLoading(false);
  }, [session]);

  useEffect(() => {
    if (!sessionLoading) load();
  }, [sessionLoading, load]);

  return {
    profile,
    session,
    isSignedIn: !!session,
    isAdmin: profile?.role === 'admin',
    loading: loading || sessionLoading,
    reload: load,
  };
}
