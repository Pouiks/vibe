# Migrations Supabase — ordre d'exécution

Les fichiers s'exécutent dans le **SQL Editor** Supabase, dans cet ordre.
Ils sont globalement idempotents (rejouables), sauf mention contraire.

| # | Fichier | Rôle | Attention |
|---|---------|------|-----------|
| 1 | `schema.sql` | Schéma de base (profiles, venues, events, messages…) | ⚠ **Destructeur** : DROP toutes les tables. Base neuve uniquement. |
| 2 | `migrate_to_postgis.sql` | lat/lng → PostGIS `geography(POINT)` | Base historique uniquement (déjà inclus dans schema.sql neuf). |
| 3 | `fix_tiger_grants.sql` | Droits sur le schéma PostGIS | |
| 4 | `add_event_participants.sql` | Table event_participants + trigger de comptage | ⚠ Ne pas rejouer après secure_scan_and_rls.sql (rétrograderait la fonction de comptage en non-SECURITY DEFINER). |
| 5 | `add_reactions.sql` | Réactions aux messages | |
| 6 | `secure_scan_and_rls.sql` | Tokens de scan, RPC join_spot, durcissement RLS | |
| 7 | `events_dated_and_chat.sql` | Events datés, chat d'event, cron des rappels | Remplacer `REMPLACE_MOI_CRON_SECRET`. |
| 8 | `rgpd_purge.sql` | Purges (messages 30 j, events 30 j, comptes 24 mois) | |
| 9 | `analytics.sql` | Table analytics_events + RPC admin_venue_stats | |
| 10 | `venue_photos.sql` | Photos de lieux + vue venues_with_coords | |
| 11 | `add_unread_tracking.sql` | last_read_at (badges non-lus) + GRANT colonne | |
| 12 | `add_venue_tagline.sql` | Accroche par lieu (affiches QR) | |
| 13 | `switch_domain_atoute.sql` | Cron des rappels → atoute.app | Remplacer `REMPLACE_MOI_CRON_SECRET`. |
| 14 | `coherence_fixes.sql` | FK owner_id, stats hors chats d'events, purge participations | |
| 15 | `map_truth.sql` | scans_count = membres réels (décrément + resync) | |
| 16 | `view_add_tagline.sql` | Recrée venues_with_coords avec tagline | |
| 17 | `events_hardening.sql` | Accompagnateurs, colonnes sensibles verrouillées, capacité en base | |
| 18 | `analytics_uniques.sql` | Stats : visiteurs uniques (DROP + CREATE de admin_venue_stats) | |
| 19 | `venue_suggestions.sql` | Suggestions de lieux par les membres | |

Fichiers supprimés : `add_montcalm_and_events.sql` (obsolète — colonnes lat/lng
disparues, et il recréait une policy que secure_scan_and_rls.sql supprime
volontairement).

Secrets attendus côté Vercel : voir `.env.example` à la racine.
