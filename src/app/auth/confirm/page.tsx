"use client";
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/core/supabase/client';

export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const handled = useRef(false);

  useEffect(() => {
    if (handled.current) return;
    handled.current = true;

    const returnUrl = searchParams?.get('returnUrl') || '/';

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_IN' && session) {
          router.replace(returnUrl);
        }
      }
    );

    const timeout = setTimeout(async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        router.replace(returnUrl);
      } else {
        router.replace('/login?error=invalid_link');
      }
    }, 3000);

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router, searchParams]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vibe-dark text-white">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium tracking-widest text-brand-500 uppercase">Validation en cours...</p>
      </div>
    </div>
  );
}
