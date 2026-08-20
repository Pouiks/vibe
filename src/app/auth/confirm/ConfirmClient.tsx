"use client";
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/core/supabase/client';
import { FullScreenLoader } from '@/components/FullScreenLoader';

export default function ConfirmClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const returnUrl = searchParams?.get('returnUrl') || '/';
    const code = searchParams?.get('code');

    const resolve = (hasSession: boolean) => {
      if (hasSession) {
        router.replace(returnUrl);
      } else {
        router.replace('/login?error=invalid_link');
      }
    };

    if (code) {
      supabase.auth
        .exchangeCodeForSession(code)
        .then(({ data, error }) => {
          resolve(!!data.session && !error);
        })
        .catch(() => resolve(false));
      return;
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          resolve(true);
        }
      }
    );

    const timeout = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      resolve(!!user);
    }, 3000);

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, searchParams]);

  return <FullScreenLoader label="Validation en cours..." />;
}
