-- ── Suggestions de lieux par les membres ─────────────────────────────────
-- Champ libre dans le profil : "où verrais-tu un QR ATOUTE ?". Les membres
-- écrivent (et relisent les leurs), les admins lisent tout et suppriment.
-- À exécuter dans le SQL Editor Supabase.

CREATE TABLE IF NOT EXISTS public.venue_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  content text NOT NULL CHECK (char_length(content) BETWEEN 3 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.venue_suggestions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users insert own suggestions" ON public.venue_suggestions;
CREATE POLICY "Users insert own suggestions" ON public.venue_suggestions
  FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users read own suggestions" ON public.venue_suggestions;
CREATE POLICY "Users read own suggestions" ON public.venue_suggestions
  FOR SELECT USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Admins read all suggestions" ON public.venue_suggestions;
CREATE POLICY "Admins read all suggestions" ON public.venue_suggestions
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );

DROP POLICY IF EXISTS "Admins delete suggestions" ON public.venue_suggestions;
CREATE POLICY "Admins delete suggestions" ON public.venue_suggestions
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.is_admin)
  );
