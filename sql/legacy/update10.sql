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
  public.regulatory_changes,
  public.conflicts,
  public.scan_info,
  public.controls,
  public.domains,
  public.frameworks
CASCADE;


-- ── B. RESET METRICS TRACKER TO ZERO STATES ──────────────────
-- NOTE: metrics.id is a UUID (not an integer), so the old `WHERE id = 1`
-- raised a type error. Use a real predicate that matches the singleton row.
-- `internal_policies` is intentionally omitted here because this migration
-- runs BEFORE update12 adds that column (referencing it would error on a
-- fresh install); update12/update14 recalculate it from live data anyway.
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
  total_sources = 0,
  ai_auto_approval_rate = 0,
  control_multiplier = 1.0,
  total_mappings = 0
WHERE id IS NOT NULL;
