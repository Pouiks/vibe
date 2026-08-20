-- ── Stats : visiteurs uniques vs visites ─────────────────────────────────
-- L'identifiant anonyme (localStorage vibe_anon_id) est déjà envoyé avec
-- chaque événement : on expose le compte de visiteurs distincts en plus du
-- total de visites. Signature de la RPC modifiée → DROP puis CREATE.
-- À exécuter dans le SQL Editor Supabase.

DROP FUNCTION IF EXISTS public.admin_venue_stats();

CREATE FUNCTION public.admin_venue_stats()
RETURNS TABLE(
  venue_id uuid,
  name text,
  slug text,
  qr_visits_30d bigint,
  qr_visitors_30d bigint,
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
    (SELECT count(DISTINCT a.anon_id) FROM public.analytics_events a
      WHERE a.venue_id = v.id AND a.event_type = 'qr_visit'
      AND a.anon_id IS NOT NULL AND a.anon_id <> 'unknown'
      AND a.created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.analytics_events a
      WHERE a.venue_id = v.id AND a.event_type = 'scan_success'
      AND a.created_at > now() - interval '30 days'),
    (SELECT count(*) FROM public.channel_subscriptions cs WHERE cs.venue_id = v.id),
    (SELECT count(DISTINCT m.user_id) FROM public.messages m
      WHERE m.venue_id = v.id AND m.event_id IS NULL
      AND m.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.messages m
      WHERE m.venue_id = v.id AND m.event_id IS NULL
      AND m.created_at > now() - interval '7 days'),
    (SELECT count(*) FROM public.events e
      WHERE e.venue_id = v.id AND e.created_at > now() - interval '30 days')
  FROM public.venues v
  ORDER BY v.name;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_venue_stats() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_venue_stats() TO authenticated;
