"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

export function useAuth() {
  const setUser = useVibeStore((state) => state.setUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();

        if (session?.user) {
          // Fetch profile (the DB trigger creates it on first sign-in)
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser({
              id: profile.id,
              username: profile.username,
              isPremium: profile.is_premium,
              avatarId: profile.avatar_idx,
              firstName: profile.first_name,
              age: profile.age?.toString(),
              gender: profile.gender
            });
          }
          // If no profile yet (very first login, trigger might be slow), 
          // wait briefly and retry once
          else {
            await new Promise(r => setTimeout(r, 1000));
            const { data: retryProfile } = await supabase
              .from('profiles')
              .select('*')
              .eq('id', session.user.id)
              .single();

            if (retryProfile) {
              setUser({
                id: retryProfile.id,
                username: retryProfile.username,
                isPremium: retryProfile.is_premium,
                avatarId: retryProfile.avatar_idx,
                firstName: retryProfile.first_name,
                age: retryProfile.age?.toString(),
                gender: retryProfile.gender
              });
            }
          }
        }
        // If no session → user is null → AuthProvider will show login
      } catch (e) {
        console.error("Auth check failed:", e);
      } finally {
        setLoading(false);
      }
    };

    checkSession();

    // Listen for auth state changes (e.g., magic link callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          // Small delay for the profile trigger
          await new Promise(r => setTimeout(r, 800));
          
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (profile) {
            setUser({
              id: profile.id,
              username: profile.username,
              isPremium: profile.is_premium,
              avatarId: profile.avatar_idx,
              firstName: profile.first_name,
              age: profile.age?.toString(),
              gender: profile.gender
            });
          }
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser]);

  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
  };

  return { loading, signOut };
}
