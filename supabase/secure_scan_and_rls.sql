-- Migration: preuve de présence réelle (token QR validé serveur) + durcissement RLS
-- À exécuter dans le Supabase SQL Editor. Idempotente.
--
-- Corrige :
--   1. Auto-inscription libre dans channel_subscriptions (bypass ?scanned=true)
--   2. Écriture dans messages sans adhésion au spot
--   3. events : INSERT sans vérif creator_id, UPDATE ouvert à tous, DELETE absent
--   4. event_participants : rôle anon autorisé à insérer/supprimer
--   5. message_reactions : insertion sans adhésion au spot
--   6. Dérive de schéma : messages.is_on_site absent de schema.sql
--   7. events.notified_at pour rendre la notification d'event idempotente

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ── 1. Colonnes manquantes ────────────────────────────────────────────────

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS is_on_site boolean DEFAULT false;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS notified_at timestamptz DEFAULT NULL;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS notified_at timestamptz DEFAULT NULL;

-- ── 2. Secrets de scan (jamais lisibles côté client) ─────────────────────

CREATE TABLE IF NOT EXISTS public.venue_secrets (
  venue_id uuid PRIMARY KEY REFERENCES public.venues(id) ON DELETE CASCADE,
  scan_token text UNIQUE NOT NULL DEFAULT encode(extensions.gen_random_bytes(16), 'hex'),
  created_at timestamptz DEFAULT now()
);

-- RLS activée sans aucune policy : accès client refusé, seul le SQL
-- SECURITY DEFINER (join_spot) et la clé service peuvent lire.
ALTER TABLE public.venue_secrets ENABLE ROW LEVEL SECURITY;

INSERT INTO public.venue_secrets (venue_id)
SELECT id FROM public.venues
ON CONFLICT (venue_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.create_venue_secret()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions AS $$
BEGIN
  INSERT INTO public.venue_secrets (venue_id) VALUES (NEW.id)
  ON CONFLICT (venue_id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_venue_created_secret ON public.venues;
CREATE TRIGGER on_venue_created_secret
  AFTER INSERT ON public.venues
  FOR EACH ROW EXECUTE FUNCTION public.create_venue_secret();

-- ── 3. RPC join_spot : seule porte d'entrée dans un spot ─────────────────
-- Le QR code contient /l/<slug>?t=<scan_token>. Le client appelle
-- join_spot(slug, token) ; la validation du token se fait ici, côté serveur.

CREATE OR REPLACE FUNCTION public.join_spot(p_slug text, p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_venue_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  SELECT v.id INTO v_venue_id
  FROM public.venues v
  JOIN public.venue_secrets s ON s.venue_id = v.id
  WHERE v.slug = p_slug AND s.scan_token = p_token;

  IF v_venue_id IS NULL THEN
    RAISE EXCEPTION 'invalid_token';
  END IF;

  INSERT INTO public.channel_subscriptions (user_id, venue_id)
  VALUES (auth.uid(), v_venue_id)
  ON CONFLICT (user_id, venue_id) DO NOTHING;

  RETURN v_venue_id;
END;
$$;

REVOKE ALL ON FUNCTION public.join_spot(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_spot(text, text) TO authenticated;

-- ── 4. channel_subscriptions : plus d'auto-inscription ───────────────────
-- INSERT n'est plus possible qu'à travers join_spot (SECURITY DEFINER).

DROP POLICY IF EXISTS "Users manage own channel subs" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "Read own channel subs" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "Update own channel subs" ON public.channel_subscriptions;
DROP POLICY IF EXISTS "Delete own channel subs" ON public.channel_subscriptions;

CREATE POLICY "Read own channel subs" ON public.channel_subscriptions
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Update own channel subs" ON public.channel_subscriptions
  FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Delete own channel subs" ON public.channel_subscriptions
  FOR DELETE USING (auth.uid() = user_id);

-- RLS restreint les LIGNES, pas les colonnes : sans ce grant de colonne, un
-- membre pourrait re-pointer sa ligne vers un autre venue_id et contourner
-- toute la preuve de présence. Seul `muted` est modifiable côté client.
REVOKE UPDATE ON public.channel_subscriptions FROM authenticated, anon;
GRANT UPDATE (muted) ON public.channel_subscriptions TO authenticated;

-- ── 5. messages : lire ET écrire exigent l'adhésion au spot ──────────────
-- Décision produit : pas de mode spectateur — le chat d'un lieu n'est
-- visible qu'après avoir scanné son QR code sur place.

DROP POLICY IF EXISTS "Messages visible to everyone" ON public.messages;
DROP POLICY IF EXISTS "Members can read messages" ON public.messages;
DROP POLICY IF EXISTS "Users can insert messages" ON public.messages;
DROP POLICY IF EXISTS "Members can insert messages" ON public.messages;

CREATE POLICY "Members can read messages" ON public.messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.channel_subscriptions cs
      WHERE cs.user_id = auth.uid() AND cs.venue_id = messages.venue_id
    )
  );

CREATE POLICY "Members can insert messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.channel_subscriptions cs
      WHERE cs.user_id = auth.uid() AND cs.venue_id = messages.venue_id
    )
  );

