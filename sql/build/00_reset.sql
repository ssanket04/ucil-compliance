-- ============================================================
-- UCIL — 00_reset.sql  (OPTIONAL — run FIRST to wipe clean)
-- ============================================================
-- Drops every UCIL application object so 01–04 can rebuild from
-- scratch. Does NOT touch auth.users (your login accounts stay).
-- Safe to run on a fresh project too (everything is IF EXISTS).
--
-- NOTE: after a full rebuild your existing auth account will have
-- no public.users profile row (the handle_new_user trigger only
-- fires for NEW signups). Either re-create your profile row, or
-- delete + re-sign-up, or run 05_seed_demo.sql.
-- ============================================================

-- Unschedule cron jobs (ignore errors if pg_cron absent)
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job
   WHERE jobname IN ('ucil-web-scraper-daily','ucil-metrics-hourly',
                     'ucil-compliance-eval-daily','ucil-sme-expiry-hourly');
EXCEPTION WHEN OTHERS THEN NULL;
END$$;

-- Drop trigger on auth.users first (it references public.handle_new_user)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- Drop application tables (CASCADE removes their policies, triggers, views, FKs)
DROP TABLE IF EXISTS
  public.evidence_timeline,
  public.evidence,
  public.control_history,
  public.sme_review_queue,
  public.control_framework_mappings,
  public.gaps,
  public.notifications,
  public.audit_log,
  public.regulatory_changes,
  public.conflicts,
  public.discovered_circulars,
  public.scan_info,
  public.ai_prompts,
  public.controls,
  public.domains,
  public.frameworks,
  public.metrics,
  public.tenants,
  public.settings,
  public.users
CASCADE;

-- Drop application functions
DROP FUNCTION IF EXISTS public.handle_updated_at()              CASCADE;
DROP FUNCTION IF EXISTS public.handle_new_user()                CASCADE;
DROP FUNCTION IF EXISTS public.get_user_role()                  CASCADE;
DROP FUNCTION IF EXISTS public.get_user_domain()                CASCADE;
DROP FUNCTION IF EXISTS public.chain_audit_log()                CASCADE;
DROP FUNCTION IF EXISTS public.log_evidence_action()            CASCADE;
DROP FUNCTION IF EXISTS public.log_to_audit()                   CASCADE;
DROP FUNCTION IF EXISTS public.recalculate_metrics()            CASCADE;
DROP FUNCTION IF EXISTS public.notify_on_evidence_change()      CASCADE;
DROP FUNCTION IF EXISTS public.notify_on_gap_change()           CASCADE;
DROP FUNCTION IF EXISTS public.sync_control_to_gap()            CASCADE;
DROP FUNCTION IF EXISTS public.sync_gap_to_control()            CASCADE;
DROP FUNCTION IF EXISTS public.sync_evidence_to_control()       CASCADE;
DROP FUNCTION IF EXISTS public.set_sme_expiry()                 CASCADE;
DROP FUNCTION IF EXISTS public.snapshot_control_history()       CASCADE;
DROP FUNCTION IF EXISTS public.make_gap_code_unique()           CASCADE;
DROP FUNCTION IF EXISTS public.cascade_domain_ownership()       CASCADE;
DROP FUNCTION IF EXISTS public.expire_stale_sme_assignments()   CASCADE;
DROP FUNCTION IF EXISTS public.anonymize_user(UUID)             CASCADE;
DROP FUNCTION IF EXISTS public.verify_audit_chain(TIMESTAMPTZ, TIMESTAMPTZ)      CASCADE;
DROP FUNCTION IF EXISTS public.verify_audit_chain(UUID, UUID)                    CASCADE;
DROP FUNCTION IF EXISTS public.verify_audit_chain_safe(TIMESTAMPTZ, TIMESTAMPTZ) CASCADE;
DROP FUNCTION IF EXISTS public.generate_compliance_pack(UUID)                    CASCADE;
DROP FUNCTION IF EXISTS public.generate_compliance_pack(UUID, UUID)              CASCADE;
DROP FUNCTION IF EXISTS public.get_setting(TEXT)                CASCADE;
DROP FUNCTION IF EXISTS public.trigger_evidence_verdict()       CASCADE;
DROP FUNCTION IF EXISTS public.trigger_gap_narrative()          CASCADE;
DROP FUNCTION IF EXISTS public.trigger_email_notification()     CASCADE;
DROP FUNCTION IF EXISTS public.get_user_tenant_id()             CASCADE;

-- Drop storage policies for the evidence bucket (bucket row kept)
DROP POLICY IF EXISTS "Allow authenticated upload to evidence-files" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated read from evidence-files" ON storage.objects;
