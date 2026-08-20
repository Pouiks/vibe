-- Suivi de lecture par spot : permet d'afficher sur la home le nombre de
-- messages non lus par spot rejoint. Mise à jour par le client à l'ouverture
-- du chat. La policy UPDATE (lignes) existe déjà, mais secure_scan_and_rls.sql
-- a restreint l'UPDATE au niveau COLONNE à `muted` seule : sans le GRANT
-- ci-dessous, l'écriture échoue en silence et les badges ne se vident jamais.
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE channel_subscriptions
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();

GRANT UPDATE (last_read_at) ON public.channel_subscriptions TO authenticated;
