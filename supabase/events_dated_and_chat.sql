-- Migration étape 3 : events datés + chat dédié par event + rappels push.
-- À exécuter dans le Supabase SQL Editor APRÈS secure_scan_and_rls.sql. Idempotente.
--
-- ⚠ AVANT D'EXÉCUTER : remplace REMPLACE_MOI_CRON_SECRET (section 5) par une
-- valeur longue et aléatoire, et mets la même valeur dans la variable
-- d'environnement CRON_SECRET sur Vercel.
--
-- Contenu :
--   1. events.duration_minutes + events.reminded_at ; messages.event_id
--   2. Le créateur d'un event en est participant (backfill + recompte)
--   3. Policies messages/réactions event-aware : le chat d'un event est
--      réservé à ses participants (la « session dans la session »)
--   4. Extensions pg_cron + pg_net
--   5. Cron toutes les 5 min → POST /api/events/reminders (rappels avant début)

BEGIN;

-- ── 1. Colonnes ──────────────────────────────────────────────────────────

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS duration_minutes int NOT NULL DEFAULT 60;
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS reminded_at timestamptz DEFAULT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_messages_event_id ON public.messages(event_id);

-- duration_minutes est modifiable par le créateur comme les autres champs éditables.
GRANT UPDATE (duration_minutes) ON public.events TO authenticated;

-- ── 2. Créateur = participant ────────────────────────────────────────────
-- Les nouvelles créations insèrent la ligne côté client ; backfill de l'existant,
-- puis recompte pour neutraliser les incréments du trigger pendant le backfill.

INSERT INTO public.event_participants (event_id, user_id)
SELECT e.id, e.creator_id FROM public.events e
ON CONFLICT (event_id, user_id) DO NOTHING;

UPDATE public.events SET current_participants = (
  SELECT count(*) FROM public.event_participants ep WHERE ep.event_id = events.id
);

-- ── 3. Policies event-aware ──────────────────────────────────────────────
-- Chat du lieu (event_id IS NULL) : membres du spot.
-- Chat d'un event (event_id IS NOT NULL) : participants de l'event.

DROP POLICY IF EXISTS "Members can read messages" ON public.messages;
CREATE POLICY "Members can read messages" ON public.messages
  FOR SELECT USING (
    (event_id IS NULL AND EXISTS (
      SELECT 1 FROM public.channel_subscriptions cs
      WHERE cs.user_id = auth.uid() AND cs.venue_id = messages.venue_id
    ))
    OR
    (event_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.event_participants ep
      WHERE ep.user_id = auth.uid() AND ep.event_id = messages.event_id
    ))
  );

DROP POLICY IF EXISTS "Members can insert messages" ON public.messages;
CREATE POLICY "Members can insert messages" ON public.messages
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND (
      (event_id IS NULL AND EXISTS (
        SELECT 1 FROM public.channel_subscriptions cs
        WHERE cs.user_id = auth.uid() AND cs.venue_id = messages.venue_id
      ))
      OR
      (event_id IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.event_participants ep
        WHERE ep.user_id = auth.uid() AND ep.event_id = messages.event_id
      ))
    )
  );

DROP POLICY IF EXISTS "Members can read reactions" ON public.message_reactions;
CREATE POLICY "Members can read reactions" ON public.message_reactions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
      AND (
        (m.event_id IS NULL AND EXISTS (
          SELECT 1 FROM public.channel_subscriptions cs
          WHERE cs.user_id = auth.uid() AND cs.venue_id = m.venue_id
        ))
        OR
        (m.event_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.event_participants ep
          WHERE ep.user_id = auth.uid() AND ep.event_id = m.event_id
        ))
      )
    )
  );

DROP POLICY IF EXISTS "Members can insert reactions" ON public.message_reactions;
CREATE POLICY "Members can insert reactions" ON public.message_reactions
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    AND EXISTS (
      SELECT 1 FROM public.messages m
      WHERE m.id = message_reactions.message_id
      AND (
        (m.event_id IS NULL AND EXISTS (
          SELECT 1 FROM public.channel_subscriptions cs
          WHERE cs.user_id = auth.uid() AND cs.venue_id = m.venue_id
        ))
        OR
        (m.event_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.event_participants ep
          WHERE ep.user_id = auth.uid() AND ep.event_id = m.event_id
        ))
      )
    )
  );

COMMIT;

-- ── 4. Extensions cron (hors transaction : CREATE EXTENSION peut nécessiter
--       une activation via Dashboard → Database → Extensions si ceci échoue) ──

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── 5. Rappel avant début : toutes les 5 min, ping de la route serveur ───
-- La route /api/events/reminders vérifie le header x-cron-secret, trouve les
-- events qui commencent dans <15 min non rappelés (claim atomique via
-- reminded_at) et push les participants.

DO $$
BEGIN
  PERFORM cron.unschedule('vibe-event-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vibe-event-reminders',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://atoute.app/api/events/reminders',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'REMPLACE_MOI_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
