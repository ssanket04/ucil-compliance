-- ============================================================
-- UCIL SYSTEM UPDATE 8 — WEB SCRAPER CRON JOB SCHEDULE CHANGE
-- ============================================================
-- Run AFTER: update7.sql
--
-- What this covers:
--  A. Unschedule the old daily web scraper cron job
--  B. Re-schedule it to run twice a day: at 09:00 AM IST (03:30 UTC) and 02:00 PM IST (08:30 UTC)
-- ============================================================


-- ── A. UNSCHEDULE PREVIOUS SCRAPER JOB ───────────────────────
SELECT cron.unschedule(jobid) 
FROM cron.job 
WHERE jobname = 'ucil-web-scraper-daily';


-- ── B. RESCHEDULE TO RUN TWICE DAILY (09:00 AM & 02:00 PM IST) ─
SELECT cron.schedule(
  'ucil-web-scraper-daily',           -- job name
  '30 3,8 * * *',                     -- cron expression: runs at 03:30 UTC (09:00 AM IST) and 08:30 UTC (02:00 PM IST)
  $$
  SELECT net.http_post(
    url     := public.get_setting('supabase_url') || '/functions/v1/web-scraper',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || public.get_setting('service_role_key')
    ),
    body    := '{}'::jsonb
  )
  $$
);
