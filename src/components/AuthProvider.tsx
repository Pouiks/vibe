"use client";
import { useAuth } from '@/modules/auth/useAuth';
import { useVibeStore } from '@/core/store/useVibeStore';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { supabase } from '@/core/supabase/client';
import { FullScreenLoader } from '@/components/FullScreenLoader';

// '/' en égalité stricte : en préfixe il rendrait TOUTES les routes publiques
// et désactiverait le garde (bug historique : /profile s'affichait avant
// l'hydratation de la session et pouvait écraser le profil avec des champs vides).
const PUBLIC_PREFIXES = ['/login', '/auth', '/l/', '/confidentialite'];

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { loading } = useAuth();
  const user = useVibeStore((state) => state.user);
  const pathname = usePathname();
  const router = useRouter();

  const isPublicRoute = pathname === '/' || PUBLIC_PREFIXES.some(r => pathname?.startsWith(r));

  useEffect(() => {
    if (loading || user || isPublicRoute) return;
    let cancelled = false;
    // Course post-login : la session existe déjà alors que le profil est
    // encore en cours d'hydratation (fetch réseau). Ne rediriger vers /login
    // que s'il n'y a réellement PAS de session — sinon boucle de connexion.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled || session) return;
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?returnUrl=${returnUrl}`);
    });
    return () => { cancelled = true; };
  }, [loading, user, isPublicRoute, router]);

  if (loading && !isPublicRoute) {
    return <FullScreenLoader label="Synchronisation ATOUTE..." />;
  }

  // Show login page for unauthenticated users on non-public routes
  if (!user && !isPublicRoute) {
    return <FullScreenLoader label="Redirection..." />;
  }

  return <>{children}</>;
}
