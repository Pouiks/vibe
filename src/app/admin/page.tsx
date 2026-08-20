"use client";
// Hub admin : atoute.app/admin — accès aux outils d'équipe.
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { MapPin, BarChart3, ShieldAlert, Sparkles, ChevronRight } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { Spinner } from '@/components/Spinner';

export default function AdminHubPage() {
  const user = useVibeStore((state) => state.user);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    let isMounted = true;
    supabase.from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single()
      .then(({ data }) => {
        if (isMounted) setIsAdmin(!!data?.is_admin);
      });
    return () => { isMounted = false; };
  }, [user?.id]);

  if (!user || isAdmin === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Spinner size="lg" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Accès réservé</h1>
        <p className="text-slate-500 mb-6 max-w-sm text-sm">Cette page est réservée aux administrateurs ATOUTE.</p>
        <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium text-sm flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Retour à l&apos;accueil
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-md mx-auto">
        <BackButton withSwipe className="text-slate-500 mb-6 w-fit hover:text-slate-900 inline-flex items-center gap-1 text-sm" />
        <h1 className="text-3xl font-extrabold mb-8 text-slate-900">Espace admin</h1>

        <div className="flex flex-col gap-3">
          <Link href="/admin/venues" className="bg-card border border-slate-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="bg-blue-50 p-2.5 rounded-xl"><MapPin className="w-5 h-5 text-blue-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900">Lieux</p>
              <p className="text-[11px] text-slate-500">Créer, modifier ou supprimer un spot</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
          <Link href="/admin/stats" className="bg-card border border-slate-200 rounded-2xl p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="bg-blue-50 p-2.5 rounded-xl"><BarChart3 className="w-5 h-5 text-blue-600" /></div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-900">Statistiques</p>
              <p className="text-[11px] text-slate-500">Visites, scans, membres, activité par spot</p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400" />
          </Link>
        </div>
      </div>
    </div>
  );
}
