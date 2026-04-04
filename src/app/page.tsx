"use client";
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { MapPin, ScanLine, MessageCircle, Crown, Zap, Calendar } from 'lucide-react';
import { InstallPrompt } from '@/components/InstallPrompt';

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
}

interface MyEvent {
  event_id: string;
  created_at: string;
  events: {
    id: string;
    title: string;
    start_time: string;
    current_participants: number;
    max_participants: number;
    venues: {
      slug: string;
      name: string;
      category: string;
    } | null;
  } | null;
}

const CATEGORY_ICONS: Record<string, string> = {
  sport: '🏀',
  cafe: '☕',
  bar: '🍻',
  other: '📍',
};

export default function Home() {
  const router = useRouter();
  const user = useVibeStore((state) => state.user);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);



  // Load venues on mount
  useEffect(() => {
    supabase
      .from('venues')
      .select('id, slug, name, category')
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setVenues(data);
        setLoading(false);
      });
  }, []);

  // Load user's events when user is available
  useEffect(() => {
    if (!user) return;
    supabase
      .from('event_participants')
      .select(`
        event_id,
        created_at,
        events!inner (
          id, title, start_time, current_participants, max_participants,
          venues (slug, name, category)
        )
      `)
      .eq('user_id', user.id)
      .gte('events.start_time', new Date(Date.now() - 3600 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (data) setMyEvents(data as any);
      });
  }, [user]);

  function formatCountdown(startTime: string) {
    const diff = new Date(startTime).getTime() - Date.now();
    if (diff <= 0) return 'Maintenant !';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `Dans ${mins} min`;
    const hrs = Math.floor(mins / 60);
    return `Dans ${hrs}h${mins % 60 > 0 ? (mins % 60).toString().padStart(2, '0') : ''}`;
  }

  return (
    <main className="min-h-[100dvh] flex flex-col bg-vibe-dark relative">
      {/* Decorative blobs */}
      <div className="absolute top-[-10%] left-[-10%] w-64 h-64 bg-brand-600 rounded-full mix-blend-screen filter blur-[120px] opacity-20 pointer-events-none" />

      {/* Header Profile */}
      <header className="p-5 flex items-center justify-between sticky top-0 z-20 bg-vibe-dark/80 backdrop-blur-md border-b border-vibe-border">
        <h1 className="font-extrabold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400">VIBE</h1>
        {user && (
          <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full bg-brand-600 border border-brand-500/50 shadow-[0_0_15px_rgba(99,102,241,0.4)] transition-transform hover:scale-105 active:scale-95 text-white font-bold tracking-widest text-sm relative">
            {user.username.substring(0, 2).toUpperCase()}
            {user.isPremium && <Crown className="absolute -top-1 -right-2 w-4 h-4 text-vibe-accent drop-shadow-md" />}
          </Link>
        )}
      </header>

      <div className="flex-1 p-4 pb-20">
        {/* My Events */}
        {myEvents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-vibe-accent mb-3 ml-2 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Mes événements
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory hide-scrollbar">
              {myEvents.map((me) => {
                const ev = me.events;
                if (!ev || !ev.venues) return null;
                return (
                  <Link
                    key={me.event_id}
                    href={`/l/${ev.venues.slug}?tab=events`}
                    className="snap-start shrink-0 w-[240px] glass p-4 rounded-2xl flex flex-col justify-between active:scale-[0.98] transition-transform"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-brand-300 text-[10px] font-bold uppercase">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse" />
                        {ev.venues.name}
                      </div>
                      <h3 className="font-bold text-white text-sm line-clamp-1 mb-1">{ev.title}</h3>
                      <div className="text-xs text-slate-400">
                        {ev.current_participants}/{ev.max_participants} membres
                      </div>
                    </div>
                    <div className="mt-3 bg-brand-500/10 text-brand-400 text-xs font-semibold py-1.5 px-3 rounded-lg w-fit">
                      {formatCountdown(ev.start_time)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Scan Button */}
        <div className="glass p-5 rounded-3xl w-full flex flex-col gap-5 mb-8 relative overflow-hidden text-center items-center">
          <div className="absolute bottom-[-20%] right-[-10%] w-32 h-32 bg-vibe-accent rounded-full mix-blend-screen filter blur-[50px] opacity-20" />
          <div className="bg-brand-500/20 p-4 rounded-full">
            <ScanLine className="w-8 h-8 text-brand-400" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white mb-1">Où êtes-vous ?</h2>
            <p className="text-xs text-slate-400 max-w-[250px] mx-auto leading-relaxed">
              Scannez le QR code d'un lieu pour discuter avec les personnes présentes et créer des events.
            </p>
          </div>
          <button className="w-full bg-white text-vibe-dark font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2">
            <ScanLine className="w-4 h-4" /> Ouvrir la caméra
          </button>
        </div>

        {/* All Venues */}
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500 mb-3 ml-2 flex items-center gap-2">
            <MessageCircle className="w-3 h-3" /> Tous les lieux
          </h2>
          <div className="flex flex-col gap-2">
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : venues.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-sm">Aucun lieu enregistré.</div>
            ) : (
              venues.map((v) => (
                <Link
                  key={v.id}
                  href={`/l/${v.slug}`}
                  className="glass p-3.5 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-transform"
                >
                  <div className="flex items-center gap-3">
                    <div className="bg-vibe-dark p-3 rounded-2xl border border-vibe-border relative flex items-center justify-center">
                      <span className="text-lg">{CATEGORY_ICONS[v.category] || '📍'}</span>
                    </div>
                    <div className="flex flex-col">
                      <h3 className="font-bold text-[14px] text-slate-200">{v.name}</h3>
                      <p className="text-[11px] text-slate-500 capitalize">{v.category}</p>
                    </div>
                  </div>
                  <div className="flex-shrink-0">
                    <Zap className="w-4 h-4 text-brand-500" />
                  </div>
                </Link>
              ))
            )}
          </div>
        </div>
      </div>
      
      <InstallPrompt />
    </main>
  );
}
