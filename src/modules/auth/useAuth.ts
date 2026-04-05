"use client";
import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

async function loadProfile(userId: string): Promise<ReturnType<typeof useVibeStore.getState>['user']> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single();

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
    let user = await loadProfile(userId);

    if (!user) {
      await new Promise((r) => setTimeout(r, 1500));
      user = await loadProfile(userId);
    }

    setUser(user);
  }, [setUser]);

  useEffect(() => {
    const init = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          await hydrateUser(user.id);
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
