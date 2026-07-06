-- ============================================================
-- UCIL — 04_automation.sql   (RUN 4th — LAST)
-- Settings · Cron jobs · Storage & notification webhook triggers
-- ------------------------------------------------------------
-- ⚠️  ACTION REQUIRED: fill in the two settings values below with
--     your project URL and a FRESH (rotated) service_role key.
--     These drive server-side calls to the Edge Functions.
-- ============================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ── Configuration settings (service-role calls read from here) ─
CREATE TABLE IF NOT EXISTS public.settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Restrict read settings"  ON public.settings;
CREATE POLICY "Restrict read settings"  ON public.settings FOR SELECT TO service_role, postgres USING (true);
DROP POLICY IF EXISTS "Restrict write settings" ON public.settings;
CREATE POLICY "Restrict write settings" ON public.settings FOR ALL    TO service_role, postgres USING (true);

CREATE OR REPLACE FUNCTION public.get_setting(p_key TEXT)
RETURNS TEXT AS $$ SELECT value FROM public.settings WHERE key = p_key; $$
LANGUAGE sql SECURITY DEFINER STABLE;

-- >>> EDIT THESE TWO VALUES <<<
INSERT INTO public.settings (key, value) VALUES
  ('supabase_url',     'https://YOUR-PROJECT-REF.supabase.co'),
  ('service_role_key', 'PASTE_YOUR_FRESH_SERVICE_ROLE_KEY_HERE')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- ============================================================
-- CRON JOBS
-- ============================================================

-- 1. Web scraper — 09:00 & 14:00 IST (03:30 & 08:30 UTC)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ucil-web-scraper-daily';
SELECT cron.schedule('ucil-web-scraper-daily', '30 3,8 * * *', $CRON$
  SELECT net.http_post(
    url     := public.get_setting('supabase_url') || '/functions/v1/web-scraper',
    headers := jsonb_build_object('Content-Type','application/json',
                                  'Authorization','Bearer ' || public.get_setting('service_role_key')),
    body    := '{}'::jsonb)
$CRON$);

-- 2. Metrics recalculation — hourly (explicit WHERE clause — supautils-safe)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ucil-metrics-hourly';
SELECT cron.schedule('ucil-metrics-hourly', '0 * * * *', $CRON$
  UPDATE public.metrics SET
    unique_canonical          = (SELECT COUNT(*) FROM public.controls WHERE is_canonical = TRUE),
    implemented               = (SELECT COUNT(*) FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE),
    in_progress_sme           = (SELECT COUNT(*) FROM public.sme_review_queue WHERE status = 'Pending'),
    in_progress_ev_review     = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Under Review'),
    in_progress_ev_pending    = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Pending'),
    in_progress_ev_reassigned = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Reassigned'),
    open_gaps                 = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open'),
    critical_gaps             = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open' AND severity = 'critical'),
    last_calculated_at        = NOW()
  WHERE id IS NOT NULL
$CRON$);

-- 3. Compliance evaluation — daily 23:00 UTC (ON CONFLICT works: scan_type is UNIQUE)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ucil-compliance-eval-daily';
SELECT cron.schedule('ucil-compliance-eval-daily', '0 23 * * *', $CRON$
  INSERT INTO public.scan_info (scan_type, status, completed_at, next_scheduled_at)
  VALUES ('compliance_eval','up-to-date', NOW(), NOW() + INTERVAL '24 hours')
  ON CONFLICT (scan_type) DO UPDATE
    SET status = 'up-to-date', completed_at = NOW(), next_scheduled_at = NOW() + INTERVAL '24 hours'
$CRON$);

-- 4. Reclaim stale SME assignments — hourly
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ucil-sme-expiry-hourly';
SELECT cron.schedule('ucil-sme-expiry-hourly', '0 * * * *', $CRON$
  SELECT public.expire_stale_sme_assignments();
$CRON$);

-- ============================================================
-- WEBHOOK TRIGGERS → Edge Functions
-- ============================================================

-- Auto-run evidence-verdict when a new evidence row is inserted (Pending)
CREATE OR REPLACE FUNCTION public.trigger_evidence_verdict()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
    PERFORM net.http_post(
      url     := public.get_setting('supabase_url') || '/functions/v1/evidence-verdict',
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer ' || public.get_setting('service_role_key')),
      body    := jsonb_build_object('evidence_id', NEW.id::TEXT, 'control_id', NEW.control_id::TEXT));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_evidence_verdict ON public.evidence;
CREATE TRIGGER trg_evidence_verdict AFTER INSERT ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.trigger_evidence_verdict();

-- Auto-run gap-narrative when a new gap is created without a narrative
CREATE OR REPLACE FUNCTION public.trigger_gap_narrative()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.why_critical IS NULL THEN
    PERFORM net.http_post(
      url     := public.get_setting('supabase_url') || '/functions/v1/gap-narrative',
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer ' || public.get_setting('service_role_key')),
      body    := jsonb_build_object('gap_id', NEW.id::TEXT));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_gap_narrative ON public.gaps;
CREATE TRIGGER trg_gap_narrative AFTER INSERT ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.trigger_gap_narrative();

-- Auto-send email for high-signal notifications
CREATE OR REPLACE FUNCTION public.trigger_email_notification()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.trigger_event IN ('Evidence rejected / returned','Gap marked critical','Regulatory update detected') THEN
    PERFORM net.http_post(
      url     := public.get_setting('supabase_url') || '/functions/v1/notify-dispatch',
      headers := jsonb_build_object('Content-Type','application/json',
                                    'Authorization','Bearer ' || public.get_setting('service_role_key')),
      body    := jsonb_build_object('notification_id', NEW.id::TEXT));
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_email_notification ON public.notifications;
CREATE TRIGGER trg_email_notification AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_email_notification();
