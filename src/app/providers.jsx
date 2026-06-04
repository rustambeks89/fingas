// [UPDATED BY CLAUDE CLI - 2026-06-04]
// Project: Fingas
// Purpose: AuthProvider — loads session + profile + permissions. Tracks
// profileChecked + profileError so the router can show a useful screen when
// the user is signed in but the public.profiles row / table is missing.
//
// Кэш профиля в localStorage. На холодном старте профиль и права восстанавливаем
// из кэша синхронно — UI рисуется сразу же, без ожидания profile-запроса
// (типичный «холодный» AuthProvider блокировался на 200-800мс ожидая Supabase).
// В фоне валидируем сессию + перезагружаем profile/permissions и тихо
// обновляем кэш если что-то поменялось.

import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { supabase, isSupabaseConfigured } from '@/lib/supabaseClient';
import { fetchMyProfile } from '@/services/profileService';
import { fetchPermissionsMap } from '@/services/permissionService';
import { ThemeProvider } from '@/hooks/useTheme';

const CACHE_KEY = 'fingas:auth-cache:v1';

function readAuthCache() {
  if (typeof localStorage === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.userId || !parsed?.profile) return null;
    return parsed;
  } catch {
    return null;
  }
}

function writeAuthCache(payload) {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore quota errors */
  }
}

function clearAuthCache() {
  if (typeof localStorage === 'undefined') return;
  try { localStorage.removeItem(CACHE_KEY); } catch { /* */ }
}

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
  // Кэш читаем синхронно при первом рендере — UI стартует с уже заполненным
  // profile и не висит на белом экране пока Supabase отдаёт getSession.
  const cached = readAuthCache();
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(cached?.profile ?? null);
  const [permissions, setPermissions] = useState(cached?.permissions ?? {});
  const [loading, setLoading] = useState(true);
  const [profileChecked, setProfileChecked] = useState(!!cached);
  const [profileError, setProfileError] = useState(null);
  // Текущий userId — реактивный state, чтобы корректно прокидываться в
  // useMemo(user) без чтения ref во время рендера.
  const [currentUserId, setCurrentUserId] = useState(cached?.userId ?? null);

  const loadUserData = useCallback(async (sess) => {
    if (!sess?.user?.id) {
      setProfile(null);
      setPermissions({});
      setProfileChecked(true);
      setProfileError(null);
      setCurrentUserId(null);
      clearAuthCache();
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
      setCurrentUserId(sess.user.id);
      if (p) {
        writeAuthCache({ userId: sess.user.id, profile: p, permissions: perms });
      }
    } catch (e) {
      console.error('[Fingas] Failed loading profile/permissions', e);
      setProfile(null);
      setPermissions({});
      setProfileError(e?.message ?? String(e));
      setCurrentUserId(null);
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
      // Меняем профиль только если реально другой пользователь — иначе
      // на каждый refresh-токен мы бы запрашивали профиль заново.
      setCurrentUserId((prev) => {
        if (newUserId !== prev) setProfileChecked(false);
        return prev;
      });
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
    clearAuthCache();
  }, []);

  const user = useMemo(() => {
    // Свежая сессия — авторитетный источник identity.
    if (session?.user) {
      return {
        id: session.user.id,
        email: session.user.email,
        profile,
        permissions,
      };
    }
    // Сессии ещё нет (Supabase getSession в полёте), но в localStorage был
    // профиль с прошлого входа — отдаём «оптимистичного» пользователя,
    // чтобы Dashboard сразу рисовался. Когда getSession отстреляет,
    // user мемо пересчитается с реальной сессией.
    if (profile && currentUserId) {
      return {
        id: currentUserId,
        email: profile.email ?? null,
        profile,
        permissions,
      };
    }
    return null;
  }, [session, profile, permissions, currentUserId]);

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
