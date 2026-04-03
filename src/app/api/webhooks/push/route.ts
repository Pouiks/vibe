import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { supabase } from '@/core/supabase/client';

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@vibe.local',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

// Called by Supabase Database Webhooks when a new message is inserted
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const payload = body.record; // Supabase payload format { type: 'INSERT', table: 'messages', record: { ... } }
    
    if (!payload?.venue_id || !payload?.content || !payload?.user_id) {
       return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // 1. Fetch channel subscribers for this venue
    // (Ligne locale commentée temporairement pour que vous puissiez tester tout seul et recevoir vos propres notifs !)
    const { data: subscribers } = await supabase
      .from('channel_subscriptions')
      .select('user_id')
      .eq('venue_id', payload.venue_id);
      // .neq('user_id', payload.user_id); // Exclut l'expéditeur en situation réelle

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ success: true, message: 'No subscribers' });
    }

    const subscriberIds = subscribers.map(s => s.user_id);

    // 2. Fetch push subscriptions endpoints for those users
    const { data: pushSettings } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', subscriberIds);

    if (!pushSettings || pushSettings.length === 0) {
      return NextResponse.json({ success: true, message: 'No push endpoints' });
    }

    // 3. Send Web Push
    const notificationPayload = JSON.stringify({
      title: 'VIBE : Nouveau Message',
      body: payload.content,
      data: {
        url: `/l/${payload.venue_id}` 
      }
    });

    const pushPromises = pushSettings.map(async (sub) => {
      const pushSubscription = {
        endpoint: sub.endpoint,
        keys: {
          p256dh: sub.p256dh,
          auth: sub.auth
        }
      };
      
      try {
        await webpush.sendNotification(pushSubscription, notificationPayload);
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          // Subscription has expired or is no longer valid, we clean it up
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    });

    await Promise.all(pushPromises);

    return NextResponse.json({ success: true, sent: pushSettings.length });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
