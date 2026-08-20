"use client";
import { use, useEffect, useState, useRef, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useGeofencing } from '@/modules/venue/useGeofencing';
import { useRealtimeChat } from '@/modules/chat/useRealtimeChat';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/core/supabase/client';
import { MapPin, ShieldAlert, Send, Info, Crown, Plus, Calendar, Trash2, Sparkles, MessageCircle } from 'lucide-react';
import { BackButton } from '@/components/BackButton';
import { formatEventTiming, formatDuration } from '@/core/datetime';
import { track } from '@/core/analytics';
import Link from 'next/link';
import { InstallPrompt } from '@/components/InstallPrompt';

function useVisualViewport() {
  const [rect, setRect] = useState<{ height: number; offsetTop: number } | null>(null);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const update = () => setRect({ height: vv.height, offsetTop: vv.offsetTop });
    update();

    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, []);

  return rect;
}

function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  const diffInMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffInMinutes < 15) {
    return diffInMinutes === 0 ? "A l'instant" : `Il y a ${diffInMinutes} min`;
  }
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
  city_slug: string;
  neighborhood: string | null;
  photo_url: string | null;
  lat: number;
  lng: number;
}

// useSearchParams exige une frontière Suspense au-dessus de son consommateur
// (doc Next) : sans elle, rendre cette route prérendable casserait le build.
export default function VenuePage(props: { params: Promise<{ city: string; neighborhood: string; spotSlug: string }> }) {
  return (
    <Suspense>
      <VenuePageInner {...props} />
    </Suspense>
  );
}

