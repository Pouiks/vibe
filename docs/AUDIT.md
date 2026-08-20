# Registre d'audit — suivi de clôture

Source : audits du 2026-08-20/21 (3 passes d'exploration + 8 angles de revue).
Règle : **aucune trouvaille ne sort de ce fichier sans statut** — `✅ corrigé`
(avec commit), `🔶 ouvert` (priorisé), ou `⚖ décision` (assumée, avec le pourquoi).
Toute nouvelle trouvaille d'audit s'ajoute ici le jour même.

## ✅ Corrigé (vérifié en code, commits du 2026-08-20/21)

- Garde d'auth mort (`'/'` en préfixe) + écrasement du profil par formulaire vide — `8f74335`
- Boucle de connexion (course session/hydratation du profil) + /login sans redirection si connecté — `5d0dca3`
- `?tab=events` jamais lu (notifs, carrousel, post-création) + deep link sur page montée — `8f74335`
- Lien email sans returnUrl (`emailRedirectTo`) — `8f74335`
- `GRANT UPDATE (last_read_at)` manquant (badges jamais vidés) — `be84032`
- FK `venues.owner_id` sans ON DELETE (suppression de compte admin impossible) — `be84032`
- Stats admin : chats d'events comptés dans le lieu — `be84032`
- Trigger purge des participations au départ d'un spot (accès chat d'event fantôme) — `be84032`
- Cloche par spot : règle unifiée + `sent` honnête + cooldown stampé à la tentative — `be84032`
- Événements fantômes sur la home après avoir quitté un spot — `8f74335`
- Mode Flash : géoloc par lieu, activation opt-in, bascule auto, garde au submit, fallback iOS — `8f74335`
- Erreurs de scan honnêtes (réseau ≠ token invalide, faux "scanné !") — `8f74335`
- Bouton notifications du profil : état réel de l'appareil, jamais masqué — `8f74335`
- Restes VibeSpot, tutoiement, spot/event unifiés, faute "évent" — `fd20e9c`
- Confidentialité réalignée (code OTP, géoloc opt-in, compteurs, publique) + export réactions/last_read — `fd20e9c`/`be84032`
- theme-color contradictoires (#FF684F vs #09090b) — `fd20e9c`
- Échappement HTML des affiches, JSON-LD anti-XSS, Suspense sur useSearchParams — `fd20e9c`/`8f74335`
- `scans_count` cumulatif (heatmap trompeuse) → membres actuels — `2526e4c` + `map_truth.sql`
- INSERT events non protégé (compteur/notified_at forgés) + course dernière place + DEFAULT 1 — `events_hardening.sql` (+ feature accompagnateurs)
- Dédup optimiste des messages par uuid client (fini le télescopage de contenus identiques)
- sw.js notificationclick : focus + navigate par pathname (plus de 2e fenêtre)
- Compteurs "en ligne" = membres connectés uniquement (décision Virgile 2026-08-21)
- Carte sombre lumineuse (tuiles CARTO éclaircies) suivant le thème de l'app
- Palette carte hors charte (indigo), "Découvrir" → verrou — `2526e4c`
- Swipe-back incohérent/absent, flèches ≠ geste, sortie d'app sur historique vide — `2526e4c`
- Vue `venues_with_coords` sans tagline (liste admin vide en silence) — `9ae3819` + `view_add_tagline.sql`
- schema.sql détruisait pg_cron ; add_montcalm dangereux supprimé ; ordre des migrations documenté — `2526e4c`
- Spinners plein écran tripliqués → FullScreenLoader/Spinner — `2526e4c`
- qr_visit double-compté (aller-retour login) — `8f74335`

## 🔶 Ouvert — par priorité

| P | Trouvaille | Détail |
|---|-----------|--------|
| 1 | **Tests de parcours UI** | Partiellement couvert : `npm run e2e` (scripts/e2e.mjs) rejoue le cycle de vie complet côté backend contre la vraie base (scan, RLS, chat, events, départ, cascades — 18 assertions) et valide les migrations. Reste la couche navigateur (login OTP, garde d'auth, rendu) → Playwright. |
| 5bis | KPI "visiteurs uniques" | ✅ Fait (analytics_uniques.sql + stats admin) : visites ET visiteurs distincts via anon_id. |
| 8 | Trigger participants défini en 2 versions (add_event_participants vs secure_scan) | Documenté au README (ne pas rejouer) ; à consolider dans un seul fichier. |
| 9 | `scan_success` compte les re-scans | Le KPI "Scans" admin ≠ nouveaux membres. RPC pourrait renvoyer inserted true/false. |
| 10 | Design system reste partiel | Spinners inline restants, 3 conventions disabled, CATEGORY_ICONS défini 3×, classe `hide-scrollbar` inexistante, `.glass` mort, dégradé du logo en 2 variantes. |
| 11 | `push_subscriptions` sans purge | Endpoints morts conservés (hors 404/410) jusqu'à purge du compte à 24 mois. |
| 12 | `last_activity_at` mal nommé et jamais affiché | = date du dernier scan uniquement. Renommer ou brancher sur les messages. |
| 14 | Login OTP 8 chiffres codé en dur | Doit rester aligné avec la config Supabase (fonctionne aujourd'hui). Pas de bouton de validation manuel si la longueur change. |
| 15 | `.env` : `ADMIN_VENUE_PASSWORD`, `NGROK_AUTHTOKEN` orphelins | À supprimer du .env (RESEND_API_KEY sert au SMTP Supabase, hors code). |

## ⚖ Décisions assumées

- **Rappel d'event ignore la cloche du spot** : participation explicite > sourdine ; l'infobulle de la cloche l'affiche.
- **Présence "sur place" déclarée par le client** (spoofable) : même niveau de confiance que le token d'affiche ; la vraie vérification serveur = Realtime Authorization, non prioritaire.
- **"En ligne" = personnes sur la page** (membres ou non) : wording aligné ("sur cette page") — voir 🔶7 pour l'écran verrouillé.
- **QR par lieu** (pas d'universel GPS) : décision produit du 2026-08-20, code universel retiré.
- **Replis de migration dans le code** (tagline, last_read_at) : ciblés sur l'erreur de colonne, à supprimer une fois les migrations 11-16 confirmées en prod.
