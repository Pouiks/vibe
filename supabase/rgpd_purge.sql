-- Migration étape 4 : purges RGPD automatiques (minimisation des données).
-- À exécuter dans le Supabase SQL Editor APRÈS events_dated_and_chat.sql
-- (pg_cron doit être activé). Idempotente.
--
-- Rétentions (alignées sur /confidentialite) :
--   - messages : 30 jours
--   - events passés : 30 jours après leur date (cascade : participants,
--     messages du chat d'event)
--   - comptes inactifs : 24 mois sans connexion (cascade : tout)

-- ── Purge quotidienne des messages (4h05 du matin) ───────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('vibe-purge-messages');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vibe-purge-messages',
  '5 4 * * *',
  $$ DELETE FROM public.messages WHERE created_at < now() - interval '30 days' $$
);

-- ── Purge quotidienne des events passés (4h10) ───────────────────────────

DO $$
BEGIN
  PERFORM cron.unschedule('vibe-purge-events');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vibe-purge-events',
  '10 4 * * *',
  $$ DELETE FROM public.events WHERE start_time < now() - interval '30 days' $$
);

-- ── Purge mensuelle des comptes inactifs (le 1er du mois, 4h20) ──────────
-- Supprimer auth.users cascade sur profiles puis sur toutes les données.

DO $$
BEGIN
  PERFORM cron.unschedule('vibe-purge-inactive-users');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vibe-purge-inactive-users',
  '20 4 1 * *',
  $$
  DELETE FROM auth.users
  WHERE (last_sign_in_at IS NOT NULL AND last_sign_in_at < now() - interval '24 months')
     OR (last_sign_in_at IS NULL AND created_at < now() - interval '24 months')
  $$
);
