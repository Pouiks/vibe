import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/core/supabase/server';
import { sendVenuePush } from '@/core/push/sendVenuePush';
import { formatEventTiming } from '@/core/datetime';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

export async function POST(request: NextRequest) {
  try {
    // Only the authenticated creator of the event may trigger its notification.
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { event_id } = await request.json();
    if (!event_id) {
      return NextResponse.json({ error: 'Missing event_id' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const { data: event, error: eventError } = await admin
      .from('events')
      .select(`
        id, title, start_time, max_participants, creator_id, notified_at,
        venues:venue_id(id, name, slug)
      `)
      .eq('id', event_id)
      .single();

    if (eventError || !event) {
      console.error('Event fetch error:', eventError);
      return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    }
    if (event.creator_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Atomic claim: only the first caller passes, replays get sent: 0.
    // notified_at is not client-updatable (column grant), so the claim
    // cannot be reset from the browser.
    const { data: claimed } = await admin
      .from('events')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', event_id)
      .is('notified_at', null)
      .select('id');

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ sent: 0, message: 'Already notified' });
    }

    const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
    const venueName = venue?.name || 'un lieu';
    const venueSlug = venue?.slug || '';
    const venueId = venue?.id;

    const timeLabel = formatEventTiming(event.start_time);

    const result = await sendVenuePush(admin, {
      venueId,
      excludeUserId: event.creator_id,
      title: `🔥 Nouvel évent à ${venueName}`,
      body: `${event.title} · ${timeLabel} (${event.max_participants} places)`,
      url: `/l/${venueSlug}?tab=events`,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error('Notify error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
