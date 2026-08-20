-- ── Carte véridique : scans_count = nombre de membres actuels ─────────────
-- Historiquement, scans_count ne faisait qu'augmenter (trigger INSERT sans
-- DELETE) : la heatmap et le compteur de la carte montraient un cumul
-- trompeur. Désormais : +1 à l'adhésion, -1 au départ, et resync one-shot.
-- À exécuter dans le SQL Editor Supabase.

CREATE OR REPLACE FUNCTION public.decrement_venue_scan_stats()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.venues
  SET scans_count = greatest(0, scans_count - 1)
  WHERE id = OLD.venue_id;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS on_venue_left ON public.channel_subscriptions;
CREATE TRIGGER on_venue_left
  AFTER DELETE ON public.channel_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.decrement_venue_scan_stats();

-- Resync : aligne le compteur sur la réalité actuelle
UPDATE public.venues v
SET scans_count = (
  SELECT count(*) FROM public.channel_subscriptions cs WHERE cs.venue_id = v.id
);
