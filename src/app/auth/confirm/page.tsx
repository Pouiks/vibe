"use client";
import { useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { supabase } from '@/core/supabase/client';

export default function ConfirmPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  useEffect(() => {
    const returnUrl = searchParams?.get('returnUrl') || '/';

    // Le client Supabase va automatiquement capter l'URL avec le #access_token
    // et va valider la session en local. On écoute donc l'événement de connexion.
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session) {
        router.replace(returnUrl);
      }
    });

    // Timeout de sécurité si le hash est invalide ou absent
    const timeout = setTimeout(() => {
      supabase.auth.getSession().then(({ data }) => {
        if (data.session) {
          router.replace(returnUrl);
        } else {
          router.replace('/login?error=invalid_link');
        }
      });
    }, 2500);

    return () => {
      authListener.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-vibe-dark text-white">
      <div className="animate-pulse flex flex-col items-center">
        <div className="w-12 h-12 border-4 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-medium tracking-widest text-brand-500 uppercase">Validation en cours...</p>
      </div>
    </div>
  );
}
