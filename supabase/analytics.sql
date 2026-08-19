-- Migration étape 5 : analytics interne (entonnoir du scan), sans traceur tiers.
-- À exécuter dans le Supabase SQL Editor APRÈS rgpd_purge.sql. Idempotente.
--
--   1. Table analytics_events : write-only côté client (aucune policy SELECT),
--      deux événements seulement : qr_visit (page ouverte via QR, même sans
--      compte) et scan_success (adhésion validée par join_spot).
--   2. RPC admin_venue_stats() : l'entonnoir par lieu, réservé aux admins.
--   3. Purge à 12 mois (alignée sur /confidentialite).

BEGIN;

-- ── 1. Table d'événements ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.analytics_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type text NOT NULL CHECK (event_type IN ('qr_visit', 'scan_success')),
  venue_id uuid REFERENCES public.venues(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  anon_id text CHECK (char_length(anon_id) <= 64),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_analytics_venue_type_date
  ON public.analytics_events(venue_id, event_type, created_at);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Écriture ouverte (y compris anonyme : le scan d'une affiche précède le
-- compte), lecture interdite aux clients - seuls la RPC admin et la clé
-- service lisent.
DROP POLICY IF EXISTS "Anyone can log analytics" ON public.analytics_events;
CREATE POLICY "Anyone can log analytics" ON public.analytics_events
  FOR INSERT WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- ── 2. Entonnoir par lieu, admin uniquement ──────────────────────────────

CREATE OR REPLACE FUNCTION public.admin_venue_stats()
RETURNS TABLE(
  venue_id uuid,
  name text,
  slug text,
  qr_visits_30d bigint,
  scans_30d bigint,
  members bigint,
  active_users_7d bigint,
  messages_7d bigint,
  events_30d bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    v.id,
    v.name,
    v.slug,
    (SELECT count(*) FROM public.analytics_events a
      WHERE a.venue_id = v.id AND a.event_type = 'qr_visit'
      AND a.created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.analytics_events a
      WHERE a.venue_id = v.id AND a.event_type = 'scan_success'
      AND a.created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.channel_subscriptions cs WHERE cs.venue_id = v.id),
    (SELECT count(DISTINCT m.user_id) FROM public.messages m
      WHERE m.venue_id = v.id AND m.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.messages m
      WHERE m.venue_id = v.id AND m.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.events e
      WHERE e.venue_id = v.id AND e.created_at > now() - interval '30 days')
  FROM public.venues v
  ORDER BY v.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_venue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_venue_stats() TO authenticated;

COMMIT;

-- ── 3. Purge mensuelle à 12 mois ─────────────────────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('vibe-purge-analytics');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vibe-purge-analytics',
  '25 4 1 * *',
  $$ DELETE FROM public.analytics_events WHERE created_at < now() - interval '12 months' $$
);
