import { supabase } from '@/core/supabase/client';

// Analytics interne, first-party, sans traceur tiers. Deux événements
// seulement : l'entonnoir du scan. Jamais bloquant pour l'UX.

const ANON_KEY = 'vibe_anon_id';

export type AnalyticsEvent = 'qr_visit' | 'scan_success';

export function getAnonId(): string {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return 'unknown';
  }
}

export function track(event: AnalyticsEvent, opts: { venueId?: string; userId?: string | null } = {}): void {
  try {
    void supabase.from('analytics_events').insert({
      event_type: event,
      venue_id: opts.venueId ?? null,
      user_id: opts.userId ?? null,
      anon_id: getAnonId(),
    }).then(({ error }) => {
      if (error) console.warn('[analytics]', error.message);
    });
  } catch {
    // l'analytics ne doit jamais casser l'app
  }
}
