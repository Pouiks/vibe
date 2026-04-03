-- Ajout de la table des réactions
CREATE TABLE IF NOT EXISTS public.message_reactions (
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  reaction_type text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  PRIMARY KEY (message_id, user_id, reaction_type)
);

-- Activation de la Row Level Security
ALTER TABLE public.message_reactions ENABLE ROW LEVEL SECURITY;

-- Politiques (Tout le monde peut voir, seulement les connectés/anonymes peuvent insérer, on peut supprimer sa propre réaction)
CREATE POLICY "Reactions visible to everyone" ON public.message_reactions FOR SELECT USING (true);
CREATE POLICY "Users can insert reactions" ON public.message_reactions FOR INSERT WITH CHECK (auth.role() IN ('authenticated', 'anon') AND auth.uid() = user_id);
CREATE POLICY "Users can delete own reactions" ON public.message_reactions FOR DELETE USING (auth.uid() = user_id);

-- Ajout de la table au flux de publications Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
