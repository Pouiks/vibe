import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createHash, timingSafeEqual } from 'node:crypto';
import { sendPushToUsers } from '@/core/push/sendVenuePush';
import { formatCountdown } from '@/core/datetime';

const REMINDER_WINDOW_MS = 15 * 60_000; // rappel quand l'event commence dans <15 min

function secretMatches(supplied: string, expected: string): boolean {
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured');
  }
  return createClient(url, serviceKey, { auth: { persistSession: false } });
}

// Appelée par pg_cron (Supabase) toutes les 5 min avec le header x-cron-secret.
export async function POST(req: Request) {
  try {
    const expected = process.env.CRON_SECRET;
    if (!expected) {
      return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 503 });
    }
    const supplied = req.headers.get('x-cron-secret');
    if (!supplied || !secretMatches(supplied, expected)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = getAdminSupabase();
    const nowIso = new Date().toISOString();
    const windowEnd = new Date(Date.now() + REMINDER_WINDOW_MS).toISOString();

    const { data: due } = await admin
      .from('events')
      .select('id, title, start_time, venues:venue_id(name, slug)')
      .is('reminded_at', null)
      .gt('start_time', nowIso)
      .lte('start_time', windowEnd);

    if (!due || due.length === 0) {
      return NextResponse.json({ due: 0, sent: 0 });
    }

    let sent = 0;
    for (const event of due) {
      // Claim atomique : un seul tick de cron rappelle un event donné.
      const { data: claimed } = await admin
        .from('events')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', event.id)
        .is('reminded_at', null)
        .select('id');

      if (!claimed || claimed.length === 0) continue;

      const { data: participants } = await admin
        .from('event_participants')
        .select('user_id')
        .eq('event_id', event.id);

      const venue = Array.isArray(event.venues) ? event.venues[0] : event.venues;
      const result = await sendPushToUsers(admin, {
        userIds: (participants || []).map(p => p.user_id),
        title: `⏰ ${event.title}`,
        body: `Ça commence bientôt (${formatCountdown(event.start_time)}) à ${venue?.name || 'ton spot'}.`,
        url: `/l/${venue?.slug || ''}?tab=events`,
      });
      sent += result.sent;
    }

    return NextResponse.json({ due: due.length, sent });
  } catch (err) {
    console.error('Reminders error:', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
