-- ============================================================
-- UCIL SYSTEM UPDATE 1 — DATABASE SCHEMA SECURITY & INTEGRITY
-- ============================================================
-- Apply this script in the Supabase SQL Editor.
-- Focuses on:
--  1. Adding SHA-256 hash storage for evidence integrity
--  2. Re-creating the v_evidence_full view to expose hashes
--  3. Securing the settings table using Row Level Security (RLS)
-- ============================================================

-- ── 1. ADD HASH STORAGE TO EVIDENCE TABLE ───────────────────
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS sha256_hash TEXT;

-- ── 2. RECREATE EVIDENCE VIEW TO SELECT HASH COLUMN ─────────
DROP VIEW IF EXISTS public.v_evidence_full CASCADE;

CREATE OR REPLACE VIEW public.v_evidence_full AS
SELECT
  e.id, e.control_id, e.file_name, e.file_path, e.file_size,
  e.status, e.manual_remark, e.ai_verdict, e.ai_verdict_detail,
  e.ai_missing_elements, e.ai_red_flags, e.observations, e.rejection_reason,
  e.sha256_hash, -- Integrated for audit non-repudiation
  e.upload_date, e.review_date,
  c.control_code, c.name AS control_name,
  d.name AS domain_name,
  u_up.full_name  AS uploaded_by_name,
  u_rev.full_name AS reviewed_by_name
FROM public.evidence e
LEFT JOIN public.controls c   ON e.control_id  = c.id
LEFT JOIN public.domains  d   ON c.domain_id   = d.id
LEFT JOIN public.users u_up   ON e.uploaded_by  = u_up.id
LEFT JOIN public.users u_rev  ON e.reviewed_by  = u_rev.id;

-- ── 3. ENABLE ROW LEVEL SECURITY ON CONFIGURATION SETTINGS ────
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- ── 4. DEFINE RLS POLICIES FOR SECURE SETTINGS MANAGEMENT ────
DROP POLICY IF EXISTS "Restrict read settings" ON public.settings;
CREATE POLICY "Restrict read settings" 
  ON public.settings 
  FOR SELECT 
  TO service_role, postgres
  USING (true);

DROP POLICY IF EXISTS "Restrict write settings" ON public.settings;
CREATE POLICY "Restrict write settings" 
  ON public.settings 
  FOR ALL 
  TO service_role, postgres
  USING (true);
