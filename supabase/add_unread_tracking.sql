-- Suivi de lecture par spot : permet d'afficher sur la home le nombre de
-- messages non lus par spot rejoint. Mise à jour par le client à l'ouverture
-- du chat (policy UPDATE existante sur ses propres abonnements, cf. muted).
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE channel_subscriptions
  ADD COLUMN IF NOT EXISTS last_read_at timestamptz NOT NULL DEFAULT now();
