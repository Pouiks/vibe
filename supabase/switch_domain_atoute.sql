-- Bascule du cron des rappels d'events vers le domaine atoute.app.
-- Le job déployé pinge encore https://vibe-ten-pi.vercel.app (qui continue de
-- fonctionner), ceci aligne la prod sur le domaine définitif.
--
-- ⚠ Remplacer REMPLACE_MOI_CRON_SECRET par la valeur réelle de CRON_SECRET
--   (la même que la variable d'environnement Vercel) avant d'exécuter.
-- À exécuter dans le SQL Editor Supabase.

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
