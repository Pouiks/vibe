import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY!
);

webpush.setVapidDetails(
  'mailto:contact@vibe.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: NextRequest) {
  try {
    const { event_id } = await request.json();
    if (!event_id) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    }

    // 1. Fetch event details + venue info
    const { data: event, error: eventError } = await supabaseAdmin
      .from('events')
      .select(`
        id, title, start_time, max_participants, creator_id,
        venues:venue_id(id, name, slug)
      `)
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      console.error('Event fetch error:', eventError);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }

    const venue = (event as any).venues;
    const venueName = venue?.name || 'un lieu';
    const venueSlug = venue?.slug || '';
    const venueId = venue?.id;

    // 2. Format time
    const startTime = new Date(event.start_time);
    const diffMs = startTime.getTime() - Date.now();
    const diffMin = Math.max(0, Math.floor(diffMs / 60000));
    let timeLabel: string;
    if (diffMin <= 0) timeLabel = 'Maintenant !';
    else if (diffMin < 60) timeLabel = `Dans ${diffMin} min`;
    else timeLabel = `Dans ${Math.floor(diffMin / 60)}h${(diffMin % 60) > 0 ? String(diffMin % 60).padStart(2, '0') : ''}`;

    // 3. Get all members of the venue (channel_subscriptions), except the creator
    const { data: subscribers } = await supabaseAdmin
      .from('channel_subscriptions')
      .select('user_id')
      .eq('venue_id', venueId)
      .neq('user_id', event.creator_id);

    if (!subscribers || subscribers.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No subscribers' });
    }

    const userIds = subscribers.map(s => s.user_id);

    // 4. Get their push subscriptions
    const { data: pushSubs } = await supabaseAdmin
      .from('push_subscriptions')
      .select('endpoint, auth, p256dh')
      .in('user_id', userIds);

    if (!pushSubs || pushSubs.length === 0) {
      return NextResponse.json({ sent: 0, message: 'No push subscriptions' });
    }

    // 5. Build the notification payload
    const payload = JSON.stringify({
      title: `Nouvel évent à ${venueName} !`,
      body: `🔥 ${event.title} — ${timeLabel} (${event.max_participants} places)`,
      data: {
        url: `/l/${venueSlug}?tab=events`
      }
    });

    // 6. Send push notifications in parallel
    const results = await Promise.allSettled(
      pushSubs.map(sub =>
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { auth: sub.auth, p256dh: sub.p256dh } },
          payload
        )
      )
    );

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;

    // Clean up expired/invalid subscriptions
    const failedSubs = results
      .map((r, i) => r.status === 'rejected' ? pushSubs[i].endpoint : null)
      .filter(Boolean);

    if (failedSubs.length > 0) {
      await supabaseAdmin
        .from('push_subscriptions')
        .delete()
        .in('endpoint', failedSubs);
    }

    return NextResponse.json({ sent, failed, total: pushSubs.length });
  } catch (err) {
    console.error('Notify error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
