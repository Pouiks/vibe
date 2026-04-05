"use client";
import Link from 'next/link';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useRouter } from 'next/navigation';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { MapPin, ScanLine, MessageCircle, Crown, Zap, Calendar, Map as MapIcon, List } from 'lucide-react';
import { InstallPrompt } from '@/components/InstallPrompt';

const LazyMapView = lazy(() => import('@/modules/map/MapView'));

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
  city_slug: string;
  neighborhood: string | null;
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
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [unlockedVenueIds, setUnlockedVenueIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) return;
    supabase
      .from('channel_subscriptions')
      .select('venue_id')
      .eq('user_id', user.id)
      .then(({ data }) => {
        if (data) setUnlockedVenueIds(new Set(data.map(d => d.venue_id)));
      });
  }, [user]);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase
          .from('venues')
          .select('id, slug, name, category, city_slug, neighborhood')
          .order('created_at', { ascending: false });
        if (data) setVenues(data);
      } catch (err) {
        console.error('[Venues fetch]', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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
    <main className="min-h-[100dvh] flex flex-col bg-slate-50">
      <header className="p-5 flex items-center justify-between sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
        <h1 className="font-extrabold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600">VIBE</h1>
        {user && (
          <Link href="/profile" className="flex items-center justify-center w-10 h-10 rounded-full bg-blue-600 transition-transform hover:scale-105 active:scale-95 text-white font-bold tracking-widest text-sm relative">
            {user.username.substring(0, 2).toUpperCase()}
            {user.isPremium && <Crown className="absolute -top-1 -right-2 w-4 h-4 text-blue-600 drop-shadow-md" />}
          </Link>
        )}
      </header>

      <div className="flex-1 p-4 pb-20">
        {/* My Events */}
        {myEvents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 mb-3 ml-2 flex items-center gap-2">
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
                    className="snap-start shrink-0 w-[240px] bg-white shadow-sm border border-slate-200 p-4 rounded-2xl flex flex-col justify-between active:scale-[0.98] transition-transform"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-blue-600 text-[10px] font-bold uppercase">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                        {ev.venues.name}
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{ev.title}</h3>
                      <div className="text-xs text-slate-500">
                        {ev.current_participants}/{ev.max_participants} membres
                      </div>
                    </div>
                    <div className="mt-3 bg-blue-50 text-blue-600 text-xs font-semibold py-1.5 px-3 rounded-lg w-fit">
                      {formatCountdown(ev.start_time)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Scan Button */}
        <div className="bg-white shadow-sm border border-slate-200 p-5 rounded-3xl w-full flex flex-col gap-5 mb-8 text-center items-center">
          <div className="bg-blue-50 p-4 rounded-full">
            <ScanLine className="w-8 h-8 text-blue-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 mb-1">Où êtes-vous ?</h2>
            <p className="text-xs text-slate-500 max-w-[250px] mx-auto leading-relaxed">
              Scannez le QR code d'un lieu pour discuter avec les personnes présentes et créer des events.
            </p>
          </div>
          <button className="w-full bg-blue-600 text-white font-bold py-3.5 px-4 rounded-xl transition-all active:scale-95 flex items-center justify-center gap-2">
            <ScanLine className="w-4 h-4" /> Ouvrir la caméra
          </button>
        </div>

        {/* View Mode Toggle + Venues */}
        <div>
          <div className="flex items-center justify-between mb-3 ml-2 mr-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <MessageCircle className="w-3 h-3" /> Tous les lieux
            </h2>
            <div className="flex bg-white border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <List className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`p-1.5 rounded-md transition-all ${viewMode === 'map' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <MapIcon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div className="flex flex-col gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : venues.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-sm">Aucun lieu enregistré.</div>
              ) : (
                venues.map((v) => (
                  <Link
                    key={v.id}
                    href={`/l/${v.slug}`}
                    className="bg-white shadow-sm border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-transform"
                  >
                    <div className="flex items-center gap-3">
                      <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 relative flex items-center justify-center">
                        <span className="text-lg">{CATEGORY_ICONS[v.category] || '📍'}</span>
                      </div>
                      <div className="flex flex-col">
                        <h3 className="font-bold text-[14px] text-slate-900">{v.name}</h3>
                        <p className="text-[11px] text-slate-400 capitalize">{v.neighborhood ? `${v.neighborhood} · ` : ''}{v.category}</p>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <Zap className="w-4 h-4 text-blue-500" />
                    </div>
                  </Link>
                ))
              )}
            </div>
          ) : (
            <Suspense fallback={
              <div className="h-[60vh] rounded-2xl bg-white border border-slate-200 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <LazyMapView className="h-[60vh]" unlockedVenueIds={unlockedVenueIds} />
            </Suspense>
          )}
        </div>
      </div>
      
      <InstallPrompt />
    </main>
  );
}
