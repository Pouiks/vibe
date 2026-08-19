"use client";
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { ArrowLeft, ShieldAlert, Sparkles, QrCode, UserCheck, MessageCircle, CalendarDays, RefreshCw } from 'lucide-react';

interface VenueStats {
  venue_id: string;
  name: string;
  slug: string;
  qr_visits_30d: number;
  scans_30d: number;
  members: number;
  active_users_7d: number;
  messages_7d: number;
  events_30d: number;
}

function pct(part: number, total: number): string {
  if (!total) return '-';
  return `${Math.round((part / total) * 100)} %`;
}

export default function AdminStatsPage() {
  const user = useVibeStore((state) => state.user);
  const [stats, setStats] = useState<VenueStats[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('admin_venue_stats');
    if (rpcError) {
      console.error('[admin_venue_stats]', rpcError.message);
      setError(true);
    } else {
      setStats((data as VenueStats[]) ?? []);
      setError(false);
    }
    setLoading(false);
  };

  useEffect(() => {
    if (!user) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <ShieldAlert className="w-12 h-12 text-slate-400 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Espace équipe</h1>
        <Link href={`/login?returnUrl=${encodeURIComponent('/admin/stats')}`} className="bg-blue-600 px-4 py-2.5 rounded-xl text-white font-medium flex items-center gap-2">
          <Sparkles className="w-4 h-4" /> Connexion
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-slate-50 text-center">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold text-slate-900 mb-2">Accès réservé</h1>
        <p className="text-slate-500 mb-6 max-w-sm text-sm">Cette page est réservée aux administrateurs VibeSpot.</p>
        <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium text-sm">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  const totals = (stats ?? []).reduce(
    (acc, s) => ({
      visits: acc.visits + s.qr_visits_30d,
      scans: acc.scans + s.scans_30d,
      members: acc.members + s.members,
      active: acc.active + s.active_users_7d,
    }),
    { visits: 0, scans: 0, members: 0, active: 0 }
  );

  return (
    <div className="min-h-screen p-6 bg-slate-50">
      <div className="max-w-lg mx-auto">
        <div className="flex items-center justify-between mb-6">
          <Link href="/" className="text-slate-500 hover:text-slate-900 flex items-center gap-1 text-sm">
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <button onClick={load} disabled={loading} className="p-2 text-slate-400 active:text-blue-600 disabled:opacity-50" title="Rafraîchir">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <h1 className="text-2xl font-extrabold text-slate-900 mb-1">Entonnoir du scan</h1>
        <p className="text-xs text-slate-400 mb-6">Visites & scans sur 30 j · activité sur 7 j</p>

        {loading && !stats ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {/* Totaux */}
            <div className="grid grid-cols-4 gap-2 mb-6">
              {[
                { label: 'Visites QR', value: totals.visits, icon: QrCode },
                { label: 'Scans', value: totals.scans, icon: UserCheck },
                { label: 'Membres', value: totals.members, icon: MessageCircle },
                { label: 'Actifs 7j', value: totals.active, icon: CalendarDays },
              ].map(({ label, value, icon: Icon }) => (
                <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 text-center">
                  <Icon className="w-3.5 h-3.5 text-blue-600 mx-auto mb-1" />
                  <div className="text-lg font-extrabold text-slate-900">{value}</div>
                  <div className="text-[9px] text-slate-400 font-medium uppercase tracking-wide">{label}</div>
                </div>
              ))}
            </div>

            {/* Par lieu */}
            <div className="flex flex-col gap-3">
              {(stats ?? []).map(s => (
                <div key={s.venue_id} className="bg-white border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="font-bold text-sm text-slate-900 truncate">{s.name}</h3>
                    <Link href={`/l/${s.slug}`} className="text-[10px] text-blue-600 font-medium shrink-0 ml-2">ouvrir →</Link>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-center mb-2">
                    <div>
                      <div className="text-base font-extrabold text-slate-900">{s.qr_visits_30d} → {s.scans_30d}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Visites → Scans ({pct(s.scans_30d, s.qr_visits_30d)})</div>
                    </div>
                    <div>
                      <div className="text-base font-extrabold text-slate-900">{s.members}</div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Membres</div>
                    </div>
                    <div>
                      <div className="text-base font-extrabold text-slate-900">{s.active_users_7d} <span className="text-slate-400 font-medium text-xs">({pct(s.active_users_7d, s.members)})</span></div>
                      <div className="text-[9px] text-slate-400 uppercase tracking-wide">Actifs 7 j</div>
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-400 text-center border-t border-slate-100 pt-2">
                    {s.messages_7d} message{s.messages_7d > 1 ? 's' : ''} (7 j) · {s.events_30d} event{s.events_30d > 1 ? 's' : ''} (30 j)
                  </div>
                </div>
              ))}
            </div>

            {(stats ?? []).length === 0 && (
              <p className="text-center text-sm text-slate-400 py-8">Aucun lieu pour le moment.</p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
