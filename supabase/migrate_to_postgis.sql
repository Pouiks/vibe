-- =============================================================
-- MIGRATION: Base existante lat/lng -> PostGIS geography(POINT)
-- =============================================================
-- EXECUTER DANS LE SQL EDITOR DE SUPABASE
-- Copier-coller chaque bloc ETAPE par ETAPE dans l'ordre.
-- Si une etape echoue, corriger avant de passer a la suivante.
-- =============================================================


-- =====================
-- ETAPE 0 : PostGIS
-- =====================
-- Executer CE BLOC EN PREMIER, seul, avant tout le reste.
-- Sur Supabase, PostGIS peut etre installe dans le schema 'tiger' ou 'extensions'.
-- Cette ligne rend les types (geography) et fonctions (ST_*) accessibles.
SET search_path TO public, extensions, tiger;


-- =====================
-- ETAPE 1 : Nouvelles colonnes sur venues
-- =====================
ALTER TABLE public.venues
  ADD COLUMN IF NOT EXISTS city_slug text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS location geography(POINT),
  ADD COLUMN IF NOT EXISTS scans_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_activity_at timestamp with time zone DEFAULT now();


-- =====================
-- ETAPE 2 : Migrer lat/lng existants vers geography
-- =====================
UPDATE public.venues
SET location = ST_SetSRID(ST_MakePoint(lng::float, lat::float), 4326)::geography
WHERE lat IS NOT NULL AND lng IS NOT NULL AND location IS NULL;


-- =====================
-- ETAPE 3 : Backfill city_slug (temporaire, a corriger apres)
-- =====================
UPDATE public.venues SET city_slug = 'legacy' WHERE city_slug IS NULL;


-- =====================
-- ETAPE 4 : Supprimer les anciennes colonnes lat/lng
-- =====================
ALTER TABLE public.venues DROP COLUMN IF EXISTS lat;
ALTER TABLE public.venues DROP COLUMN IF EXISTS lng;


-- =====================
-- ETAPE 5 : Contraintes NOT NULL
-- =====================
ALTER TABLE public.venues ALTER COLUMN location SET NOT NULL;
ALTER TABLE public.venues ALTER COLUMN city_slug SET NOT NULL;


-- =====================
-- ETAPE 6 : Index GIST (spatial) et B-Tree (city)
-- =====================
CREATE INDEX IF NOT EXISTS idx_venues_location ON public.venues USING GIST(location);
CREATE INDEX IF NOT EXISTS idx_venues_city_slug ON public.venues(city_slug);


-- =====================
-- ETAPE 7 : Vue venues_with_coords (expose lat/lng pour le client)
-- =====================
CREATE OR REPLACE VIEW public.venues_with_coords AS
SELECT
  id, slug, name, category, city_slug, neighborhood,
  scans_count, last_activity_at, owner_id, created_at,
  ST_Y(location::geometry) AS lat,
  ST_X(location::geometry) AS lng
FROM public.venues;


-- =====================
-- ETAPE 8 : Trigger scan stats
-- =====================
CREATE OR REPLACE FUNCTION public.update_venue_scan_stats()
RETURNS trigger AS $$
BEGIN
  UPDATE public.venues
  SET scans_count = scans_count + 1,
      last_activity_at = now()
  WHERE id = NEW.venue_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_venue_scanned ON public.channel_subscriptions;
CREATE TRIGGER on_venue_scanned
  AFTER INSERT ON public.channel_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_venue_scan_stats();


-- =====================
-- ETAPE 9 : Fonction RPC get_venues_in_bbox
-- =====================
CREATE OR REPLACE FUNCTION public.get_venues_in_bbox(
  sw_lng float, sw_lat float, ne_lng float, ne_lat float
)
RETURNS TABLE(
  id uuid, slug text, name text, category text,
  city_slug text, neighborhood text,
  scans_count int, lng float, lat float
) AS $$
BEGIN
  RETURN QUERY
  SELECT v.id, v.slug, v.name, v.category,
         v.city_slug, v.neighborhood, v.scans_count,
         ST_X(v.location::geometry)::float AS lng,
         ST_Y(v.location::geometry)::float AS lat
  FROM public.venues v
  WHERE v.location && ST_MakeEnvelope(sw_lng, sw_lat, ne_lng, ne_lat, 4326)::geography;
END;
$$ LANGUAGE plpgsql STABLE;


-- =====================
-- ETAPE 10 : Fonction RPC get_venues_nearby
-- =====================
CREATE OR REPLACE FUNCTION public.get_venues_nearby(
  user_lng float, user_lat float, radius_meters int DEFAULT 5000
)
RETURNS TABLE(
  id uuid, slug text, name text, category text,
  scans_count int, distance_m float, lng float, lat float
) AS $$
BEGIN
  RETURN QUERY
  SELECT v.id, v.slug, v.name, v.category, v.scans_count,
         ST_Distance(v.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography)::float AS distance_m,
         ST_X(v.location::geometry)::float AS lng,
         ST_Y(v.location::geometry)::float AS lat
  FROM public.venues v
  WHERE ST_DWithin(v.location, ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography, radius_meters)
  ORDER BY distance_m ASC;
END;
$$ LANGUAGE plpgsql STABLE;
