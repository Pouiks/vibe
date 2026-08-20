"use client";
import Link from 'next/link';
import { useState, useEffect, lazy, Suspense } from 'react';
import { useVibeStore } from '@/core/store/useVibeStore';
import { supabase } from '@/core/supabase/client';
import { ScanLine, MessageCircle, Calendar, Map as MapIcon, List, User } from 'lucide-react';
import { formatEventTiming } from '@/core/datetime';
import { InstallPrompt } from '@/components/InstallPrompt';

const LazyMapView = lazy(() => import('@/modules/map/MapView'));
const LazyQRScanner = lazy(() => import('@/modules/scan/QRScannerOverlay'));

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
  city_slug: string;
  neighborhood: string | null;
  photo_url: string | null;
}

interface MyEvent {
  event_id: string;
  created_at: string;
  events: {
    id: string;
    title: string;
    start_time: string;
    venue_id: string;
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
  const user = useVibeStore((state) => state.user);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list');
  const [unlockedVenueIds, setUnlockedVenueIds] = useState<Set<string>>(new Set());
  const [scannerOpen, setScannerOpen] = useState(false);

  const [unreadByVenue, setUnreadByVenue] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        // last_read_at peut être absente tant que add_unread_tracking.sql
        // n'a pas été exécutée : on retombe alors sur la liste sans badges.
        let subs = (await supabase
          .from('channel_subscriptions')
          .select('venue_id, last_read_at')
          .eq('user_id', user.id)).data as { venue_id: string; last_read_at?: string }[] | null;
        if (!subs) {
          subs = (await supabase
            .from('channel_subscriptions')
            .select('venue_id')
            .eq('user_id', user.id)).data;
        }
        if (!subs) return;
        setUnlockedVenueIds(new Set(subs.map(d => d.venue_id)));

        if (!subs.length || !subs[0].last_read_at) return;
        const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
        const { data: msgs } = await supabase
          .from('messages')
          .select('venue_id, created_at, user_id')
          .in('venue_id', subs.map(s => s.venue_id))
          .is('event_id', null)
          .gte('created_at', since);
        if (!msgs) return;
        const lastRead = new Map(subs.map(s => [s.venue_id, s.last_read_at || since]));
        const counts: Record<string, number> = {};
        for (const m of msgs) {
          if (m.user_id === user.id) continue;
          if (m.created_at > (lastRead.get(m.venue_id) || since)) {
            counts[m.venue_id] = (counts[m.venue_id] || 0) + 1;
          }
        }
        setUnreadByVenue(counts);
      } catch { /* silently fail for non-critical data */ }
    })();
  }, [user]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    (async () => {
      timer = setTimeout(() => setLoading(false), 8000);
      try {
        const { data } = await supabase
          .from('venues')
          .select('id, slug, name, category, city_slug, neighborhood, photo_url')
          .order('created_at', { ascending: false });
        if (data) setVenues(data);
      } catch (err) {
        console.error('[Venues fetch]', err);
      } finally {
        clearTimeout(timer);
        setLoading(false);
      }
    })();
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const { data } = await supabase
          .from('event_participants')
          .select(`
            event_id,
            created_at,
            events!inner (
              id, title, start_time, venue_id, current_participants, max_participants,
              venues (slug, name, category)
            )
          `)
          .eq('user_id', user.id)
          .gte('events.start_time', new Date(Date.now() - 3600 * 1000).toISOString())
          .order('created_at', { ascending: false });
        if (data) setMyEvents(data as unknown as MyEvent[]);
      } catch { /* non-critical */ }
    })();
  }, [user]);

  // Un event d'un spot quitté n'est plus "mon event" ; dérivé AVANT le rendu
  // pour que le titre de section ne coiffe jamais un carrousel vide.
  const visibleEvents = myEvents.filter(me => me.events?.venues && unlockedVenueIds.has(me.events.venue_id));

  return (
    <main className="min-h-[100dvh] flex flex-col bg-slate-50">
      <header className="p-5 flex items-center justify-between sticky top-0 z-20 bg-slate-50/95 backdrop-blur-md border-b border-slate-200">
        <h1 className="font-extrabold text-2xl tracking-tight text-transparent bg-clip-text bg-gradient-to-r from-slate-900 to-slate-600">ATOUTE</h1>
      </header>

      <div className="flex-1 p-4 pb-32">
        {/* My Events */}
        {visibleEvents.length > 0 && (
          <div className="mb-8">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-blue-600 mb-3 ml-2 flex items-center gap-2">
              <Calendar className="w-3 h-3" /> Mes events
            </h2>
            <div className="flex gap-3 overflow-x-auto pb-2 snap-x snap-mandatory hide-scrollbar">
              {visibleEvents.map((me) => {
                const ev = me.events!;
                const evVenue = ev.venues!;
                return (
                  <Link
                    key={me.event_id}
                    href={`/l/${evVenue.slug}?tab=events`}
                    className="snap-start shrink-0 w-[240px] bg-card shadow-sm border border-slate-200 p-4 rounded-2xl flex flex-col justify-between active:scale-[0.98] transition-transform"
                  >
                    <div>
                      <div className="flex items-center gap-2 mb-2 text-blue-600 text-[10px] font-bold uppercase">
                        <div className="w-1.5 h-1.5 rounded-full bg-blue-600 animate-pulse" />
                        {evVenue.name}
                      </div>
                      <h3 className="font-bold text-slate-900 text-sm line-clamp-1 mb-1">{ev.title}</h3>
                      <div className="text-xs text-slate-500">
                        {ev.current_participants}/{ev.max_participants} participants
                      </div>
                    </div>
                    <div className="mt-3 bg-blue-50 text-blue-600 text-xs font-semibold py-1.5 px-3 rounded-lg w-fit">
                      {formatEventTiming(ev.start_time)}
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* View Mode Toggle + Venues */}
        <div>
          <div className="flex items-center justify-between mb-3 ml-2 mr-2">
            <h2 className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-400 flex items-center gap-2">
              <MessageCircle className="w-3 h-3" /> Mes spots
            </h2>
            <div className="flex bg-card border border-slate-200 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-[11px] font-semibold ${viewMode === 'list' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <List className="w-3.5 h-3.5" /> Liste
              </button>
              <button
                onClick={() => setViewMode('map')}
                className={`px-2.5 py-1.5 rounded-md transition-all flex items-center gap-1 text-[11px] font-semibold ${viewMode === 'map' ? 'bg-blue-600 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
              >
                <MapIcon className="w-3.5 h-3.5" /> Carte
              </button>
            </div>
          </div>

          {viewMode === 'list' ? (
            <div className="flex flex-col gap-2">
              {loading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                </div>
              ) : venues.filter(v => unlockedVenueIds.has(v.id)).length === 0 ? (
                <div className="text-center py-12 px-8 text-slate-400 text-sm leading-relaxed">
                  Tu n&apos;as encore rejoint aucun spot.<br />
                  Scanne le QR code affiché sur place pour entrer dans le groupe.
                </div>
              ) : (
                venues
                  .filter(v => unlockedVenueIds.has(v.id))
                  .map((v) => {
                    const unread = unreadByVenue[v.id] || 0;
                    return (
                      <Link
                        key={v.id}
                        href={`/l/${v.slug}`}
                        className="bg-card shadow-sm border border-slate-200 p-3.5 rounded-2xl flex items-center justify-between active:scale-[0.98] transition-transform"
                      >
                        <div className="flex items-center gap-3">
                          {/* Règle unique de vignette : photo du lieu si présente, sinon emoji de catégorie */}
                          {v.photo_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={v.photo_url} alt="" className="w-12 h-12 rounded-2xl object-cover border border-slate-200 shrink-0" />
                          ) : (
                            <div className="w-12 h-12 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-center shrink-0">
                              <span className="text-lg">{CATEGORY_ICONS[v.category] || '📍'}</span>
                            </div>
                          )}
                          <div className="flex flex-col">
                            <h3 className="font-bold text-[14px] text-slate-900">{v.name}</h3>
                            <p className="text-[11px] text-slate-400 capitalize">{v.neighborhood ? `${v.neighborhood} · ` : ''}{v.category}</p>
                          </div>
                        </div>
                        {unread > 0 && (
                          <span className="shrink-0 min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[11px] font-bold flex items-center justify-center">
                            {unread > 99 ? '99+' : unread}
                          </span>
                        )}
                      </Link>
                    );
                  })
              )}
            </div>
          ) : (
            <Suspense fallback={
              <div className="h-[60vh] rounded-2xl bg-card border border-slate-200 flex items-center justify-center">
                <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
              </div>
            }>
              <LazyMapView className="h-[60vh]" unlockedVenueIds={unlockedVenueIds} />
            </Suspense>
          )}
        </div>
      </div>
      
      {scannerOpen && (
        <Suspense fallback={
          <div className="fixed inset-0 z-50 bg-black flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
          </div>
        }>
          <LazyQRScanner onClose={() => setScannerOpen(false)} />
        </Suspense>
      )}

      <InstallPrompt />

      {/* ── Navbar basse : Lieux · Scan (flottant) · Profil ── */}
      <nav className="fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-md border-t border-slate-200 pb-[env(safe-area-inset-bottom)]">
        <div className="relative flex items-center h-16 max-w-md mx-auto">
          <div className="flex-1 flex justify-center">
            <span className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-blue-600">
              <List className="w-5 h-5" /> Lieux
            </span>
          </div>
          <button
            onClick={() => setScannerOpen(true)}
            aria-label="Scanner un QR code"
            className="absolute left-1/2 -translate-x-1/2 -top-6 w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg shadow-blue-600/30 active:scale-95 transition-transform border-4 border-slate-50"
          >
            <ScanLine className="w-7 h-7" />
          </button>
          <div className="flex-1 flex justify-center">
            <Link href="/profile" className="flex flex-col items-center gap-0.5 text-[10px] font-semibold text-slate-400 active:text-slate-600">
              <User className="w-5 h-5" /> Profil
            </Link>
          </div>
        </div>
      </nav>
    </main>
  );
}
