-- Fix : la création de lieu via l'API (rôle service_role) échouait avec
-- « permission denied for schema tiger » — PostGIS est installé dans le
-- schéma tiger sur cette instance, et service_role n'y avait pas accès.
-- Nécessaire pour écrire la colonne venues.location (type geography).
-- À exécuter dans le Supabase SQL Editor. Idempotent.

GRANT USAGE ON SCHEMA tiger TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tiger TO service_role;
