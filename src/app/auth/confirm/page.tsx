"use client";
import { Suspense, useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/core/supabase/client';

function ConfirmInner() {
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">Validation en cours...</p>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">Validation en cours...</p>
        </div>
      </div>
    }>
      <ConfirmInner />
    </Suspense>
  );
}
