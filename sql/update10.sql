-- ============================================================
-- UCIL SYSTEM UPDATE 10 — COMPLETE SYSTEM PURGE (CLEAN START)
-- ============================================================
-- Run AFTER: update9.sql
--
-- What this covers:
--  A. Performs a complete truncate of ALL compliance assets, maps, 
--     and historical records (leaving only the users table intact).
--  B. Ensures frameworks, domains, and controls are 100% clean and
--     empty, enabling the system to build everything dynamically
--     solely from user-uploaded or scraped documents.
-- ============================================================


-- ── A. TRUNCATE ALL SCHEMAS AND RELATIONSHIPS ───────────────
TRUNCATE 
  public.evidence_timeline, 
  public.evidence, 
  public.sme_review_queue, 
  public.gaps, 
  public.control_history,
  public.notifications,
  public.control_framework_mappings,
  public.controls,
  public.domains,
  public.frameworks,
  public.regulatory_changes
CASCADE;


-- ── B. RESET METRICS TRACKER TO ZERO STATES ──────────────────
UPDATE public.metrics
SET
  unique_canonical = 0,
  implemented = 0,
  in_progress_sme = 0,
  in_progress_ev_review = 0,
  in_progress_ev_pending = 0,
  in_progress_ev_reassigned = 0,
  open_gaps = 0,
  critical_gaps = 0,
  circulars_ingested = 0,
  frameworks_ingested = 0,
  internal_policies = 0,
  total_sources = 0,
  ai_auto_approval_rate = 0,
  control_multiplier = 1.0,
  total_mappings = 0
WHERE id = 1;
