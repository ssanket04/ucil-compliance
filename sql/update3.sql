-- ============================================================
-- UCIL SYSTEM UPDATE 3 — TENANT ISOLATION, AUDIT PERFORMANCE
--                        & SME EXPIRATION ENFORCEMENT
-- ============================================================
-- Apply this script in the Supabase SQL Editor.
-- Run this AFTER update1.sql and update2.sql.
-- Focuses on:
--  1. Helper function: get_user_tenant_id()
--  2. Tenant-aware RLS policies on all core tables
--  3. Composite index on audit_log for O(1) chain queries
--  4. Performance indexes on evidence and mappings
--  5. SME assignment expiration: auto-return to queue after 72 hrs
-- ============================================================

-- ── 1. HELPER FUNCTION: get_user_tenant_id ─────────────────
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── 2. AUDIT LOG CHAIN PERFORMANCE INDEX ────────────────────
-- Prevents sequential scans when the chaining trigger queries latest hash
CREATE INDEX IF NOT EXISTS idx_audit_log_chain
  ON public.audit_log(performed_at DESC, id DESC);

-- ── 3. COMPOSITE PERFORMANCE INDEXES ────────────────────────
CREATE INDEX IF NOT EXISTS idx_evidence_control_status
  ON public.evidence(control_id, status);

CREATE INDEX IF NOT EXISTS idx_mappings_fw_ctrl
  ON public.control_framework_mappings(framework_id, control_id);

CREATE INDEX IF NOT EXISTS idx_controls_domain_status
  ON public.controls(domain_id, status);

-- Tenant lookups
CREATE INDEX IF NOT EXISTS idx_controls_tenant
  ON public.controls(tenant_id);

CREATE INDEX IF NOT EXISTS idx_evidence_tenant
  ON public.evidence(tenant_id);

CREATE INDEX IF NOT EXISTS idx_gaps_tenant
  ON public.gaps(tenant_id);

-- ── 4. TENANT-AWARE RLS POLICIES ────────────────────────────
-- NOTE: These add tenant isolation checks on top of existing policies.
-- Admin/CISO roles bypass tenant checks to allow cross-tenant oversight.

-- Controls: tenant scoped reads
DROP POLICY IF EXISTS "controls_read_tenant" ON public.controls;
CREATE POLICY "controls_read_tenant"
  ON public.controls FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      tenant_id = public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

-- Evidence: tenant scoped reads
DROP POLICY IF EXISTS "evidence_read_tenant" ON public.evidence;
CREATE POLICY "evidence_read_tenant"
  ON public.evidence FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      tenant_id = public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

-- Gaps: tenant scoped reads
DROP POLICY IF EXISTS "gaps_read_tenant" ON public.gaps;
CREATE POLICY "gaps_read_tenant"
  ON public.gaps FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      tenant_id = public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

-- Evidence insert: must match tenant
DROP POLICY IF EXISTS "evidence_insert_tenant" ON public.evidence;
CREATE POLICY "evidence_insert_tenant"
  ON public.evidence FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND tenant_id = public.get_user_tenant_id()
    AND public.get_user_role() IN ('Control Owner', 'Compliance Lead', 'CISO', 'Admin')
  );

-- ── 5. SME ASSIGNMENT AUTO-EXPIRATION (72 hours) ─────────────
-- Add expiration tracking columns if not present
ALTER TABLE public.sme_review_queue ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.sme_review_queue ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

-- Function: auto-expire stale SME assignments
CREATE OR REPLACE FUNCTION public.expire_stale_sme_assignments()
RETURNS void AS $$
BEGIN
  UPDATE public.sme_review_queue
  SET
    assigned_to  = NULL,
    assigned_at  = NULL,
    expires_at   = NULL,
    status       = 'Pending'
  WHERE
    status      = 'Pending'
    AND assigned_to IS NOT NULL
    AND expires_at  < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger: set expires_at = now() + 72h on assignment
CREATE OR REPLACE FUNCTION public.set_sme_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    NEW.assigned_at := NOW();
    NEW.expires_at  := NOW() + INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_sme_expiry ON public.sme_review_queue;
CREATE TRIGGER trg_set_sme_expiry
  BEFORE UPDATE ON public.sme_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_sme_expiry();
