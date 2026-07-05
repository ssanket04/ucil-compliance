-- ============================================================
-- UCIL SYSTEM UPDATE 2 — AUDIT CHAINING, TENANCY & PERFORMANCE
-- ============================================================
-- Apply this script in the Supabase SQL Editor.
-- Focuses on:
--  1. Enabling pgcrypto extension
--  2. Adding cryptographic chaining (prev_hash, current_hash) to audit_log table
--  3. Creating the audit chaining trigger
--  4. Adding tenant_id logical partition columns to core tables
--  5. Building composite indexes for dashboard performance
-- ============================================================

-- ── 1. ENABLE CRYPTO EXTENSION ──────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── 2. ADD HASH COLUMNS TO AUDIT LOG ────────────────────────
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS prev_hash TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS current_hash TEXT;

-- ── 3. CREATE AUDIT LOG CHAINING TRIGGER ────────────────────
CREATE OR REPLACE FUNCTION public.chain_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_hash TEXT;
  v_payload TEXT;
BEGIN
  -- Fetch the hash of the latest log entry
  SELECT current_hash INTO v_prev_hash
  FROM public.audit_log
  ORDER BY performed_at DESC, id DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  -- Set previous hash link
  NEW.prev_hash := v_prev_hash;

  -- Format paylod data to hash
  v_payload := coalesce(NEW.performed_by::text, '') || '|' ||
               coalesce(NEW.action, '') || '|' ||
               coalesce(NEW.entity_type, '') || '|' ||
               coalesce(NEW.entity_id::text, '') || '|' ||
               coalesce(NEW.new_values::text, '') || '|' ||
               v_prev_hash;

  -- Generate SHA-256 signature hash of the log block
  NEW.current_hash := encode(digest(v_payload, 'sha256'), 'hex');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_audit_log ON public.audit_log;
CREATE TRIGGER trg_chain_audit_log
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log();

-- ── 4. ADD TENANT ISOLATION COLUMNS ─────────────────────────
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.controls ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.gaps ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.control_framework_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';

-- ── 5. OPTIMIZE COMPOSITE INDEXES ───────────────────────────
CREATE INDEX IF NOT EXISTS idx_evidence_control_status ON public.evidence(control_id, status);
CREATE INDEX IF NOT EXISTS idx_mappings_fw_ctrl ON public.control_framework_mappings(framework_id, control_id);
CREATE INDEX IF NOT EXISTS idx_controls_domain_status ON public.controls(domain_id, status);
