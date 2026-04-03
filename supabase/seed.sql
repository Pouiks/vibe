-- Seed data for VIBE PWA
-- We insert a few fake venues to test the QR code slugs (/l/slug)

INSERT INTO public.venues (id, slug, name, category, lat, lng)
VALUES 
  ('00000000-0000-4000-8000-000000000001', 'le-bureau-paris', 'Le Bureau Paris', 'other', 48.8566, 2.3522),
  ('00000000-0000-4000-8000-000000000002', 'skatepark-bastille', 'Skatepark Bastille', 'sport', 48.8530, 2.3690),
  ('00000000-0000-4000-8000-000000000003', 'cafe-des-amis', 'Café des Amis', 'cafe', 48.8600, 2.3400),
  ('00000000-0000-4000-8000-000000000004', 'darwin-bordeaux', 'Darwin Ecosystème', 'other', 44.8488, -0.5594),
  ('00000000-0000-4000-8000-000000000005', 'basic-fit-centre', 'Basic-Fit Centre', 'sport', 44.8378, -0.5792),
  ('00000000-0000-4000-8000-000000000006', 'Montcalm-basket', 'Terrain de Basket Montcalm', 'sport', 44.8295, -0.5950)
ON CONFLICT (slug) DO NOTHING;
