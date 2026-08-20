"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ANON_PRESENCE_KEY = 'vibe_anon_presence_key';

// One person = one presence key; a person is "sur place" if at least one of
// their tabs is GPS-verified within the geofence.
export function countPresence(state: Record<string, { is_present?: boolean }[]>): { online: number; onSite: number } {
  let online = 0;
  let onSite = 0;
  for (const key in state) {
    online++;
    if (state[key].some(t => t.is_present)) onSite++;
  }
  return { online, onSite };
}

// One stable presence key per person: user id when logged in, otherwise a
// per-browser key so several tabs (or remounts) never count as several people.
export function getPresenceKey(userId?: string): string {
  if (userId) return userId;
  try {
    let key = localStorage.getItem(ANON_PRESENCE_KEY);
    if (!key) {
      key = `anon-${crypto.randomUUID()}`;
      localStorage.setItem(ANON_PRESENCE_KEY, key);
    }
    return key;
  } catch {
    return `anon-${Math.random()}`;
  }
}

export interface ChatMessage {
  id: string;
  user_id: string;
  username: string;
  content: string;
  created_at: string;
  isOptimistic?: boolean;
  isOnSite?: boolean;
  reactions: { type: string; userId: string }[];
}

// eventId = null → chat général du lieu ; sinon → chat dédié de l'event.
export function useRealtimeChat(venueId: string, eventId: string | null = null) {
  const user = useVibeStore((state) => state.user);
  const writePermission = useVibeStore((state) => state.writePermission);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);
  const [onSiteCount, setOnSiteCount] = useState(0);
  // False until the first presence sync: counts are unknown, not zero
  const [presenceSynced, setPresenceSynced] = useState(false);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Fetch initial messages - only when we have a real UUID (not a slug)
  useEffect(() => {
    if (!venueId || !UUID_RE.test(venueId)) return;
    
    let isMounted = true;
    
    const fetchMessages = async () => {
      // 1. Fetch messages (24h retention pour le chat du lieu ; le chat d'un
      // event garde tout son historique)
      let query = supabase
        .from('messages')
        .select(`
          id, content, created_at, user_id, is_on_site,
          profiles:user_id(username)
        `)
        .eq('venue_id', venueId);
      query = eventId
        ? query.eq('event_id', eventId)
        : query.is('event_id', null).gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
      const { data: messagesData } = await query
        .order('created_at', { ascending: true })
        .limit(100);
        
      if (messagesData && isMounted) {
        interface MessageRow {
          id: string; content: string; created_at: string; user_id: string;
          is_on_site: boolean | null;
          profiles: { username: string } | { username: string }[] | null;
        }
        const rows = messagesData as unknown as MessageRow[];

        // 2. Fetch reactions separately to avoid relation cache errors
        const messageIds = rows.map(m => m.id);
        const { data: reactionsData } = messageIds.length > 0
           ? await supabase.from('message_reactions').select('*').in('message_id', messageIds)
           : { data: [] };

        setMessages(rows.map(m => {
          const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
          return {
            id: m.id,
            content: m.content,
            created_at: m.created_at,
            user_id: m.user_id,
            username: profile?.username || 'Utilisateur Anonyme',
            isOnSite: !!m.is_on_site,
            reactions: reactionsData?.filter(r => r.message_id === m.id).map(r => ({ type: r.reaction_type, userId: r.user_id })) || []
          };
        }));
      }
      if (isMounted) setLoading(false);
    };

    fetchMessages();

    // Subscribe to realtime (messages only; presence lives on its own
    // venue-wide channel so the counts don't change when opening an event chat)
    const channel = supabase
      .channel(`public:messages:venue_id=eq.${venueId}${eventId ? `:event=${eventId}` : ''}`);

    channel
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `venue_id=eq.${venueId}`
        },
        async (payload) => {
          // If we inserted it ourselves optimistically, it might have the same content/user, but let's just fetch the profile to be sure
          const newMessage = payload.new;

          // Le filtre realtime est par venue : on route côté client entre le
          // chat du lieu (event_id null) et le chat d'un event.
          if ((newMessage.event_id ?? null) !== (eventId ?? null)) return;

          let username = 'Membre ATOUTE';
          if (newMessage.user_id) {
            const { data } = await supabase.from('profiles').select('username').eq('id', newMessage.user_id).single();
            if (data) username = data.username;
          }

          setMessages((prev) => {
            // Remove optimistic message if present (we can identify by a temporary ID, but simpler is to just append if not from ourselves or let optimistic handle it via IDs)
            // For MVP, we just append from server and rely on ID uniqueness if possible. 
            // In a real app we'd use a unique constraint or uuid matching.
            if (prev.find(m => m.isOptimistic && m.content === newMessage.content)) {
               return prev.map(m => m.isOptimistic && m.content === newMessage.content ? { ...m, id: newMessage.id, isOptimistic: false } : m);
            }
            return [...prev, {
              id: newMessage.id,
              user_id: newMessage.user_id,
              content: newMessage.content,
              created_at: newMessage.created_at,
              username,
              isOnSite: !!newMessage.is_on_site,
              reactions: []
            }];
          });
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'message_reactions'
        },
        (payload) => {
          setMessages(prev => {
            if (payload.eventType === 'INSERT') {
              return prev.map(m => {
                if (m.id === payload.new.message_id) {
                  // Messenger-style en temps réel : on efface toute autre réaction de cet utilisateur avant d'ajouter la nouvelle.
                  const cleanReactions = m.reactions.filter(r => r.userId !== payload.new.user_id);
                  const exists = m.reactions.some(r => r.type === payload.new.reaction_type && r.userId === payload.new.user_id);
                  if (!exists) {
                    return { ...m, reactions: [...cleanReactions, { type: payload.new.reaction_type, userId: payload.new.user_id }] };
                  }
                }
                return m;
              });
            } else if (payload.eventType === 'DELETE') {
              return prev.map(m => m.id === payload.old.message_id ? {
                  ...m,
                  reactions: m.reactions.filter(r => !(r.type === payload.old.reaction_type && r.userId === payload.old.user_id))
              } : m);
            }
            return prev;
          });
        }
      )
      .subscribe(function onStatus(status, err) {
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] channel error', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] subscription timed out, retrying…');
          channel.subscribe(onStatus);
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
    };
  }, [venueId, user?.id, eventId]);

  // Presence: one channel per venue, independent of which chat is open.
  // "en ligne" = people with this spot's page open right now (deduplicated);
  // "sur place" = those among them currently GPS-verified within the geofence.
  useEffect(() => {
    if (!venueId || !UUID_RE.test(venueId)) return;

    let isMounted = true;
    setPresenceSynced(false);

    const channel = supabase.channel(`presence:venue:${venueId}`, {
      config: { presence: { key: getPresenceKey(user?.id) } }
    });
    presenceChannelRef.current = channel;

    const track = () =>
      channel.track({ is_present: useVibeStore.getState().writePermission, online_at: new Date().toISOString() });

    channel
      .on('presence', { event: 'sync' }, () => {
        const { online, onSite } = countPresence(channel.presenceState());
        if (isMounted) {
          setOnlineCount(online);
          setOnSiteCount(onSite);
          setPresenceSynced(true);
        }
      })
      .subscribe(function onStatus(status, err) {
        if (status === 'SUBSCRIBED') {
          track();
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] presence channel error', err);
        } else if (status === 'TIMED_OUT') {
          console.warn('[Realtime] presence timed out, retrying…');
          channel.subscribe(onStatus);
        }
      });

    // Coming back from background: presence may have been dropped server-side
    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && channel.state === 'joined') track();
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      isMounted = false;
      document.removeEventListener('visibilitychange', handleVisibility);
      supabase.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [venueId, user?.id]);

  useEffect(() => {
     if (presenceChannelRef.current && presenceChannelRef.current.state === 'joined') {
        presenceChannelRef.current.track({ is_present: writePermission, online_at: new Date().toISOString() });
     }
  }, [writePermission]);

  const sendMessage = useCallback(async (content: string) => {
    if (!user) return false;
    if (!content.trim()) return false;

    // Optimistic UI
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: ChatMessage = {
      id: tempId,
      user_id: user.id,
      username: user.username,
      content,
      created_at: new Date().toISOString(),
      isOptimistic: true,
      isOnSite: writePermission,
      reactions: []
    };

    setMessages((prev) => [...prev, optimisticMessage]);

    // We proceed directly to database insert

    const { data: inserted, error } = await supabase.from('messages').insert({
      venue_id: venueId,
      event_id: eventId,
      user_id: user.id,
      content: content,
      is_on_site: writePermission
    }).select('id').single();

    if (error || !inserted) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      return false;
    }

    fetch('/api/webhooks/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message_id: inserted.id }),
    }).catch(() => {});

    return true;
  }, [venueId, eventId, user, writePermission]);

  const toggleReaction = useCallback(async (messageId: string, reactionType: string) => {
    if (!user) return;
    
    setMessages(prev => {
       const msg = prev.find(m => m.id === messageId);
       if (!msg) return prev;
       
       const myExistingReactions = msg.reactions.filter(r => r.userId === user.id);
       const exactMatch = myExistingReactions.find(r => r.type === reactionType);
       
       if (exactMatch) {
         // User clicked the same reaction -> Toggle OFF
         supabase.from('message_reactions').delete().match({ message_id: messageId, user_id: user.id, reaction_type: reactionType }).then();
         return prev.map(m => m.id === messageId ? { ...m, reactions: m.reactions.filter(r => !(r.type === reactionType && r.userId === user.id)) } : m);
       } else {
         // User clicked a new reaction. 
         // Messenger-style: We remove any OTHER reactions they might have put, and insert the new one.
         if (myExistingReactions.length > 0) {
            myExistingReactions.forEach(oldR => {
               supabase.from('message_reactions').delete().match({ message_id: messageId, user_id: user.id, reaction_type: oldR.type }).then();
            });
         }
         supabase.from('message_reactions').insert({ message_id: messageId, user_id: user.id, reaction_type: reactionType }).then();
         
         return prev.map(m => {
            if (m.id === messageId) {
               // Remove old ones from state, add new one
               const cleanReactions = m.reactions.filter(r => r.userId !== user.id);
               return { ...m, reactions: [...cleanReactions, { type: reactionType, userId: user.id }] };
            }
            return m;
         });
       }
    });
  }, [user]);

  return { messages, loading, onlineCount, onSiteCount, presenceSynced, sendMessage, toggleReaction };
}
