import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/core/supabase/server';
import { sendPushToUsers, sendVenuePush } from '@/core/push/sendVenuePush';

const MAX_MESSAGE_AGE_MS = 2 * 60_000; // only freshly sent messages may trigger a push

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
    // Only the authenticated author of a fresh message may trigger its push.
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { message_id } = await req.json();
    if (!message_id) {
      return NextResponse.json({ error: 'Missing message_id' }, { status: 400 });
    }

    const admin = getAdminSupabase();
    const { data: message } = await admin
      .from('messages')
      .select('id, venue_id, event_id, content, user_id, created_at')
      .eq('id', message_id)
      .single();

    if (!message) {
      return NextResponse.json({ error: 'Message not found' }, { status: 404 });
    }
    if (message.user_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (Date.now() - new Date(message.created_at).getTime() > MAX_MESSAGE_AGE_MS) {
      return NextResponse.json({ success: true, sent: 0, message: 'Message too old, skipped' });
    }

    // Atomic claim: a given message notifies at most once, even under
    // concurrent replays of the same message_id.
    const { data: claimed } = await admin
      .from('messages')
      .update({ notified_at: new Date().toISOString() })
      .eq('id', message_id)
      .is('notified_at', null)
      .select('id');

    if (!claimed || claimed.length === 0) {
      return NextResponse.json({ success: true, sent: 0, message: 'Already notified' });
    }

    const { data: venue } = await admin
      .from('venues')
      .select('slug, name')
      .eq('id', message.venue_id)
      .single();

    // Message du chat d'un event : seuls ses participants sont notifiés.
    if (message.event_id) {
      const { data: event } = await admin
        .from('events')
        .select('title')
        .eq('id', message.event_id)
        .single();

      const { data: participants } = await admin
        .from('event_participants')
        .select('user_id')
        .eq('event_id', message.event_id)
        .neq('user_id', message.user_id);

      // Participation explicite à l'event : ces messages passent même si la
      // cloche du spot est coupée (règle affichée dans le profil).
      const result = await sendPushToUsers(admin, {
        userIds: (participants || []).map(p => p.user_id),
        title: `💬 ${event?.title || 'Event'} · ${venue?.name || 'un spot'}`,
        body: message.content,
        url: `/l/${venue?.slug || ''}?tab=events`,
      });

      return NextResponse.json({ success: true, ...result });
    }

    const result = await sendVenuePush(admin, {
      venueId: message.venue_id,
      excludeUserId: message.user_id,
      title: `💬 ${venue?.name || 'un lieu'}`,
      body: message.content,
      url: `/l/${venue?.slug || ''}`,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    console.error('Webhook error:', error);
    const message = error instanceof Error ? error.message : 'Internal error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
