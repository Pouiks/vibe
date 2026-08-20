-- ── Correctifs de cohérence (audit 2026-08) ──────────────────────────────
-- À exécuter dans le SQL Editor Supabase, après les autres migrations.

-- 1. RGPD : la suppression de compte échouait pour tout propriétaire de lieu
-- (FK venues.owner_id sans ON DELETE). Le lieu survit, orphelin de son owner.
ALTER TABLE public.venues DROP CONSTRAINT IF EXISTS venues_owner_id_fkey;
ALTER TABLE public.venues
  ADD CONSTRAINT venues_owner_id_fkey
  FOREIGN KEY (owner_id) REFERENCES public.profiles(id) ON DELETE SET NULL;

-- 2. Stats admin : les messages des chats privés d'events étaient comptés
-- dans l'activité du lieu. "Messages (7 j)" et "Actifs 7 j" = chat du lieu
-- uniquement (event_id IS NULL), aligné sur la définition utilisée par le
-- front partout ailleurs.
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

-- 3. Quitter un spot retire les participations à ses events, quel que soit
-- le chemin (bouton profil, suppression de compte, admin) : l'accès au chat
-- d'event et ses notifications reposent sur event_participants, qui ne doit
-- pas survivre à l'adhésion. Le trigger de comptage décrémente au passage.
CREATE OR REPLACE FUNCTION public.purge_event_participations_on_leave()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.event_participants ep
  USING public.events e
  WHERE ep.event_id = e.id
    AND e.venue_id = OLD.venue_id
    AND ep.user_id = OLD.user_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_purge_event_participations_on_leave ON public.channel_subscriptions;
CREATE TRIGGER trg_purge_event_participations_on_leave
  AFTER DELETE ON public.channel_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.purge_event_participations_on_leave();
