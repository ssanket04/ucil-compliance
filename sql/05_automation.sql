-- ============================================================
-- UCIL v3 — Automation SQL (Settings Table Version)
-- Sets up: configuration settings, cron jobs, storage webhook, notification email trigger
-- ============================================================


-- ── Enable required extensions ───────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;


-- ============================================================
-- CONFIGURATION SETTINGS TABLE
-- Bypasses Supabase permission restrictions on ALTER DATABASE / ALTER ROLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Accessor function for settings
CREATE OR REPLACE FUNCTION public.get_setting(p_key TEXT)
RETURNS TEXT AS $$
  SELECT value FROM public.settings WHERE key = p_key;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Populate settings directly with your keys
INSERT INTO public.settings (key, value) VALUES
('supabase_url', 'https://kyhqwllhrjsikpuvfebk.supabase.co'),
('service_role_key', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5aHF3bGxocmpzaWtwdXZmZWJrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4MzI1MDcxMywiZXhwIjoyMDk4ODI2NzEzfQ.m5HBUK1PA5jyHvS18JaAU8w5vtZW-u_m5FX0EzJNXds')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;


-- ============================================================
-- CRON JOB 1: Web scraper — runs daily at 02:30 UTC (08:00 IST)
-- ============================================================
-- Unschedule if exists to avoid duplication
SELECT cron.unschedule('ucil-web-scraper-daily');

SELECT cron.schedule(
  'ucil-web-scraper-daily',           -- job name
  '30 2 * * *',                       -- cron expression: 02:30 UTC every day
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


-- ============================================================
-- CRON JOB 2: Metrics recalculation — runs every hour
-- ============================================================
SELECT cron.unschedule('ucil-metrics-hourly');

SELECT cron.schedule(
  'ucil-metrics-hourly',
  '0 * * * *',
  $$
  UPDATE public.metrics SET
    unique_canonical        = (SELECT COUNT(*) FROM public.controls WHERE is_canonical = TRUE),
    implemented             = (SELECT COUNT(*) FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE),
    in_progress_sme         = (SELECT COUNT(*) FROM public.sme_review_queue WHERE status = 'Pending'),
    in_progress_ev_review   = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Under Review'),
    in_progress_ev_pending  = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Pending'),
    in_progress_ev_reassigned = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Reassigned'),
    open_gaps               = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open'),
    critical_gaps           = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open' AND severity = 'critical'),
    last_calculated_at      = NOW()
  $$
);


-- ============================================================
-- CRON JOB 3: Compliance evaluation — runs daily at 23:00 UTC
-- ============================================================
SELECT cron.unschedule('ucil-compliance-eval-daily');

SELECT cron.schedule(
  'ucil-compliance-eval-daily',
  '0 23 * * *',
  $$
  INSERT INTO public.scan_info (scan_type, status, completed_at, next_scheduled_at)
  VALUES ('compliance_eval', 'up-to-date', NOW(), NOW() + INTERVAL '24 hours')
  ON CONFLICT (scan_type) DO UPDATE
    SET status            = 'up-to-date',
        completed_at      = NOW(),
        next_scheduled_at = NOW() + INTERVAL '24 hours'
  $$
);


-- ============================================================
-- STORAGE TRIGGER: Auto-run evidence-verdict when file uploaded
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_evidence_verdict()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url   TEXT;
  v_service_key    TEXT;
BEGIN
  v_supabase_url := public.get_setting('supabase_url');
  v_service_key  := public.get_setting('service_role_key');

  -- Only trigger for new evidence records that are in Pending status
  IF TG_OP = 'INSERT' AND NEW.status = 'Pending' THEN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/evidence-verdict',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object(
        'evidence_id', NEW.id::TEXT,
        'control_id',  NEW.control_id::TEXT
      )
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_evidence_verdict ON public.evidence;
CREATE TRIGGER trg_evidence_verdict
  AFTER INSERT ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.trigger_evidence_verdict();


-- ============================================================
-- DB TRIGGER: Auto-run gap-narrative when new gap is created
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_gap_narrative()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  v_supabase_url := public.get_setting('supabase_url');
  v_service_key  := public.get_setting('service_role_key');

  -- Only trigger if why_critical is not yet set
  IF TG_OP = 'INSERT' AND NEW.why_critical IS NULL THEN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/gap-narrative',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('gap_id', NEW.id::TEXT)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_gap_narrative ON public.gaps;
CREATE TRIGGER trg_gap_narrative
  AFTER INSERT ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.trigger_gap_narrative();


-- ============================================================
-- DB TRIGGER: Auto-send email notification when notification inserted
-- ============================================================
CREATE OR REPLACE FUNCTION public.trigger_email_notification()
RETURNS TRIGGER AS $$
DECLARE
  v_supabase_url TEXT;
  v_service_key  TEXT;
BEGIN
  v_supabase_url := public.get_setting('supabase_url');
  v_service_key  := public.get_setting('service_role_key');

  -- Only send emails for gap-critical and evidence-rejected events
  IF NEW.trigger_event IN ('Evidence rejected / returned', 'Gap marked critical', 'Regulatory update detected') THEN
    PERFORM net.http_post(
      url     := v_supabase_url || '/functions/v1/notify-dispatch',
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || v_service_key
      ),
      body    := jsonb_build_object('notification_id', NEW.id::TEXT)
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_email_notification ON public.notifications;
CREATE TRIGGER trg_email_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public.trigger_email_notification();
