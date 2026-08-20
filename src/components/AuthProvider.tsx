"use client";
import { useAuth } from '@/modules/auth/useAuth';
import { useVibeStore } from '@/core/store/useVibeStore';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';

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
    if (!loading && !user && !isPublicRoute) {
      const returnUrl = encodeURIComponent(window.location.pathname + window.location.search);
      router.replace(`/login?returnUrl=${returnUrl}`);
    }
  }, [loading, user, isPublicRoute, router]);

  if (loading && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">Synchronisation ATOUTE...</p>
        </div>
      </div>
    );
  }

  // Show login page for unauthenticated users on non-public routes
  if (!user && !isPublicRoute) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center">
          <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
          <p className="text-sm font-medium tracking-widest text-blue-600 uppercase">Redirection...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
