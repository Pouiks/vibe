import webpush from 'web-push';
import type { SupabaseClient } from '@supabase/supabase-js';

if (process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    'https://atoute.app',
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const NOTIF_COOLDOWN_MS = 30_000; // per-user per-venue anti-spam cooldown

export interface PushResult {
  sent: number;
  skipped: number;
  message?: string;
}

// Sends a push to every endpoint of the given users and cleans up dead
// endpoints (404/410). No cooldown here - callers decide the eligibility.
// Règle produit : la cloche d'un spot (muted) coupe le chat du spot, mais
// une participation explicite à un event (chat d'event, rappel) prime sur
// la cloche - ces envois ciblés passent donc sans filtre muted.
export async function sendPushToUsers(
  admin: SupabaseClient,
  opts: { userIds: string[]; title: string; body: string; url: string }
): Promise<{ sent: number }> {
  if (opts.userIds.length === 0) return { sent: 0 };

  const { data: pushSubs } = await admin
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth, user_id')
    .in('user_id', opts.userIds);

  if (!pushSubs || pushSubs.length === 0) return { sent: 0 };

  const payload = JSON.stringify({
    title: opts.title,
    body: opts.body,
    data: { url: opts.url },
  });

  // sent = envois réellement acceptés par le service push, pas tentés
  let sent = 0;
  await Promise.all(pushSubs.map(async (sub) => {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      );
      sent++;
    } catch (err) {
      const statusCode = (err as { statusCode?: number }).statusCode;
      if (statusCode === 404 || statusCode === 410) {
        await admin.from('push_subscriptions').delete().eq('endpoint', sub.endpoint);
      }
    }
  }));

  return { sent };
}

// Notifies every eligible subscriber of a venue (not muted, outside the 30 s
// cooldown, never the actor), then stamps last_notified_at so the cooldown
// applies to the next send.
export async function sendVenuePush(
  admin: SupabaseClient,
  opts: {
    venueId: string;
    excludeUserId: string;
    title: string;
    body: string;
    url: string;
  }
): Promise<PushResult> {
  const { data: subscribers } = await admin
    .from('channel_subscriptions')
    .select('user_id, muted, last_notified_at')
    .eq('venue_id', opts.venueId)
    .neq('user_id', opts.excludeUserId);

  if (!subscribers || subscribers.length === 0) {
    return { sent: 0, skipped: 0, message: 'No subscribers' };
  }

  const now = Date.now();
  const eligibleUserIds = subscribers
    .filter(s => {
      if (s.muted) return false;
      if (s.last_notified_at && now - new Date(s.last_notified_at).getTime() < NOTIF_COOLDOWN_MS) return false;
      return true;
    })
    .map(s => s.user_id);

  if (eligibleUserIds.length === 0) {
    return { sent: 0, skipped: subscribers.length, message: 'All subscribers muted or in cooldown' };
  }

  const { sent } = await sendPushToUsers(admin, {
    userIds: eligibleUserIds,
    title: opts.title,
    body: opts.body,
    url: opts.url,
  });

  // Le cooldown est stampé dès qu'une tentative a eu lieu : un service push
  // en panne (sent=0 avec endpoints présents) ne doit pas désarmer
  // l'anti-spam et provoquer une rafale au rétablissement.
  await admin
    .from('channel_subscriptions')
    .update({ last_notified_at: new Date().toISOString() })
    .eq('venue_id', opts.venueId)
    .in('user_id', eligibleUserIds);

  if (sent === 0) {
    return { sent: 0, skipped: subscribers.length - eligibleUserIds.length, message: 'No deliveries (missing endpoints or push service errors)' };
  }

  return { sent, skipped: subscribers.length - eligibleUserIds.length };
}
