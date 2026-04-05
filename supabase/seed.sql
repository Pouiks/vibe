SET search_path TO public, extensions, tiger;

-- Seed data for VIBE PWA (PostGIS format)
-- Slugs follow hierarchical format: city/neighborhood/spot-name
-- location uses ST_MakePoint(longitude, latitude) — lon first!

INSERT INTO public.venues (id, slug, name, category, city_slug, neighborhood, location)
VALUES
  ('00000000-0000-4000-8000-000000000001', 'paris/marais/le-bureau', 'Le Bureau Paris', 'other', 'paris', 'Marais', ST_SetSRID(ST_MakePoint(2.3522, 48.8566), 4326)::geography),
  ('00000000-0000-4000-8000-000000000002', 'paris/bastille/skatepark', 'Skatepark Bastille', 'sport', 'paris', 'Bastille', ST_SetSRID(ST_MakePoint(2.3690, 48.8530), 4326)::geography),
  ('00000000-0000-4000-8000-000000000003', 'paris/saint-germain/cafe-des-amis', 'Café des Amis', 'cafe', 'paris', 'Saint-Germain', ST_SetSRID(ST_MakePoint(2.3400, 48.8600), 4326)::geography),
  ('00000000-0000-4000-8000-000000000004', 'bordeaux/bastide/darwin', 'Darwin Ecosystème', 'other', 'bordeaux', 'Bastide', ST_SetSRID(ST_MakePoint(-0.5594, 44.8488), 4326)::geography),
  ('00000000-0000-4000-8000-000000000005', 'bordeaux/centre/basic-fit', 'Basic-Fit Centre', 'sport', 'bordeaux', 'Centre', ST_SetSRID(ST_MakePoint(-0.5792, 44.8378), 4326)::geography),
  ('00000000-0000-4000-8000-000000000006', 'bordeaux/montcalm/basket-court', 'Terrain de Basket Montcalm', 'sport', 'bordeaux', 'Montcalm', ST_SetSRID(ST_MakePoint(-0.5950, 44.8295), 4326)::geography),
  ('00000000-0000-4000-8000-000000000007', 'montpellier/beaux-arts/maison-virgile', 'Maison de Virgile', 'other', 'montpellier', 'Beaux-Arts', ST_SetSRID(ST_MakePoint(3.8424382, 43.5919731), 4326)::geography)
ON CONFLICT (slug) DO NOTHING;
