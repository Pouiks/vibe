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

const NOTIF_COOLDOWN_MS = 30_000; // 30 seconds anti-spam cooldown per user per venue

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

    // Fetch subscribers with mute + cooldown info, exclude sender
    const { data: subscribers } = await admin
      .from('channel_subscriptions')
      .select('user_id, muted, last_notified_at')
      .eq('venue_id', payload.venue_id)
      .neq('user_id', payload.user_id);

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ success: true, message: 'No subscribers' });
    }

    const now = Date.now();
    const eligibleUserIds = subscribers
      .filter(s => {
        if (s.muted) return false;
        if (s.last_notified_at) {
          const elapsed = now - new Date(s.last_notified_at).getTime();
          if (elapsed < NOTIF_COOLDOWN_MS) return false;
        }
        return true;
      })
      .map(s => s.user_id);

    if (eligibleUserIds.length === 0) {
      return NextResponse.json({ success: true, message: 'All subscribers muted or in cooldown' });
    }

    const { data: pushSettings } = await admin
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .in('user_id', eligibleUserIds);

    if (!pushSettings || pushSettings.length === 0) {
      return NextResponse.json({ success: true, message: 'No push endpoints' });
    }

    const notificationPayload = JSON.stringify({
      title: `💬 ${venueName}`,
      body: payload.content,
      data: { url: `/l/${venueSlug}` }
    });

    const pushPromises = pushSettings.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          notificationPayload
        );
      } catch (err: any) {
        if (err.statusCode === 404 || err.statusCode === 410) {
          await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
        }
      }
    });

    await Promise.all(pushPromises);

    // Update last_notified_at for all notified users (batch cooldown)
    const notifiedUserIds = [...new Set(pushSettings.map(s => s.user_id))];
    await admin
      .from('channel_subscriptions')
      .update({ last_notified_at: new Date().toISOString() })
      .eq('venue_id', payload.venue_id)
      .in('user_id', notifiedUserIds);

    return NextResponse.json({ success: true, sent: pushSettings.length, skipped: subscribers.length - eligibleUserIds.length });
  } catch (error: any) {
    console.error('Webhook error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
