"use client";
import { useEffect, useState } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

export function generateRandomUsernameLocal() {
  const adjectives = ['Happy', 'Crazy', 'Sleepy', 'Brave', 'Shiny', 'Swift', 'Chill', 'Wild', 'Epic', 'Cosmic', 'Cool', 'Vibe'];
  const animals = ['Panda', 'Tiger', 'Bear', 'Falcon', 'Wolf', 'Fox', 'Koala', 'Lion', 'Duck', 'Owl', 'Cat', 'Dog', 'Dolphin'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];
  const num = Math.floor(Math.random() * 999) + 1;
  
  return `${adj}${animal}${num}`;
}

export function useAuth() {
  const setUser = useVibeStore((state) => state.setUser);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // For POC, if Supabase is bypassed or mock fails, we provide a local mock session
    // otherwise we use Supabase Auth
    const checkSession = async () => {
      try {
        let { data: { session } } = await supabase.auth.getSession();
        
        if (!session?.user && process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_URL !== 'https://mock.supabase.co') {
           // Attempt Anonymous Login
           const { data: authData, error: authError } = await supabase.auth.signInAnonymously();
           if (!authError && authData.session) {
             session = authData.session;
           } else {
             console.warn("⚠️ Anonymous Sign-In failed or is disabled in your Supabase Auth Providers setting. Ensure it's enabled!");
           }
        }

        if (session?.user) {
          // Fetch profile (may take a tiny amount of time for the DB trigger to create it after anon sign in)
          // Wait 500ms to allow trigger to complete if it's a completely new user
          await new Promise(r => setTimeout(r, 500));
          
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
            return;
          } else {
            console.warn("Orphan session detected (Database was probably rebuilt). Signing out...");
            await supabase.auth.signOut();
            // Try Anonymous Login again natively to fix the state
            const { data: authData } = await supabase.auth.signInAnonymously();
            if (authData.session) {
               window.location.reload();
               return;
            }
          }
        } 
        
        // Fallback POC OR if completely failed
        setUser({
          id: 'local-mock-user-id-' + Math.floor(Math.random()*100),
          username: generateRandomUsernameLocal(),
          isPremium: false,
          avatarId: 1
        });
      } catch (e) {
        console.error("Auth check failed:", e);
      } finally {
        setLoading(false);
      }
    };

    checkSession();
  }, [setUser]);

  const mockLogin = () => {
     setUser({
       id: 'local-mock-user-id-' + Math.floor(Math.random()*100),
       username: generateRandomUsernameLocal(),
       isPremium: false,
       avatarId: Math.floor(Math.random()*5)+1
     });
  };

  return { loading, mockLogin };
}
