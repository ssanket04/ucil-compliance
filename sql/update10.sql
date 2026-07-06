-- ============================================================
-- UCIL SYSTEM UPDATE 10 — SAFE MOCK DATA CLEANUP
-- ============================================================
-- Run AFTER: update9.sql
--
-- What this covers:
--  A. Wipes all user-generated mock evidence, logs, gaps, audit timelines, and review items
--  B. Deletes mock circulars and circular mappings, leaving baseline frameworks (ISO/NIST),
--     domains, and baseline controls intact to ensure the AI mapping engine has reference data.
-- ============================================================


-- ── A. TRUNCATE MOCK TIMELINES, EVIDENCE, GAPS, QUEUES ────────
TRUNCATE 
  public.evidence_timeline, 
  public.evidence, 
  public.sme_review_queue, 
  public.gaps, 
  public.control_history
CASCADE;


-- ── B. DELETE MOCK CIRCULARS AND ASSOCIATED MAPPINGS ──────────
DELETE FROM public.regulatory_changes;

DELETE FROM public.control_framework_mappings 
WHERE framework_id IN (
  SELECT id FROM public.frameworks WHERE type = 'Circular'
);

DELETE FROM public.frameworks WHERE type = 'Circular';
