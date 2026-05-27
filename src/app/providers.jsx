// [UPDATED BY CLAUDE CLI - 2026-05-25]
// [UPDATED BY ANTIGRAVITY CLI - 2026-05-25]
// Project: Fingas
// Purpose: AuthProvider — loads session + profile + permissions. Tracks
// profileChecked + profileError so the router can show a useful screen when
// the user is signed in but the public.profiles row / table is missing. Wraps tree in ThemeProvider.

import { createContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { fetchMyProfile } from '@/services/profileService';
import { fetchPermissionsMap } from '@/services/permissionService';
import { ThemeProvider } from '@/hooks/useTheme';

export const AuthContext = createContext({
  user: null,
  session: null,
  loading: true,
  profileChecked: false,
  profileError: null,
  configured: false,
  refresh: () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(false);
  const [profileError, setProfileError] = useState(null);
  const currentUserIdRef = useRef(null);

  const loadUserData = useCallback(async (sess) => {
    if (!sess?.user?.id) {
      setProfile(null);
      setPermissions({});
      setProfileChecked(true);
      setProfileError(null);
      currentUserIdRef.current = null;
      return;
    }
    try {
      const [p, perms] = await Promise.all([
        fetchMyProfile(sess.user.id),
        fetchPermissionsMap(sess.user.id).catch(() => ({})),
      ]);
      setProfile(p);
      setPermissions(perms);
      setProfileError(null);
      currentUserIdRef.current = sess.user.id;
    } catch (e) {
      console.error('[Fingas] Failed loading profile/permissions', e);
      setProfile(null);
      setPermissions({});
      setProfileError(e?.message ?? String(e));
      currentUserIdRef.current = null;
    } finally {
      setProfileChecked(true);
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    if (!isSupabaseConfigured) {
      setLoading(false);
      setProfileChecked(true);
      return;
    }
    supabase.auth.getSession().then(async ({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      await loadUserData(data.session);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange(async (_e, sess) => {
      setSession(sess ?? null);
      const newUserId = sess?.user?.id ?? null;
      if (newUserId !== currentUserIdRef.current) {
        setProfileChecked(false);
      }
      await loadUserData(sess);
    });
    return () => {
      mounted = false;
      sub?.subscription?.unsubscribe?.();
    };
  }, [loadUserData]);

  const refresh = useCallback(async () => {
    setProfileChecked(false);
    await loadUserData(session);
  }, [session, loadUserData]);

  const signOutNow = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setProfile(null);
    setPermissions({});
    setProfileError(null);
  }, []);

  const user = useMemo(() => {
    if (!session?.user) return null;
    return {
      id: session.user.id,
      email: session.user.email,
      profile,
      permissions,
    };
  }, [session, profile, permissions]);

  const value = useMemo(
    () => ({
      user,
      session,
      loading,
      profileChecked,
      profileError,
      configured: isSupabaseConfigured,
      refresh,
      signOut: signOutNow,
    }),
    [user, session, loading, profileChecked, profileError, refresh, signOutNow],
  );

  return (
    <ThemeProvider>
      <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
    </ThemeProvider>
  );
}
