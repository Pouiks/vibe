"use client";
import { useState, useRef, useEffect, MouseEvent } from 'react';
import { use } from 'react';
import { useGeofencing } from '@/modules/venue/useGeofencing';
import { useRealtimeChat } from '@/modules/chat/useRealtimeChat';
import { useVibeStore } from '@/core/store/useVibeStore';
import { useSwipeBack } from '@/hooks/useSwipeBack';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { supabase } from '@/core/supabase/client';
import { MapPin, ShieldAlert, Send, Info, Crown, Plus, Calendar, ArrowLeft, Bell, BellOff } from 'lucide-react';
import Link from 'next/link';


function formatMessageTime(dateStr: string) {
  const d = new Date(dateStr);
  const diffInMinutes = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diffInMinutes < 15) {
     return diffInMinutes === 0 ? "A l'instant" : `Il y a ${diffInMinutes} min`;
  }
  return d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute:'2-digit' });
}

interface Venue {
  id: string;
  slug: string;
  name: string;
  category: string;
  lat: number;
  lng: number;
}

export default function VenuePage(props: { params: Promise<{ slug: string }> }) {
  const params = use(props.params); 
  const slug = params.slug;

  // Dynamic venue fetch from Supabase
  const [venue, setVenue] = useState<Venue | null>(null);
  const [venueLoading, setVenueLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;
    supabase.from('venues')
      .select('id, slug, name, category, lat, lng')
      .eq('slug', slug)
      .maybeSingle()
      .then(({ data }) => {
        if (isMounted) {
          setVenue(data);
          setVenueLoading(false);
        }
      });
    return () => { isMounted = false };
  }, [slug]);

  // Activer le Swipe PWA natif
  useSwipeBack();

  // Local state
  const [activeTab, setActiveTab] = useState<'chat' | 'events'>('chat');
  const [newMessage, setNewMessage] = useState('');
  const [isFollowing, setIsFollowing] = useState(false);
  const [loadingSub, setLoadingSub] = useState(true);
  const [activeMenu, setActiveMenu] = useState<string | null>(null);
  
  // Stores and Hooks
  const user = useVibeStore((state) => state.user);
  const writePermission = useVibeStore((state) => state.writePermission);
  const { messages, loading: chatLoading, sendMessage, toggleReaction } = useRealtimeChat(venue?.id || slug);
  const { distance, error: geoError } = useGeofencing(venue?.lat, venue?.lng);
  const { toggleVenueSubscription } = usePushNotifications();

  const bottomRef = useRef<HTMLDivElement>(null);

  // Check subscription to channel
  useEffect(() => {
    if (!user || !venue) return;
    let isMounted = true;
    supabase.from('channel_subscriptions')
      .select('venue_id')
      .eq('user_id', user.id)
      .eq('venue_id', venue.id)
      .maybeSingle()
      .then(({data}) => {
         if (isMounted) {
           setIsFollowing(!!data);
           setLoadingSub(false);
         }
      });
    return () => { isMounted = false };
  }, [user, venue]);

  const toggleFollow = async () => {
    if (!venue) return;
    const newState = !isFollowing;
    const success = await toggleVenueSubscription(venue.id, newState);
    if (success) setIsFollowing(newState);
  };

  useEffect(() => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!venue) return;
    const sent = await sendMessage(newMessage);
    if (sent) setNewMessage('');
  };

  if (venueLoading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-vibe-dark">
        <div className="w-8 h-8 border-2 border-brand-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-slate-400 text-sm">Chargement du lieu...</p>
      </div>
    );
  }

  if (!venue) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6 text-center bg-vibe-dark">
        <ShieldAlert className="w-12 h-12 text-red-400 mb-4" />
        <h1 className="text-xl font-bold">Lieu introuvable</h1>
        <p className="text-slate-400 mb-6">Ce QR Code ne semble rattaché à aucun lieu existant.</p>
        <Link href="/" className="bg-brand-600 px-4 py-2 rounded-xl text-white font-medium text-sm">Retour à l'accueil</Link>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-[100dvh] bg-vibe-dark relative overflow-hidden">
      {/* Background glow */}
      <div className="absolute top-0 right-0 w-64 h-64 bg-brand-900 rounded-full mix-blend-screen filter blur-[100px] opacity-30"></div>

      {/* Header */}
      <header className="glass p-4 sticky top-0 z-20 shadow-lg border-b-0 border-vibe-border rounded-b-2xl">
        <div className="flex items-center justify-between mb-3">
           <div className="flex items-center gap-2">
             <Link href="/" className="p-1.5 bg-vibe-dark/50 hover:bg-brand-500/20 rounded-xl transition-colors text-slate-300 hover:text-white">
               <ArrowLeft className="w-5 h-5" />
             </Link>
             <div className="flex flex-col">
               <h1 className="font-bold text-lg text-white drop-shadow-sm flex items-center gap-2">
                 <MapPin className="w-4 h-4 text-brand-500" />
                 {venue.name}
               </h1>
               <div className="flex items-center gap-2 text-xs">
                  {writePermission ? (
                     <span className="text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> Connecté (Sur place)</span>
                  ) : (
                     <span className="text-orange-400 flex items-center gap-1"><Info className="w-2 h-2" /> Mode Spectateur (Trop loin)</span>
                  )}
               </div>
             </div>
           </div>
           
           <div className="flex items-center gap-3">
             {/* Notification Toggle Button */}
             {!loadingSub && (
               <button onClick={toggleFollow} className={`p-2 rounded-full transition-colors ${isFollowing ? 'bg-brand-500/20 text-brand-400' : 'bg-vibe-dark/50 text-slate-500 hover:text-slate-300'}`}>
                 {isFollowing ? <Bell className="w-5 h-5" /> : <BellOff className="w-5 h-5" />}
               </button>
             )}

             <Link href="/profile" className="flex items-center justify-center w-9 h-9 rounded-full bg-brand-600 border border-brand-500/50 shadow-[0_0_10px_rgba(99,102,241,0.4)] transition-transform hover:scale-105 active:scale-95 text-white font-bold tracking-widest text-xs relative">
                {user?.username?.substring(0, 2).toUpperCase()}
                {user?.isPremium && <Crown className="absolute -top-1 -right-1 w-3 h-3 text-vibe-accent drop-shadow-md" />}
             </Link>
           </div>
        </div>

        {/* Tabs */}
        <div className="flex bg-vibe-dark/50 p-1 rounded-xl">
           <button 
            onClick={() => setActiveTab('chat')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'chat' ? 'bg-brand-600 shadow-md text-white' : 'text-slate-400 hover:text-white'}`}>
             Chat Local
           </button>
           <button 
            onClick={() => setActiveTab('events')}
            className={`flex-1 py-1.5 text-sm font-medium rounded-lg transition-all ${activeTab === 'events' ? 'bg-brand-600 shadow-md text-white' : 'text-slate-400 hover:text-white'}`}>
             Events Flash
           </button>
        </div>
      </header>

      {/* Content area */}
      <main className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 relative pb-20 z-10">
         {activeTab === 'chat' && (
           <>
              {chatLoading ? (
                 <div className="flex-1 flex items-center justify-center text-brand-500 animate-pulse">Chargement Vibes...</div>
              ) : (
                 messages.map((m) => {
                    const isMe = m.user_id === user?.id;
                    
                    // Strict safety: Enforce maximum 1 reaction per userId (takes the latest one)
                    const uniqueUserReactions = Object.values(
                       m.reactions?.reduce((acc, r) => {
                          acc[r.userId] = r;
                          return acc;
                       }, {} as Record<string, any>) || {}
                    );
                    
                    const reactionsCount = uniqueUserReactions.reduce((acc, r) => {
                       acc[r.type] = (acc[r.type] || 0) + 1;
                       return acc;
                    }, {} as Record<string, number>);
                    
                    const myReactions = uniqueUserReactions.filter(r => r.userId === user?.id).map(r => r.type);
                    
                    const handleContextMenu = (e: React.MouseEvent | React.TouchEvent) => {
                       e.preventDefault();
                       setActiveMenu(activeMenu === m.id ? null : m.id);
                    };

                    return (
                      <div key={m.id} className={`flex flex-col max-w-[85%] relative ${isMe ? 'self-end items-end' : 'self-start items-start'} ${m.isOptimistic ? 'opacity-70' : ''}`}>
                         {/* Username */}
                         <span className={`text-[10px] font-medium ml-1 mb-0.5 ${isMe ? 'text-brand-300' : 'text-slate-400'}`}>
                           {isMe ? 'Vous' : m.username}
                         </span>
                         
                         {/* Reaction Menu */}
                         {activeMenu === m.id && (
                            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-vibe-dark/95 border border-brand-500/30 shadow-[0_10px_40px_rgba(0,0,0,0.5)] backdrop-blur-xl rounded-full px-3 py-1.5 flex items-center gap-3 animate-in fade-in zoom-in-75 duration-200">
                               {['👍', '❤️', '😂', '🔥'].map(emoji => (
                                 <button 
                                   key={emoji}
                                   onClick={(e) => { e.stopPropagation(); toggleReaction(m.id, emoji); setActiveMenu(null); }}
                                   className={`text-2xl hover:scale-125 transition-transform active:scale-90 ${myReactions.includes(emoji) ? 'scale-110 drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : ''}`}
                                 >
                                   {emoji}
                                 </button>
                               ))}
                            </div>
                         )}

                         <div 
                           onContextMenu={handleContextMenu}
                           onClick={() => setActiveMenu(null)}
                           className={`p-3 rounded-2xl relative select-none cursor-pointer group ${isMe ? 'bg-brand-600 text-white rounded-tr-sm' : 'bg-vibe-card border border-vibe-border text-white rounded-tl-sm'}`}>
                            <p className="text-sm leading-relaxed pr-8">{m.content}</p>
                            <span className="absolute bottom-1 right-2 text-[9px] opacity-60">
                               {formatMessageTime(m.created_at)}
                            </span>
                         </div>
                         
                         {/* Reaction Badges */}
                         {Object.keys(reactionsCount).length > 0 && (
                            <div className={`mt-1 flex gap-1 ${isMe ? 'self-end' : 'self-start'}`}>
                               {Object.entries(reactionsCount).map(([emoji, count]) => (
                                  <button 
                                     key={emoji}
                                     onClick={() => toggleReaction(m.id, emoji)}
                                     className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border transition-colors ${myReactions.includes(emoji) ? 'bg-brand-500/20 border-brand-500/40 text-brand-300' : 'bg-vibe-dark/50 border-vibe-border/50 text-slate-400'}`}
                                  >
                                      <span className="text-xs">{emoji}</span> {(count as number) > 1 ? (count as number) : ''}
                                  </button>
                               ))}
                            </div>
                         )}
                      </div>
                    );
                 })
              )}
              {(!writePermission && distance && distance > 100) && (
                 <div className="text-center text-xs text-orange-400 border border-orange-500/20 bg-orange-500/10 p-2 rounded-xl mt-4">
                  Vous êtes à {Math.round(distance)}m. Rapprochez-vous pour discuter.
                 </div>
              )}
              <div ref={bottomRef} className="h-2" />
           </>
         )}

         {activeTab === 'events' && (
           <EventsTab venueId={venue.id} venueSlug={venue.slug} writePermission={writePermission} userId={user?.id} />
         )}
      </main>

      {/* Chat Input (Sticky bottom) */}
      {activeTab === 'chat' && (
        <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-vibe-dark via-vibe-dark to-transparent pt-12 pb-6 z-20">
          <form onSubmit={handleSend} className="relative flex items-center">
            <input 
              type="text" 
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              disabled={!writePermission}
              placeholder={writePermission ? "Envoyer une vibe..." : "Vous devez être sur place..."}
              className={`w-full glass pl-4 pr-12 py-3.5 rounded-2xl outline-none focus:border-brand-500 transition-colors text-sm shadow-[0_4px_20px_rgba(0,0,0,0.3)] ${!writePermission ? 'opacity-50 cursor-not-allowed' : ''}`}
            />
            <button 
              type="submit"
              disabled={!writePermission || !newMessage.trim()}
              className="absolute right-2 p-2 bg-brand-600 hover:bg-brand-500 disabled:bg-slate-700 disabled:text-slate-400 text-white rounded-xl transition-all active:scale-90"
            >
               <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── Events Tab Component ──────────────────────────────────────
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

  useEffect(() => {
    // Fetch upcoming events
    supabase.from('events')
      .select('id, title, start_time, max_participants, current_participants, creator_id')
      .eq('venue_id', venueId)
      .gte('start_time', new Date(Date.now() - 3600000).toISOString()) // include events started < 1h ago
      .order('start_time', { ascending: true })
      .then(({ data }) => {
        if (data) setEvents(data);
        setLoading(false);
      });

    // Subscribe to realtime
    const channel = supabase
      .channel(`events:venue_id=eq.${venueId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'events', filter: `venue_id=eq.${venueId}` },
        (payload) => {
          setEvents(prev => [...prev, payload.new as EventItem]);
        }
      )
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'events', filter: `venue_id=eq.${venueId}` },
        (payload) => {
          setEvents(prev => prev.map(ev => ev.id === (payload.new as EventItem).id ? payload.new as EventItem : ev));
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel) };
  }, [venueId]);

  const handleJoin = async (eventId: string) => {
    // Optimistic update
    setEvents(prev => prev.map(ev => ev.id === eventId ? { ...ev, current_participants: ev.current_participants + 1 } : ev));
    
    const { error } = await supabase.rpc('join_event', { event_id: eventId });
    if (error) {
      // Simple fallback: just increment via update
      const ev = events.find(e => e.id === eventId);
      if (ev) {
        await supabase.from('events').update({ current_participants: ev.current_participants + 1 }).eq('id', eventId);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {loading ? (
        <div className="flex items-center justify-center py-8">
          <div className="w-6 h-6 border-2 border-brand-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="text-center py-8">
          <Calendar className="w-10 h-10 text-slate-600 mx-auto mb-3" />
          <p className="text-slate-500 text-sm">Aucun événement en cours.</p>
          <p className="text-slate-600 text-xs mt-1">Soyez le premier à en créer un !</p>
        </div>
      ) : (
        events.map(ev => {
          const isFull = ev.current_participants >= ev.max_participants;
          const isCreator = ev.creator_id === userId;
          return (
            <div key={ev.id} className="glass p-4 rounded-2xl flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isFull ? 'bg-red-500/20' : 'bg-brand-500/20'}`}>
                  <Calendar className={`w-6 h-6 ${isFull ? 'text-red-400' : 'text-brand-400'}`} />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-white">{ev.title}</h3>
                  <p className="text-xs text-slate-400">
                    {formatCountdown(ev.start_time)} • {ev.current_participants}/{ev.max_participants} inscrits
                  </p>
                </div>
              </div>
              {!isCreator && !isFull && (
                <button 
                  onClick={() => handleJoin(ev.id)}
                  className="bg-vibe-accent hover:bg-vibe-accent/80 text-white text-xs font-semibold py-1.5 px-3 rounded-lg transition-all active:scale-95"
                >
                  Rejoindre
                </button>
              )}
              {isFull && <span className="text-xs text-red-400 font-medium">Complet</span>}
              {isCreator && !isFull && <span className="text-xs text-brand-400 font-medium">Votre event</span>}
            </div>
          );
        })
      )}

      {writePermission && (
        <Link href={`/event/create?venue_id=${venueId}&slug=${venueSlug}`} className="mt-2 border-2 border-dashed border-vibe-border hover:border-brand-500 hover:bg-brand-500/10 transition-all rounded-2xl p-4 flex flex-col items-center justify-center text-center gap-2 group cursor-pointer">
           <div className="bg-vibe-dark p-2 rounded-full group-hover:bg-brand-500 group-hover:text-white transition-colors text-slate-400">
              <Plus className="w-5 h-5" />
           </div>
           <p className="text-sm font-medium text-slate-300">Créer un événement Flash</p>
        </Link>
      )}
    </div>
  );
}
