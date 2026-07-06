-- ============================================================
-- UCIL SYSTEM UPDATE 10 — WIPE STATIC TEMPLATES FOR CLEAN START
-- ============================================================
-- Run AFTER: update9.sql
--
-- WARNING: Running this script will wipe all prebuilt baseline 
-- frameworks, domains, controls, gaps, review queues, and evidence files.
-- Run this ONLY if you want to start with a blank database and ingest
-- all data dynamically from your own circulars/documents.
-- ============================================================


-- ── A. WIPE ALL COMPLIANCE METRICS AND ASSETS ─────────────────
TRUNCATE 
  public.evidence_timeline, 
  public.evidence, 
  public.sme_review_queue, 
  public.control_framework_mappings, 
  public.gaps, 
  public.control_history, 
  public.controls,
  public.domains,
  public.frameworks 
CASCADE;
