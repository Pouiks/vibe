import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { createClient } from '@supabase/supabase-js';

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'mailto:contact@vibe.local',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(req: Request) {
  try {
    const admin = getAdminSupabase();
    const body = await req.json();
    const payload = body.record;
    
    if (!payload?.venue_id || !payload?.content || !payload?.user_id) {
       return NextResponse.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const { data: venue } = await admin
      .from('venues')
      .select('slug, name')
      .eq('id', payload.venue_id)
      .single();

    const venueSlug = venue?.slug || '';
    const venueName = venue?.name || 'un lieu';

    const { data: subscribers } = await admin
      .from('channel_subscriptions')
      .select('user_id')
      .eq('venue_id', payload.venue_id);

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ success: true, message: 'No subscribers' });
    }

    const otherSubscribers = subscribers
      .map(s => s.user_id)
      .filter(uid => uid !== payload.user_id);

    if (otherSubscribers.length === 0) {
      return NextResponse.json({ success: true, message: 'No other subscribers' });
    }

    const { data: pushSettings } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', otherSubscribers);

    if (!pushSettings || pushSettings.length === 0) {
      return NextResponse.json({ success: true, message: 'No push endpoints' });
    }

    const notificationPayload = JSON.stringify({
      title: `VIBE : ${venueName}`,
      body: payload.content,
      data: {
        url: `/l/${venueSlug}`
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
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
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