-- ── 6. events : créateur vérifié, modification/suppression réservées ─────

DROP POLICY IF EXISTS "Authenticated users can insert events" ON public.events;
DROP POLICY IF EXISTS "Users can update events" ON public.events;
DROP POLICY IF EXISTS "Members can insert events" ON public.events;
DROP POLICY IF EXISTS "Creators can update own events" ON public.events;
DROP POLICY IF EXISTS "Creators can delete own events" ON public.events;

CREATE POLICY "Members can insert events" ON public.events
  FOR INSERT WITH CHECK (
    auth.uid() = creator_id
    AND EXISTS (
      SELECT 1 FROM public.channel_subscriptions cs
      WHERE cs.user_id = auth.uid() AND cs.venue_id = events.venue_id
    )
  );
CREATE POLICY "Creators can update own events" ON public.events
  FOR UPDATE USING (auth.uid() = creator_id) WITH CHECK (auth.uid() = creator_id);
CREATE POLICY "Creators can delete own events" ON public.events
  FOR DELETE USING (auth.uid() = creator_id);

-- Colonnes sensibles hors de portée du client : notified_at (sinon le créateur
-- le remet à NULL et rejoue la notification en boucle), current_participants
-- (maintenu par trigger) et venue_id (sinon un event se déplace vers un spot
-- dont le créateur n'est pas membre).
REVOKE UPDATE ON public.events FROM authenticated, anon;
GRANT UPDATE (title, description, start_time, max_participants) ON public.events TO authenticated;

-- Le compteur de participants est maintenu par trigger : il doit passer en
-- SECURITY DEFINER car la policy UPDATE d'events est désormais créateur-only.
CREATE OR REPLACE FUNCTION public.update_event_participants_count()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (TG_OP = 'INSERT') THEN
    UPDATE public.events SET current_participants = current_participants + 1 WHERE id = NEW.event_id;
    RETURN NEW;
  ELSIF (TG_OP = 'DELETE') THEN
    UPDATE public.events SET current_participants = greatest(0, current_participants - 1) WHERE id = OLD.event_id;
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

-- ── 7. event_participants : plus d'accès anon ────────────────────────────

DROP POLICY IF EXISTS "Users can join" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave" ON public.event_participants;
DROP POLICY IF EXISTS "Members can join events" ON public.event_participants;
DROP POLICY IF EXISTS "Users can leave events" ON public.event_participants;

CREATE POLICY "Members can join events" ON public.event_participants
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.events e
      JOIN public.channel_subscriptions cs
        ON cs.venue_id = e.venue_id AND cs.user_id = auth.uid()
      WHERE e.id = event_participants.event_id
    )
  );
CREATE POLICY "Users can leave events" ON public.event_participants
  FOR DELETE USING (auth.uid() = user_id);

-- ── 8. message_reactions : lire et réagir exigent l'adhésion au spot ─────

DROP POLICY IF EXISTS "Reactions visible to everyone" ON public.message_reactions;
DROP POLICY IF EXISTS "Members can read reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Users can insert reactions" ON public.message_reactions;
DROP POLICY IF EXISTS "Members can insert reactions" ON public.message_reactions;

CREATE POLICY "Members can read reactions" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.channel_subscriptions cs
        ON cs.venue_id = m.venue_id AND cs.user_id = auth.uid()
      WHERE m.id = message_reactions.message_id
    )
  );

CREATE POLICY "Members can insert reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      JOIN public.channel_subscriptions cs
        ON cs.venue_id = m.venue_id AND cs.user_id = auth.uid()
      WHERE m.id = message_reactions.message_id
    )
  );

-- ── 9. Resserrage des policies existantes (WITH CHECK explicites) ────────

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Users manage own push subs" ON public.push_subscriptions;
CREATE POLICY "Users manage own push subs" ON public.push_subscriptions
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- ── 10. Rôle admin (création de lieux) ───────────────────────────────────

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_admin boolean DEFAULT false;

-- is_admin ne doit jamais être auto-attribuable, et le username reste géré
-- par le système : seules les colonnes de profil éditables sont accordées.
REVOKE UPDATE ON public.profiles FROM authenticated, anon;
GRANT UPDATE (first_name, age, gender, avatar_idx, bio) ON public.profiles TO authenticated;

-- Pour promouvoir ton compte admin, exécute ensuite (une fois) :
-- UPDATE public.profiles SET is_admin = true
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'virgilejoinville@gmail.com');

COMMIT;
