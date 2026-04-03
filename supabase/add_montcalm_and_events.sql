-- Ajout du lieu Montcalm Basket
INSERT INTO public.venues (id, slug, name, category, lat, lng)
VALUES ('00000000-0000-4000-8000-000000000006', 'Montcalm-basket', 'Terrain de Basket Montcalm', 'sport', 44.8295, -0.5950)
ON CONFLICT (slug) DO NOTHING;

-- Politique UPDATE pour les événements (permet le "Rejoindre")
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Users can update events' AND tablename = 'events') THEN
    EXECUTE 'CREATE POLICY "Users can update events" ON public.events FOR UPDATE USING (true)';
  END IF;
END $$;
