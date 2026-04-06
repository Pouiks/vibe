"use client";
import { use, useEffect, useState, useRef, useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useGeofencing } from '@/modules/venue/useGeofencing';
import { useRealtimeChat } from '@/modules/chat/useRealtimeChat';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/core/supabase/client';
import { MapPin, ShieldAlert, Send, Info, Crown, Plus, Calendar, ArrowLeft, Bell, BellOff, Trash2, Sparkles, LogOut } from 'lucide-react';
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
  lat: number;
  lng: number;
}

export default function VenuePage(props: { params: Promise<{ city: string; neighborhood: string; spotSlug: string }> }) {
  const params = use(props.params);
  const fullSlug = `${params.city}/${params.neighborhood}/${params.spotSlug}`;
  const searchParams = useSearchParams();
  const isScanned = searchParams?.get('scanned') === 'true';

  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(true);
  const [hasUnlockedArea, setHasUnlockedArea] = useState(false);

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
          .select('id, slug, name, category, city_slug, neighborhood, lat, lng')
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

  useEffect(() => {
    if (!venue || !user) return;

    if (isScanned) {
      supabase.from('channel_subscriptions')
        .upsert({ venue_id: venue.id, user_id: user.id }, { onConflict: 'user_id,venue_id' })
        .then(() => {
          setHasUnlockedArea(true);
          subscribeToPush();
        });
    } else {
      supabase.from('channel_subscriptions')
        .select('venue_id')
        .match({ venue_id: venue.id, user_id: user.id })
        .then((res) => {
          if (res.data && res.data.length > 0) setHasUnlockedArea(true);
        });
    }
  }, [venue?.id, user?.id, isScanned]);

  useSwipeBack();

  const [activeTab, setActiveTab] = useState<'chat' | 'events'>('chat');
  const [newMessage, setNewMessage] = useState('');
  const [isMuted, setIsMuted] = useState(false);
  const [loadingSub, setLoadingSub] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);

  const { messages, loading: chatLoading, onlineCount, onSiteCount, sendMessage, toggleReaction } = useRealtimeChat(venue?.id || fullSlug);
  const { distance, error: geoError } = useGeofencing(venue?.lat, venue?.lng);
  const { subscribeToPush, toggleMute } = usePushNotifications();

  const bottomRef = useRef<HTMLDivElement>(null);
  const vp = useVisualViewport();

  useEffect(() => {
    if (!user || !venue) return;
    let isMounted = true;
    supabase.from('channel_subscriptions')
      .select('venue_id, muted')
      .eq('user_id', user.id)
      .eq('venue_id', venue.id)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) {
          setIsMuted(!!data?.muted);
          setLoadingSub(false);
        }
      });
    return () => { isMounted = false };
  }, [user, venue]);

  const handleToggleMute = async () => {
    if (!venue) return;
    const newMuted = !isMuted;
    const success = await toggleMute(venue.id, newMuted);
    if (success) setIsMuted(newMuted);
  };

  const leaveSpot = async () => {
    if (!venue || !user) return;
    const confirmed = window.confirm('Quitter ce spot ? Tu ne pourras plus écrire dans le chat tant que tu n\'auras pas re-scanné le QR code.');
    if (!confirmed) return;

    await supabase.from('channel_subscriptions')
      .delete()
      .eq('user_id', user.id)
      .eq('venue_id', venue.id);

    setHasUnlockedArea(false);
    setIsMuted(false);
  };

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

  const loginHref = `/login?returnUrl=${encodeURIComponent(`/l/${fullSlug}${isScanned ? '?scanned=true' : ''}`)}`;

  if (venueLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-500 text-sm">Chargement du lieu...</p>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-slate-50">
        <ShieldAlert className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold">Lieu introuvable</h1>
        <p className="text-slate-500 mb-6">Ce QR Code ne semble rattaché à aucun lieu existant.</p>
        <Link href="/" className="bg-blue-600 px-4 py-2 rounded-xl text-white font-medium text-sm">Retour à l'accueil</Link>
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
            <Link href="/" className="shrink-0 p-1.5 -ml-1 text-slate-500 active:text-slate-900">
              <ArrowLeft className="w-5 h-5" />
            </Link>
            <div className="min-w-0">
              <h1 className="font-bold text-base text-slate-900 truncate flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                {venue.name}
              </h1>
              <div className="flex items-center gap-1.5 text-[11px]">
                {writePermission ? (
                  <span className="text-emerald-400 flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Sur place</span>
                ) : (
                  <span className="text-orange-400 flex items-center gap-1"><Info className="w-2.5 h-2.5" /> Spectateur</span>
                )}
                {onSiteCount > 0 && <span className="text-emerald-500">· {onSiteCount} sur place</span>}
                <span className="text-blue-600">· {onlineCount} en ligne</span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {user && hasUnlockedArea && (
              <button onClick={leaveSpot} className="p-1.5 rounded-full text-slate-400 active:text-red-500" title="Quitter le spot">
                <LogOut className="w-4.5 h-4.5" />
              </button>
            )}
            {user && hasUnlockedArea && !loadingSub && (
              <button onClick={handleToggleMute} className={`p-1.5 rounded-full ${isMuted ? 'text-slate-400' : 'text-blue-600'}`} title={isMuted ? 'Réactiver les notifications' : 'Couper les notifications'}>
                {isMuted ? <BellOff className="w-5 h-5" /> : <Bell className="w-5 h-5" />}
              </button>
            )}
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
        {activeTab === 'chat' && (
          <div className="flex flex-col gap-2 min-h-full">
            <div className="flex-1" />

            {chatLoading ? (
              <div className="flex items-center justify-center py-8 text-blue-600 animate-pulse text-sm">Chargement...</div>
            ) : (
              messages.map((m) => {
                const isMe = m.user_id === user?.id;
                const uniqueUserReactions = Object.values(
                  m.reactions?.reduce((acc, r) => { acc[r.userId] = r; return acc; }, {} as Record<string, any>) || {}
                );
                const reactionsCount = uniqueUserReactions.reduce((acc, r) => {
                  acc[r.type] = (acc[r.type] || 0) + 1; return acc;
                }, {} as Record<string, number>);
                const myReactions = uniqueUserReactions.filter(r => r.userId === user?.id).map(r => r.type);

                return (
                  <div key={m.id} className={`flex flex-col max-w-[80%] relative ${isMe ? 'self-end items-end' : 'self-start items-start'} ${m.isOptimistic ? 'opacity-60' : ''}`}>
                    <div className="flex items-center gap-1 mb-0.5 ml-1">
                      <span className={`text-[10px] font-medium ${isMe ? 'text-blue-600' : 'text-slate-500'}`}>
                        {isMe ? 'Vous' : m.username}
                      </span>
                      {m.isOnSite && <span className="text-[8px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">📍</span>}
                    </div>

                    {activeMenu === m.id && (
                      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white border border-slate-200 shadow-lg rounded-full px-3 py-1 flex items-center gap-3">
                        {['👍', '❤️', '😂', '🔥'].map(emoji => (
                          <button
                            key={emoji}
                            onClick={(e) => { e.stopPropagation(); toggleReaction(m.id, emoji); setActiveMenu(null); }}
                            className={`text-xl active:scale-90 rounded-full px-1.5 py-0.5 border ${myReactions.includes(emoji) ? 'bg-blue-50 border-blue-200 text-blue-600 scale-110' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                          >{emoji}</button>
                        ))}
                      </div>
                    )}

                    <div
                      onContextMenu={(e) => { e.preventDefault(); setActiveMenu(activeMenu === m.id ? null : m.id); }}
                      onClick={() => setActiveMenu(null)}
                      className={`px-3 py-2 rounded-2xl relative select-none ${isMe ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-slate-200 text-slate-900 rounded-tl-sm'}`}>
                      <p className="text-[13px] leading-relaxed pr-7">{m.content}</p>
                      <span className="absolute bottom-0.5 right-2 text-[9px] opacity-50">{formatMessageTime(m.created_at)}</span>
                    </div>

                    {Object.keys(reactionsCount).length > 0 && (
                      <div className={`mt-0.5 flex gap-1 ${isMe ? 'self-end' : 'self-start'}`}>
                        {Object.entries(reactionsCount).map(([emoji, count]) => (
                          <button
                            key={emoji}
                            onClick={() => toggleReaction(m.id, emoji)}
                            className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border ${myReactions.includes(emoji) ? 'bg-blue-50 border-blue-200 text-blue-600' : 'bg-slate-50 border-slate-200 text-slate-500'}`}
                          >
                            <span className="text-xs">{emoji}</span>{(count as number) > 1 ? (count as number) : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}

            {!hasUnlockedArea && user && (
              <div className="text-center text-[11px] text-orange-600 bg-orange-50 border border-orange-200 p-2 rounded-xl">
                🔒 Scannez le QR Code du lieu pour participer au chat.
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        )}

        {activeTab === 'events' && (
          <EventsTab venueId={venue.id} venueSlug={venue.slug} writePermission={writePermission} userId={user?.id} />
        )}
      </main>

      {/* ── Install prompt (venue context) ── */}
      <InstallPrompt context="venue" />

      {/* ── Input bar ── */}
      {activeTab === 'chat' && (
        <div className="shrink-0 px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] bg-slate-50 border-t border-slate-200 z-20">
          {!user ? (
            <Link href={loginHref} className="w-full bg-blue-600 text-white font-semibold py-3 rounded-xl text-sm active:scale-[0.98] flex items-center justify-center gap-2">
              <Sparkles className="w-4 h-4" /> Connecte-toi pour participer
            </Link>
          ) : (
            <form onSubmit={handleSend} className="relative flex items-center">
              <input
                type="text"
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                onFocus={scrollToBottom}
                disabled={!hasUnlockedArea}
                placeholder={hasUnlockedArea ? "Envoyer une vibe..." : "🔒 Scannez le QR Code pour écrire."}
                className={`w-full bg-white border border-slate-200 pl-4 pr-14 py-3 rounded-xl outline-none focus:border-blue-500 text-sm text-slate-900 placeholder:text-slate-400 ${!hasUnlockedArea ? 'opacity-50' : ''}`}
              />
              <button
                type="submit"
                disabled={!hasUnlockedArea || !newMessage.trim()}
                className="absolute right-1 p-3 bg-blue-600 disabled:bg-slate-200 disabled:text-slate-400 text-white rounded-xl active:scale-90"
              >
                <Send className="w-5 h-5" />
              </button>
            </form>
          )}
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
  max_participants: number;
  current_participants: number;
  creator_id: string;
}

function formatCountdown(startTime: string) {
  const diff = new Date(startTime).getTime() - Date.now();
  if (diff <= 0) return 'Maintenant !';
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return `Dans ${mins} min`;
  const hrs = Math.floor(mins / 60);
  return `Dans ${hrs}h${mins % 60 > 0 ? (mins % 60).toString().padStart(2, '0') : ''}`;
}

function EventsTab({ venueId, venueSlug, writePermission, userId }: { venueId: string; venueSlug: string; writePermission: boolean; userId?: string }) {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [participations, setParticipations] = useState<Set<string>>(new Set());

  useEffect(() => {
    supabase.from('events')
      .select('id, title, start_time, max_participants, current_participants, creator_id')
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
    await supabase.from('event_participants').insert({ event_id: eventId, user_id: userId });
  };

  const handleLeave = async (eventId: string) => {
    if (!userId) return;
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: Math.max(0, ev.current_participants - 1) } : ev));
    setParticipations(prev => { const n = new Set(prev); n.delete(eventId); return n; });
    await supabase.from('event_participants').delete().match({ event_id: eventId, user_id: userId });
  };

  const handleDelete = async (eventId: string) => {
    const confirm = window.confirm("Es-tu sûr de vouloir supprimer cet événement ?");
    if (!confirm) return;
    setEvents(prev => prev.filter(ev => ev.id !== eventId));
    await supabase.from('events').delete().eq('id', eventId);
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
          <p className="text-slate-400 text-sm">Aucun événement en cours.</p>
          <p className="text-slate-400 text-xs mt-1">Soyez le premier à en créer un !</p>
        </div>
      ) : (
        events.map(ev => {
          const isFull = ev.current_participants >= ev.max_participants;
          const isCreator = ev.creator_id === userId;
          const isParticipant = participations.has(ev.id);

          return (
            <div key={ev.id} className="bg-white border border-slate-200 shadow-sm p-3 rounded-xl flex items-center justify-between">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`p-2 rounded-lg ${isFull && !isParticipant ? 'bg-red-50' : 'bg-blue-50'}`}>
                  <Calendar className={`w-5 h-5 ${isFull && !isParticipant ? 'text-red-500' : 'text-blue-600'}`} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-sm text-slate-900 truncate">{ev.title}</h3>
                  <p className="text-[11px] text-slate-500">{formatCountdown(ev.start_time)} · {ev.current_participants}/{ev.max_participants}</p>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {isCreator ? (
                  <>
                    <span className="text-[9px] text-blue-600 font-medium px-1.5 py-0.5 bg-blue-50 rounded">Votre event</span>
                    <button onClick={() => handleDelete(ev.id)} className="p-1 bg-red-50 text-red-500 rounded-lg"><Trash2 className="w-3.5 h-3.5" /></button>
                  </>
                ) : isParticipant ? (
                  <button onClick={() => handleLeave(ev.id)} className="bg-slate-100 text-slate-600 text-[11px] font-semibold py-1 px-2.5 rounded-lg active:scale-95 border border-slate-200">Quitter</button>
                ) : !isFull ? (
                  <button onClick={() => handleJoin(ev.id)} className="bg-blue-600 text-white text-[11px] font-semibold py-1 px-2.5 rounded-lg active:scale-95">Rejoindre</button>
                ) : (
                  <span className="text-[11px] text-red-400 font-medium">Complet</span>
                )}
              </div>
            </div>
          );
        })
      )}

      {writePermission && (
        <Link href={`/event/create?venue_id=${venueId}&slug=${venueSlug}`} className="mt-1 border-2 border-dashed border-slate-300 active:border-blue-500 active:bg-blue-50 rounded-xl p-3 flex items-center justify-center gap-2 text-slate-500 active:text-blue-600">
          <Plus className="w-4 h-4" />
          <span className="text-sm font-medium">Créer un événement Flash</span>
        </Link>
      )}
    </div>
  );
}
