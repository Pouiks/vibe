-- Migration étape 6 : photo de lieu (fiabilisation visuelle d'un spot).
-- À exécuter dans le Supabase SQL Editor. Idempotente.
--
--   1. venues.photo_url + vue venues_with_coords mise à jour
--   2. Bucket public 'venue-photos' : lecture publique, écriture admin-only

BEGIN;

ALTER TABLE public.venues ADD COLUMN IF NOT EXISTS photo_url text;

-- La vue expose explicitement ses colonnes : on la recrée avec photo_url.
DROP VIEW IF EXISTS public.venues_with_coords;
CREATE VIEW public.venues_with_coords AS
SELECT
  id, slug, name, category, city_slug, neighborhood,
  scans_count, last_activity_at, owner_id, created_at, photo_url,
  tiger.ST_Y(location::tiger.geometry) AS lat,
  tiger.ST_X(location::tiger.geometry) AS lng
FROM public.venues;

COMMIT;

-- ── Bucket de photos (public en lecture, admin-only en écriture) ─────────

INSERT INTO storage.buckets (id, name, public)
VALUES ('venue-photos', 'venue-photos', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Admins can upload venue photos" ON storage.objects;
CREATE POLICY "Admins can upload venue photos" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'venue-photos'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

DROP POLICY IF EXISTS "Admins can update venue photos" ON storage.objects;
CREATE POLICY "Admins can update venue photos" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'venue-photos'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

DROP POLICY IF EXISTS "Admins can delete venue photos" ON storage.objects;
CREATE POLICY "Admins can delete venue photos" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'venue-photos'
    AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );
