-- ============================================================
-- UCIL — update15.sql
-- Fix v_evidence_full relationship mapping for PostgREST
-- ------------------------------------------------------------
-- Exposes e.uploaded_by and e.reviewed_by columns in the view
-- so that PostgREST can resolve joins with the public.users table.
-- ============================================================

DROP VIEW IF EXISTS public.v_evidence_full CASCADE;

CREATE OR REPLACE VIEW public.v_evidence_full AS
SELECT
  e.id, e.control_id, e.file_name, e.file_path, e.file_size,
  e.status, e.manual_remark, e.ai_verdict, e.ai_verdict_detail,
  e.ai_missing_elements, e.ai_red_flags, e.observations, e.rejection_reason,
  e.sha256_hash,
  e.upload_date, e.review_date,
  e.uploaded_by, e.reviewed_by,
  c.control_code, c.name AS control_name,
  d.name AS domain_name,
  u_up.full_name  AS uploaded_by_name,
  u_rev.full_name AS reviewed_by_name
FROM public.evidence e
LEFT JOIN public.controls c  ON e.control_id  = c.id
LEFT JOIN public.domains  d  ON c.domain_id   = d.id
LEFT JOIN public.users u_up  ON e.uploaded_by = u_up.id
LEFT JOIN public.users u_rev ON e.reviewed_by = u_rev.id;
