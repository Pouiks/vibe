"use client";
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

function withTimeout<T>(promise: PromiseLike<T>, ms: number): Promise<T> {
  return Promise.race([
    promise as Promise<T>,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
}

async function loadProfile(userId: string): Promise<ReturnType<typeof useVibeStore.getState>['user']> {
  const { data: profile } = await withTimeout(
    supabase.from('profiles').select('*').eq('id', userId).single(),
    5000,
  );

  if (!profile) return null;

  return {
    id: profile.id,
    username: profile.username,
    isPremium: profile.is_premium,
    avatarId: profile.avatar_idx,
    firstName: profile.first_name,
    age: profile.age?.toString(),
    gender: profile.gender,
  };
}

export function useAuth() {
  const setUser = useVibeStore((state) => state.setUser);
  const [loading, setLoading] = useState(true);

  const hydrateUser = useCallback(async (userId: string) => {
    try {
      let user = await loadProfile(userId);
      if (!user) {
        await new Promise((r) => setTimeout(r, 1500));
        user = await loadProfile(userId);
      }
      setUser(user);
    } catch {
      // Profile load failed — proceed without user data
    }
  }, [setUser]);

  useEffect(() => {
    const init = async () => {
      try {
        // getSession() reads cookies locally — instant, no network call.
        // getUser() makes a network request that can hang on mobile Safari.
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user) {
          await hydrateUser(session.user.id);
        }
      } catch {
        // No valid session
      } finally {
        setLoading(false);
      }
    };

    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session?.user) {
          await hydrateUser(session.user.id);
          setLoading(false);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, [setUser, hydrateUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { loading, signOut };
}
