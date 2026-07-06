-- ============================================================
-- UCIL — update17.sql
-- Clean up all demo/dummy data from database tables
-- ------------------------------------------------------------
-- Truncates all data tables to restore the database to a clean,
-- empty production-ready state.
-- ============================================================

TRUNCATE public.control_framework_mappings,
         public.sme_review_queue,
         public.evidence_timeline,
         public.evidence,
         public.gaps,
         public.conflicts,
         public.regulatory_changes,
         public.controls,
         public.domains,
         public.frameworks
         CASCADE;
