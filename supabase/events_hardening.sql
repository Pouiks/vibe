-- ── Durcissement events + accompagnateurs (AUDIT 🔶2-4) ──────────────────
-- 1. companions : "on est déjà N" à la création — le compteur démarre à N.
-- 2. Le serveur écrase les colonnes sensibles à l'insert : impossible de
--    créer un event "déjà complet" ou "déjà notifié" (notified_at forgé
--    supprimait la notification "Nouvel event" et le rappel).
-- 3. Capacité verrouillée en base : deux personnes ne peuvent plus prendre
--    la dernière place simultanément (verrou de ligne FOR UPDATE).
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS companions int NOT NULL DEFAULT 0
  CHECK (companions >= 0);

ALTER TABLE public.events ALTER COLUMN current_participants SET DEFAULT 0;

-- 2. Colonnes sensibles fixées par le serveur, quoi que le client envoie
CREATE OR REPLACE FUNCTION public.events_sanitize_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(NEW.companions, 0) >= NEW.max_participants THEN
    RAISE EXCEPTION 'too_many_companions';
  END IF;
  -- le compteur démarre aux accompagnateurs déclarés ; les participations
  -- réelles (créateur inclus) s'ajoutent via le trigger de comptage
  NEW.current_participants := COALESCE(NEW.companions, 0);
  NEW.notified_at := NULL;
  NEW.reminded_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_events_sanitize_insert ON public.events;
CREATE TRIGGER trg_events_sanitize_insert
  BEFORE INSERT ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_sanitize_insert();

-- Même protection pour les messages : notified_at ne peut pas être forgé
-- (il supprimerait la notification push du message)
CREATE OR REPLACE FUNCTION public.messages_sanitize_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.notified_at := NULL;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_messages_sanitize_insert ON public.messages;
CREATE TRIGGER trg_messages_sanitize_insert
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.messages_sanitize_insert();

-- 3. Capacité : le verrou de ligne sérialise les inscriptions concurrentes
CREATE OR REPLACE FUNCTION public.enforce_event_capacity()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_current int;
  v_max int;
BEGIN
  SELECT current_participants, max_participants INTO v_current, v_max
  FROM public.events WHERE id = NEW.event_id FOR UPDATE;

  IF v_current IS NULL THEN
    RAISE EXCEPTION 'event_not_found';
  END IF;
  IF v_current >= v_max THEN
    RAISE EXCEPTION 'event_full';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_event_capacity ON public.event_participants;
CREATE TRIGGER trg_enforce_event_capacity
  BEFORE INSERT ON public.event_participants
  FOR EACH ROW EXECUTE FUNCTION public.enforce_event_capacity();
