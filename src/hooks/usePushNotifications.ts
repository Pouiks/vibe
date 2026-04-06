"use client";
import { useState, useEffect } from 'react';
import { supabase } from '@/core/supabase/client';
import { useVibeStore } from '@/core/store/useVibeStore';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export function usePushNotifications() {
  const user = useVibeStore((state) => state.user);
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      setIsSupported(true);
      navigator.serviceWorker.register('/sw.js').catch(err => {
         console.error('Service Worker registration failed:', err);
      });
    }
  }, []);

  const subscribeToPush = async () => {
    if (!isSupported || !user) return false;

    try {
      const registration = await navigator.serviceWorker.ready;
      
      const vapidPublicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidPublicKey) {
        console.error("VAPID public key not found in environment");
        return false;
      }
      const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey
      });

      const subJSON = subscription.toJSON();

      const { error } = await supabase.from('push_subscriptions').upsert({
        user_id: user.id,
        endpoint: subJSON.endpoint,
        auth: subJSON.keys?.auth,
        p256dh: subJSON.keys?.p256dh,
      }, { onConflict: 'endpoint' });

      if (error) throw error;

      setIsSubscribed(true);
      return true;
    } catch (err) {
      console.error('Failed to subscribe to push notifications', err);
      return false;
    }
  };

  const unsubscribeFromPush = async () => {
    if (!isSupported || !user) return false;
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', subscription.endpoint);
        await subscription.unsubscribe();
      }
      setIsSubscribed(false);
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const toggleVenueSubscription = async (venue_id: string, isFollowing: boolean) => {
    if (!user) return false;
    
    if (isFollowing) {
      const globalSub = await subscribeToPush();
      if (!globalSub) return false;
    }

    try {
      if (isFollowing) {
        await supabase.from('channel_subscriptions').upsert({
          user_id: user.id,
          venue_id: venue_id
        });
      } else {
        await supabase.from('channel_subscriptions')
          .delete()
          .eq('user_id', user.id)
          .eq('venue_id', venue_id);
      }
      return true;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  /** Toggle mute on a venue subscription (keeps subscription, just silences push) */
  const toggleMute = async (venueId: string, muted: boolean): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('channel_subscriptions')
        .update({ muted })
        .eq('user_id', user.id)
        .eq('venue_id', venueId);
      if (error) throw error;
      return true;
    } catch (e) {
      console.error('toggleMute error', e);
      return false;
    }
  };

  return { 
    isSupported, 
    isSubscribed, 
    subscribeToPush, 
    unsubscribeFromPush,
    toggleVenueSubscription,
    toggleMute
  };
}
