"use client";
import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

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

export function useRealtimeChat(venueId: string) {
  const user = useVibeStore((state) => state.user);
  const writePermission = useVibeStore((state) => state.writePermission);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [onlineCount, setOnlineCount] = useState(0);
  const [onSiteCount, setOnSiteCount] = useState(0);
  const channelRef = useRef<any>(null);

  // Fetch initial messages
  useEffect(() => {
    if (!venueId || !venueId.includes('-')) return;
    
    let isMounted = true;
    
    const fetchMessages = async () => {
      // 1. Fetch messages (24h retention)
      const { data: messagesData, error } = await supabase
        .from('messages')
        .select(`
          id, content, created_at, user_id, is_on_site,
          profiles:user_id(username)
        `)
        .eq('venue_id', venueId)
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
        .order('created_at', { ascending: true })
        .limit(100);
        
      if (messagesData && isMounted) {
        // 2. Fetch reactions separately to avoid relation cache errors
        const messageIds = messagesData.map((m: any) => m.id);
        const { data: reactionsData } = messageIds.length > 0 
           ? await supabase.from('message_reactions').select('*').in('message_id', messageIds)
           : { data: [] };

        setMessages(messagesData.map((m: any) => ({
          id: m.id,
          content: m.content,
          created_at: m.created_at,
          user_id: m.user_id,
          username: m.profiles?.username || 'Utilisateur Anonyme',
          isOnSite: !!m.is_on_site,
          reactions: reactionsData?.filter(r => r.message_id === m.id).map(r => ({ type: r.reaction_type, userId: r.user_id })) || []
        })));
      }
      if (isMounted) setLoading(false);
    };

    fetchMessages();

    // Subscribe to realtime
    const channel = supabase
      .channel(`public:messages:venue_id=eq.${venueId}`, {
        config: { presence: { key: user?.id || `anon-${Math.random()}` } }
      });
      
    channelRef.current = channel;

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        let total = 0;
        let onSite = 0;
        for (const id in state) { 
           const tabs = state[id] as any[];
           total++;
           if (tabs.some(t => t.is_present)) onSite++;
        }
        if (isMounted) {
          setOnlineCount(total);
          setOnSiteCount(onSite);
        }
      })
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
          
          let username = 'Nouveau Vibe';
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
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ is_present: useVibeStore.getState().writePermission, online_at: new Date().toISOString() });
        }
      });

    return () => {
      isMounted = false;
      supabase.removeChannel(channel);
      channelRef.current = null;
    };
  }, [venueId, user?.id]);

  useEffect(() => {
     if (channelRef.current && channelRef.current.state === 'joined') {
        channelRef.current.track({ is_present: writePermission, online_at: new Date().toISOString() });
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
      user_id: user.id,
      content: content,
      is_on_site: writePermission
    }).select('id, venue_id, content, user_id').single();

    if (error || !inserted) {
      console.error('Error sending message:', error);
      setMessages((prev) => prev.filter(m => m.id !== tempId));
      return false;
    }

    fetch('/api/webhooks/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ record: inserted }),
    }).catch(() => {});

    return true;
  }, [venueId, user, writePermission]);

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

  return { messages, loading, onlineCount, onSiteCount, sendMessage, toggleReaction };
}