function VenuePageInner(props: { params: Promise<{ city: string; neighborhood: string; spotSlug: string }> }) {
  const params = use(props.params);
  const fullSlug = `${params.city}/${params.neighborhood}/${params.spotSlug}`;
  const searchParams = useSearchParams();
  const router = useRouter();
  // Le QR code physique encode /l/<slug>?t=<scan_token> : le token est validé
  // côté serveur par la RPC join_spot, seule porte d'entrée dans le spot.
  const scanToken = searchParams?.get('t');

  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(true);
  const [hasUnlockedArea, setHasUnlockedArea] = useState(false);
  // 'invalid' = token refusé par le serveur ; 'network' = RPC injoignable :
  // deux messages différents, ne jamais accuser le QR pour une panne réseau
  const [joinError, setJoinError] = useState<null | 'invalid' | 'network'>(null);
  const [checkingAccess, setCheckingAccess] = useState(true);

  const user = useVibeStore((state) => state.user);
  const writePermission = useVibeStore((state) => state.writePermission);

  useEffect(() => {
    let isMounted = true;
    let timer: ReturnType<typeof setTimeout>;

    (async () => {
      // Hard timeout: never spin more than 8 s
      timer = setTimeout(() => { if (isMounted) setVenueLoading(false); }, 8000);

      try {
        const { data, error } = await supabase.from('venues_with_coords')
          .select('id, slug, name, category, city_slug, neighborhood, photo_url, lat, lng')
          .eq('slug', fullSlug)
          .maybeSingle();
        if (error) console.error('[Venue fetch]', error);
        if (isMounted) { setVenue(data); setVenueLoading(false); }
      } catch (err) {
        console.error('[Venue fetch] network error', err);
        if (isMounted) setVenueLoading(false);
      } finally {
        clearTimeout(timer);
      }
    })();

    return () => { isMounted = false; clearTimeout(timer); };
  }, [fullSlug]);

  // Entonnoir du scan : une visite venue du QR (avec token) est comptée une
  // fois, connecté ou non - c'est la métrique d'efficacité de l'affiche.
  const qrVisitTracked = useRef(false);
  useEffect(() => {
    if (!venue || !scanToken || qrVisitTracked.current) return;
    qrVisitTracked.current = true;
    // Dédoublonnage par session : l'aller-retour scan → login → retour ne
    // compte qu'une visite, sinon le taux de conversion est divisé par deux.
    try {
      const key = `atoute_qr_visit_${venue.id}`;
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch { /* stockage indisponible : on compte quand même */ }
    track('qr_visit', { venueId: venue.id, userId: user?.id });
  }, [venue?.id, scanToken]);

  useEffect(() => {
    if (!venue) return;
    if (!user) { setCheckingAccess(false); return; }

    if (scanToken) {
      supabase.rpc('join_spot', { p_slug: venue.slug, p_token: scanToken })
        .then(async ({ error }) => {
          if (!error) {
            setHasUnlockedArea(true);
            setJoinError(null);
            setCheckingAccess(false);
            track('scan_success', { venueId: venue.id, userId: user.id });
            router.replace(`/l/${fullSlug}`);
            const result = await subscribeToPush();
            if (result === 'denied') setShowNotifGuide(true);
            return;
          }
          console.error('[join_spot]', error.message);
          // Token invalide ou RPC en échec : ne pas verrouiller un membre déjà inscrit.
          const { data } = await supabase.from('channel_subscriptions')
            .select('venue_id')
            .match({ venue_id: venue.id, user_id: user.id })
            .maybeSingle();
          if (data) {
            setHasUnlockedArea(true);
            router.replace(`/l/${fullSlug}`);
          } else {
            setJoinError(/invalid_token/i.test(error.message) ? 'invalid' : 'network');
          }
          setCheckingAccess(false);
        });
    } else {
      supabase.from('channel_subscriptions')
        .select('venue_id')
        .match({ venue_id: venue.id, user_id: user.id })
        .then((res) => {
          if (res.data && res.data.length > 0) setHasUnlockedArea(true);
          setCheckingAccess(false);
        });
    }
  }, [venue?.id, user?.id, scanToken]);

  useSwipeBack();

  // ?tab=events : deep link des notifications push, du carrousel de la home
  // et de la redirection post-création d'event
  const [activeTab, setActiveTab] = useState<'chat' | 'events'>(
    searchParams?.get('tab') === 'events' ? 'events' : 'chat'
  );
  // Une notification peut cibler une page déjà montée (Next réutilise le
  // composant) : suivre aussi les changements de searchParams.
  useEffect(() => {
    if (searchParams?.get('tab') === 'events') setActiveTab('events');
  }, [searchParams]);
  const [eventChat, setEventChat] = useState<{ id: string; title: string } | null>(null);
  const [newMessage, setNewMessage] = useState('');
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  const [showNotifGuide, setShowNotifGuide] = useState(false);

  const { messages, loading: chatLoading, onlineCount, onSiteCount, presenceSynced, sendMessage, toggleReaction } = useRealtimeChat(venue?.id || fullSlug, eventChat?.id ?? null, !!user && hasUnlockedArea);
  const { permission: geoPermission, requestPresence } = useGeofencing(venue?.lat, venue?.lng);
  const { subscribeToPush } = usePushNotifications();

  const bottomRef = useRef<HTMLDivElement>(null);
  const vp = useVisualViewport();

  // Marque le chat du lieu comme lu (badge non-lus de la home), throttlé.
  // Ignore silencieusement l'erreur tant que add_unread_tracking.sql n'est
  // pas passée (colonne absente).
  const lastReadSyncAt = useRef(0);
  useEffect(() => {
    if (!user || !venue || !hasUnlockedArea || eventChat) return;
    if (Date.now() - lastReadSyncAt.current < 10_000) return;
    lastReadSyncAt.current = Date.now();
    supabase.from('channel_subscriptions')
      .update({ last_read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .eq('venue_id', venue.id)
      .then(() => {});
  }, [user, venue, hasUnlockedArea, eventChat, messages.length]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
  }, []);

  useEffect(() => { scrollToBottom(); }, [messages, scrollToBottom]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue) return;
    const sent = await sendMessage(newMessage);
    if (sent) setNewMessage('');
  };

  const loginHref = `/login?returnUrl=${encodeURIComponent(`/l/${fullSlug}${scanToken ? `?t=${scanToken}` : ''}`)}`;

  if (venueLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 text-sm">Chargement du spot...</p>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold">Spot introuvable</h1>
        <p className="text-slate-500 mb-6">Ce QR code ne semble rattaché à aucun spot existant.</p>
        <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium text-sm">Retour à l&apos;accueil</Link>
      </div>
    );
  }

  const containerStyle = vp
    ? { height: `${vp.height}px`, top: `${vp.offsetTop}px` }
    : { height: '100dvh', top: '0px' };

  return (
    <div style={containerStyle} className="fixed inset-x-0 flex flex-col bg-slate-50 overflow-hidden">

      {/* ── Header ── */}
      <header className="shrink-0 bg-slate-50/95 backdrop-blur-md border-b border-slate-200 z-20 px-3 pt-[max(0.5rem,env(safe-area-inset-top))]">
        <div className="flex items-center justify-between py-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <BackButton label="" className="shrink-0 p-1.5 -ml-1 text-slate-500 active:text-slate-900 inline-flex items-center" />
            <div className="min-w-0">
              <h1 className="font-bold text-base text-slate-900 flex items-center gap-1.5 min-w-0">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                <span className="truncate">{venue.name}</span>
              </h1>
              <div className="flex items-center gap-1.5 text-[11px]">
                {writePermission ? (
                  <span className="text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sur place</span>
                ) : geoPermission === 'prompt' ? (
                  <button onClick={requestPresence} className="text-orange-400 flex items-center gap-1 underline decoration-dotted underline-offset-2 active:opacity-70">
                    <Info className="w-2.5 h-2.5" /> Spectateur · activer ma position
                  </button>
                ) : (
                  <span className="text-orange-400 flex items-center gap-1"><Info className="w-2.5 h-2.5" /> Spectateur</span>
                )}
                {presenceSynced && onSiteCount > 0 && <span className="text-emerald-500">· {onSiteCount} sur place</span>}
                {presenceSynced && <span className="text-blue-600">· {onlineCount} en ligne</span>}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {user ? (
              <Link href="/profile" className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold text-[11px] relative">
                {user.username.substring(0, 2).toUpperCase()}
                {user.isPremium && <Crown className="absolute -top-0.5 -right-0.5 w-3 h-3 text-amber-500" />}
              </Link>
            ) : (
              <Link href={loginHref} className="bg-blue-600 text-white text-xs font-semibold py-1.5 px-3 rounded-lg active:scale-95 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Connexion
              </Link>
            )}
          </div>
        </div>

        <div className="flex bg-slate-100 p-0.5 rounded-lg mb-2">
          <button
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'chat' ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}>
            Chat Local
          </button>
          <button
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-1.5 text-xs font-semibold rounded-md transition-all ${activeTab === 'events' ? 'bg-blue-600 text-white shadow' : 'text-slate-400'}`}>
            Events Flash
          </button>
        </div>
      </header>

      {/* ── Messages area ── */}
      <main className="flex-1 min-h-0 overflow-y-auto overscroll-contain px-3 py-2">
        {activeTab === 'chat' && (checkingAccess ? (
          <div className="flex items-center justify-center h-full py-16">
            <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : !hasUnlockedArea ? (
          <div className="flex flex-col items-center justify-center h-full py-16 px-6 text-center gap-3">
            {venue.photo_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={venue.photo_url} alt={venue.name} className="w-full max-w-[280px] h-36 object-cover rounded-2xl border border-slate-200 shadow-sm" />
            )}
            {scanToken && !user ? (
              <>
                <div className="bg-blue-50 p-4 rounded-full text-3xl">👋</div>
                <h2 className="font-bold text-slate-900">Presque là !</h2>
                <p className="text-slate-500 text-sm leading-relaxed max-w-[280px]">
                  Connecte-toi avec ton email pour entrer dans le spot.
                  Pas de compte ? Il se crée automatiquement.
                </p>
              </>
            ) : (
              <>
                <div className="bg-blue-50 p-4 rounded-full text-3xl">🔒</div>
                <h2 className="font-bold text-slate-900">Chat réservé aux membres</h2>
                <p className="text-slate-500 text-sm leading-relaxed max-w-[280px]">
                  Scanne une fois le QR code affiché sur place pour rejoindre le groupe.
                  Ensuite, tu peux discuter d&apos;où tu veux.
                </p>
              </>
            )}
            {presenceSynced && onlineCount > 0 && (
              <p className="text-blue-600 text-xs font-semibold">
                {onlineCount} membre{onlineCount > 1 ? 's' : ''} en ligne en ce moment
              </p>
            )}
            {joinError && (
              <p className="text-red-600 text-[11px] bg-red-50 border border-red-200 p-2 rounded-xl">
                {joinError === 'invalid'
                  ? "⚠️ Ce QR code n'est plus valide. Signale-le à l'équipe du lieu ou réessaie plus tard."
                  : '⚠️ Connexion impossible pour le moment. Vérifie ton réseau et réessaie.'}
              </p>
            )}
            {!user && (
              <Link href={loginHref} className="mt-2 bg-blue-600 text-white text-sm font-semibold py-2.5 px-5 rounded-xl active:scale-95 flex items-center gap-2">
                <Sparkles className="w-4 h-4" /> Connexion
              </Link>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3 min-h-full">
            {eventChat && (
              <div className="sticky top-0 z-10 bg-blue-50 border border-blue-200 rounded-xl p-2.5 flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-700 truncate">💬 {eventChat.title}</span>
                <button onClick={() => setEventChat(null)} className="text-[11px] text-blue-600 font-medium shrink-0 ml-2 active:opacity-70">
                  ← Chat du lieu
                </button>
              </div>
            )}
            <div className="flex-1" />

            {chatLoading ? (
              <div className="flex items-center justify-center py-8 text-blue-600 animate-pulse text-sm">Chargement...</div>
            ) : (
              messages.map((m) => {
                const isMe = m.user_id === user?.id;
                const uniqueUserReactions = Object.values(
                  m.reactions?.reduce((acc, r) => { acc[r.userId] = r; return acc; }, {} as Record<string, { type: string; userId: string }>) || {}
                );
                const reactionsCount = uniqueUserReactions.reduce((acc, r) => {
                  acc[r.type] = (acc[r.type] || 0) + 1; return acc;
                }, {} as Record<string, number>);
                const myReactions = uniqueUserReactions.filter(r => r.userId === user?.id).map(r => r.type);

                return (
                  <div key={m.id} className={`flex flex-col max-w-[80%] relative ${isMe ? 'self-end items-end' : 'self-start items-start'} ${m.isOptimistic ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-1.5 mb-1 px-1">
                      <span className={`text-[11px] font-medium ${isMe ? 'text-blue-600' : 'text-slate-500'}`}>
                        {isMe ? 'Moi' : m.username}
                      </span>
                      {m.isOnSite && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">📍</span>}
                      <span className="text-[10px] text-slate-400">{formatMessageTime(m.created_at)}</span>
                    </div>

                    {activeMenu === m.id && (
                      <>
                        {/* Tap ailleurs = fermer */}
                        <div className="fixed inset-0 z-40" onClick={() => setActiveMenu(null)} />
                        <div className={`absolute bottom-full mb-1 z-50 bg-card border border-slate-200 shadow-xl rounded-full px-1.5 py-1 flex items-center gap-0.5 ${isMe ? 'right-0' : 'left-0'}`}>
                          {['👍', '❤️', '😂', '🔥'].map(emoji => (
                            <button
                              key={emoji}
                              onClick={(e) => { e.stopPropagation(); toggleReaction(m.id, emoji); setActiveMenu(null); }}
                              className={`w-10 h-10 flex items-center justify-center text-2xl rounded-full active:scale-90 transition-transform ${myReactions.includes(emoji) ? 'bg-blue-50' : ''}`}
                            >{emoji}</button>
                          ))}
                        </div>
                      </>
                    )}

                    <div
                      onContextMenu={(e) => { e.preventDefault(); if (hasUnlockedArea) setActiveMenu(activeMenu === m.id ? null : m.id); }}
                      onClick={() => { if (hasUnlockedArea) setActiveMenu(activeMenu === m.id ? null : m.id); }}
                      className={`px-3.5 py-2.5 rounded-2xl select-none ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-card border border-slate-200 text-slate-900 rounded-tl-sm'}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{m.content}</p>
                    </div>

                    {Object.keys(reactionsCount).length > 0 && (
                      <div className={`mt-1 flex flex-wrap gap-1 ${isMe ? 'self-end justify-end' : 'self-start'}`}>
                        {Object.entries(reactionsCount).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => hasUnlockedArea && toggleReaction(m.id, emoji)}
                            className={`flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-full border shadow-sm ${myReactions.includes(emoji) ? 'bg-blue-50 border-blue-300 text-blue-600' : 'bg-card border-slate-200 text-slate-500'}`}
                          >
                            <span className="text-[13px] leading-none">{emoji}</span>{(count as number) > 1 ? (count as number) : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            <div ref={bottomRef} />
          </div>
        ))}

        {activeTab === 'events' && (
          <EventsTab
            venueId={venue.id}
            venueSlug={venue.slug}
            isMember={hasUnlockedArea}
            userId={user?.id}
            onOpenChat={(ev) => { setEventChat({ id: ev.id, title: ev.title }); setActiveTab('chat'); }}
          />
        )}
      </main>

      {/* ── Notification denied guide ── */}
      {showNotifGuide && (
        <div className="shrink-0 mx-3 my-1.5 bg-amber-50 border border-amber-200 rounded-xl p-3 relative">
          <button onClick={() => setShowNotifGuide(false)} className="absolute top-2 right-2 text-amber-400 hover:text-amber-600 text-xs">✕</button>
          <p className="text-[12px] font-semibold text-amber-800 mb-1">🔔 Notifications bloquées</p>
          <p className="text-[11px] text-amber-700 leading-relaxed">
            Pour recevoir les messages de ce spot, active les notifications dans tes <strong>Réglages</strong> :
            Réglages → ATOUTE → Notifications → Autoriser.
          </p>
        </div>
      )}

      {/* ── Install prompt (venue context) ── */}
      <InstallPrompt context="venue" />

      {/* ── Input bar ── */}
      {activeTab === 'chat' && user && hasUnlockedArea && (
        <div className="shrink-0 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-50 border-t border-slate-200 z-20">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onFocus={scrollToBottom}
              placeholder={eventChat ? `Message pour « ${eventChat.title} »…` : 'Écris aux gens du spot…'}
              className="w-full bg-card border border-slate-200 pl-4 pr-14 py-3 rounded-xl outline-none focus:border-blue-500 text-sm text-slate-900 placeholder:text-slate-400"
            />
            <button
              type="submit"
              disabled={!newMessage.trim()}
              className="absolute right-1 p-3 bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl active:scale-90"
            >
              <Send className="w-5 h-5" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Events Tab Component ──
interface EventItem {
  id: string;
  title: string;
  start_time: string;
  duration_minutes: number | null;
  max_participants: number;
  current_participants: number;
  creator_id: string;
}

function EventsTab({ venueId, venueSlug, isMember, userId, onOpenChat }: { venueId: string; venueSlug: string; isMember: boolean; userId?: string; onOpenChat: (ev: EventItem) => void }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [participations, setParticipations] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('events')
      .select('id, title, start_time, duration_minutes, max_participants, current_participants, creator_id')
      .eq('venue_id', venueId)
      .gte('start_time', new Date(Date.now() - 3600000).toISOString())
      .order('start_time', { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data);
        setLoading(false);
      });

    if (userId) {
      supabase.from('event_participants')
        .select('event_id')
        .eq('user_id', userId)
        .then(({ data }) => {
          if (data) setParticipations(new Set(data.map(d => d.event_id)));
        });
    }

    const channel = supabase
      .channel(`events:venue_id=eq.${venueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `venue_id=eq.${venueId}` },
        (payload) => setEvents(prev => [...prev, payload.new as EventItem]))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `venue_id=eq.${venueId}` },
        (payload) => setEvents(prev => prev.map(ev => ev.id === (payload.new as EventItem).id ? payload.new as EventItem : ev)))
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [venueId]);

  const handleJoin = async (eventId: string) => {
    if (!userId) return;
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: ev.current_participants + 1 } : ev));
    setParticipations(prev => { const n = new Set(prev); n.add(eventId); return n; });
    const { error } = await supabase.from('event_participants').insert({ event_id: eventId, user_id: userId });
    if (error) {
      console.error('[join event]', error.message);
      setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: Math.max(0, ev.current_participants - 1) } : ev));
      setParticipations(prev => { const n = new Set(prev); n.delete(eventId); return n; });
      // Capacité verrouillée en base (events_hardening) : la dernière place
      // vient d'être prise par quelqu'un d'autre.
      if (/event_full/i.test(error.message)) {
        alert('Trop tard, cet event vient de se remplir !');
      }
    }
  };

  const handleLeave = async (eventId: string) => {
    if (!userId) return;
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: Math.max(0, ev.current_participants - 1) } : ev));
    setParticipations(prev => { const n = new Set(prev); n.delete(eventId); return n; });
    const { error } = await supabase.from('event_participants').delete().match({ event_id: eventId, user_id: userId });
    if (error) {
      console.error('[leave event]', error.message);
      setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: ev.current_participants + 1 } : ev));
      setParticipations(prev => { const n = new Set(prev); n.add(eventId); return n; });
    }
  };

  const handleDelete = async (eventId: string) => {
    const confirm = window.confirm('Supprimer cet event ?');
    if (!confirm) return;
    const removed = events.find(ev => ev.id === eventId);
    setEvents(prev => prev.filter(ev => ev.id !== eventId));
    const { error } = await supabase.from('events').delete().eq('id', eventId);
    if (error && removed) {
      console.error('[delete event]', error.message);
      setEvents(prev => [...prev, removed].sort((a, b) => a.start_time.localeCompare(b.start_time)));
    }
  };

  return (
    <div className="flex flex-col gap-3">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-400 text-sm">Aucun event en cours.</p>
          <p className="text-slate-400 text-xs mt-1">Sois le premier à en créer un !</p>
        </div>
      ) : (
        events.map(ev => {
          const isFull = ev.current_participants >= ev.max_participants;
          const isCreator = ev.creator_id === userId;
          const isParticipant = participations.has(ev.id);

          return (
            <div key={ev.id} className="bg-card border border-slate-200 shadow-sm p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg ${isFull && !isParticipant ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <Calendar className={`w-5 h-5 ${isFull && !isParticipant ? 'text-red-500' : 'text-blue-600'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-slate-900 truncate">{ev.title}</h3>
                  <p className="text-[11px] text-slate-500">
                    {formatEventTiming(ev.start_time)}{ev.duration_minutes ? ` · ${formatDuration(ev.duration_minutes)}` : ''} · {ev.current_participants}/{ev.max_participants}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {(isCreator || isParticipant) && (
                  <button onClick={() => onOpenChat(ev)} className="p-1.5 bg-blue-50 text-blue-600 rounded-lg active:scale-95" title="Chat de l'event">
                    <MessageCircle className="w-3.5 h-3.5" />
                  </button>
                )}
                {isCreator ? (
                  <>
                    <span className="text-[9px] text-blue-600 font-medium px-1.5 py-0.5 bg-blue-50 rounded">Ton event</span>
                    <button onClick={() => handleDelete(ev.id)} className="p-1 bg-red-50 text-red-500 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                ) : isParticipant ? (
                  <button onClick={() => handleLeave(ev.id)} className="bg-slate-100 text-slate-600 text-[11px] font-semibold py-1 px-2.5 rounded-lg active:scale-95 border border-slate-200">Quitter</button>
                ) : isFull ? (
                  <span className="text-[11px] text-red-400 font-medium">Complet</span>
                ) : isMember ? (
                  <button onClick={() => handleJoin(ev.id)} className="bg-blue-600 text-white text-[11px] font-semibold py-1 px-2.5 rounded-lg active:scale-95">Rejoindre</button>
                ) : (
                  <span className="text-[10px] text-slate-400 font-medium">🔒 Scan requis</span>
                )}
              </div>
            </div>
          );
        })
      )}

      {isMember ? (
        <Link href={`/event/create?venue_id=${venueId}&slug=${venueSlug}`} className="mt-1 border-2 border-dashed border-slate-300 active:border-blue-500 active:bg-blue-50 rounded-xl p-3 flex items-center justify-center gap-2 text-slate-500 active:text-blue-600">
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Créer un event</span>
        </Link>
      ) : (
        <p className="mt-1 text-center text-[11px] text-slate-400 p-3">
          🔒 Scanne le QR code du spot pour créer un event.
        </p>
      )}
    </div>
  );
}
