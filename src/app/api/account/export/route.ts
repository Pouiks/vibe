import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createServerSupabase } from '@/core/supabase/server';

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// RGPD — droit à la portabilité : renvoie toutes les données de l'utilisateur
// connecté dans un JSON téléchargeable.
export async function GET() {
  try {
    const supabase = await createServerSupabase();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminSupabase();

    const [profile, subscriptions, messages, events, participations, pushEndpoints] = await Promise.all([
      admin.from('profiles').select('username, first_name, age, gender, bio, created_at').eq('id', user.id).single(),
      admin.from('channel_subscriptions').select('venue_id, muted, created_at, venues:venue_id(name, slug)').eq('user_id', user.id),
      admin.from('messages').select('content, created_at, venue_id, event_id, is_on_site').eq('user_id', user.id).order('created_at'),
      admin.from('events').select('title, description, start_time, duration_minutes, max_participants, created_at').eq('creator_id', user.id),
      admin.from('event_participants').select('event_id, created_at').eq('user_id', user.id),
      admin.from('push_subscriptions').select('endpoint, created_at').eq('user_id', user.id),
    ]);

    const payload = {
      export_date: new Date().toISOString(),
      account: { id: user.id, email: user.email, created_at: user.created_at },
      profile: profile.data,
      spots_rejoints: subscriptions.data ?? [],
      messages: messages.data ?? [],
      events_crees: events.data ?? [],
      participations: participations.data ?? [],
      appareils_notifications: pushEndpoints.data ?? [],
    };

    return new NextResponse(JSON.stringify(payload, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': 'attachment; filename="vibespot-mes-donnees.json"',
      },
    });
  } catch (error) {
    console.error('[account/export]', error);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
