-- Script d'exploitation : remise à zéro des données de test avant le lancement réel.
-- ⚠ DESTRUCTIF - à exécuter dans le Supabase SQL Editor, section par section,
-- en lisant les commentaires. Prérequis : t'être connecté au moins une fois
-- dans l'app avec ton email (pour que ton profil existe).

-- ── 1. Supprimer les 7 lieux de démo du seed ──────────────────────────────
-- Cascade automatique : venue_secrets, channel_subscriptions, messages,
-- events (→ participants, chats d'event), analytics_events.

DELETE FROM public.venues WHERE id IN (
  '00000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000003',
  '00000000-0000-4000-8000-000000000004',
  '00000000-0000-4000-8000-000000000005',
  '00000000-0000-4000-8000-000000000006',
  '00000000-0000-4000-8000-000000000007'
);

-- Variante radicale si tu veux repartir de zéro lieu (décommente) :
-- DELETE FROM public.venues;

-- ── 2. Supprimer les comptes de test (tous SAUF le tien) ─────────────────
-- Cascade : profils, messages, adhésions, events, push. Décommente si voulu.

-- DELETE FROM auth.users
-- WHERE email <> 'virgilejoinville@gmail.com';

-- ── 3. (Re)promouvoir ton compte admin ────────────────────────────────────

UPDATE public.profiles SET is_admin = true
WHERE id = (SELECT id FROM auth.users WHERE email = 'virgilejoinville@gmail.com');

-- ── 4. Vérifications ──────────────────────────────────────────────────────

SELECT 'venues' AS table_name, count(*) FROM public.venues
UNION ALL SELECT 'users', count(*) FROM auth.users
UNION ALL SELECT 'messages', count(*) FROM public.messages
UNION ALL SELECT 'events', count(*) FROM public.events
UNION ALL SELECT 'admins', count(*) FROM public.profiles WHERE is_admin;
