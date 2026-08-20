-- Accroche personnalisée par lieu, affichée sur l'affichette QR.
-- NULL = repli sur la phrase générique de la catégorie (generate-qr.mjs).
-- À exécuter dans le SQL Editor Supabase.

ALTER TABLE venues
  ADD COLUMN IF NOT EXISTS tagline text
  CHECK (tagline IS NULL OR char_length(tagline) <= 120);

-- Exemple pour un lieu existant (adapter puis décommenter) :
-- UPDATE venues SET tagline = 'Le spot du quartier pour se retrouver.'
--   WHERE slug = 'montpellier/montcalm/montcalm-terrain-de-basket';
