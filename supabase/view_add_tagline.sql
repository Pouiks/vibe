-- La vue venues_with_coords expose ses colonnes explicitement : elle doit
-- être recréée pour inclure tagline (sinon toute lecture client de
-- l'accroche échoue — ex. liste des lieux de l'admin). Idempotente.
-- À exécuter dans le SQL Editor Supabase, après add_venue_tagline.sql.

DROP VIEW IF EXISTS public.venues_with_coords;
CREATE VIEW public.venues_with_coords AS
SELECT
  id, slug, name, category, city_slug, neighborhood,
  scans_count, last_activity_at, owner_id, created_at, photo_url, tagline,
  tiger.ST_Y(location::tiger.geometry) AS lat,
  tiger.ST_X(location::tiger.geometry) AS lng
FROM public.venues;
