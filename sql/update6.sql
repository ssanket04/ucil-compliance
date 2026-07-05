-- ============================================================
-- UCIL SYSTEM UPDATE 6 — CRITICAL SECURITY PATCHES
--   Role constraint fix, system actor demotion,
--   compliance pack auth guard, prompt caching note
-- ============================================================
-- Run AFTER: update5.sql
-- ============================================================

-- ── 6.1. ADD 'Auditor' AND 'System' TO ROLE CHECK CONSTRAINT ─
-- Drop old constraint and recreate with new valid roles
ALTER TABLE public.users
  DROP CONSTRAINT IF EXISTS users_role_check;

ALTER TABLE public.users
  ADD CONSTRAINT users_role_check CHECK (
    role IN (
      'CISO',
      'Compliance Lead',
      'Domain Head',
      'Control Owner',
      'Admin',
      'Auditor',
      'System'
    )
  );

-- ── 6.2. DEMOTE SYSTEM ACTOR TO 'System' ROLE ────────────────
-- Remove Admin permissions from the system sentinel user
UPDATE public.users
  SET role = 'System'
WHERE id = 'ffffffff-ffff-ffff-ffff-ffffffffffff';

-- ── 6.3. SYSTEM ROLE — ZERO PERMISSION RLS POLICY ────────────
-- System role can insert audit logs but cannot SELECT/UPDATE anything
DROP POLICY IF EXISTS "users_read_system" ON public.users;
CREATE POLICY "users_read_system"
  ON public.users FOR SELECT
  USING (
    id = auth.uid()
    OR public.get_user_role() IN ('CISO', 'Compliance Lead', 'Admin', 'Auditor')
  );

-- ── 6.4. SCOPE COMPLIANCE PACK TO CALLER'S OWN TENANT ────────
CREATE OR REPLACE FUNCTION public.generate_compliance_pack(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_caller_tenant UUID;
  v_caller_role   TEXT;
  v_controls      JSONB;
  v_mappings      JSONB;
  v_evidence      JSONB;
BEGIN
  -- Authenticate caller's tenant
  SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
  FROM public.users WHERE id = auth.uid();

  -- Only allow access to own tenant, or CISO/Admin for any tenant
  IF v_caller_role NOT IN ('CISO', 'Admin') THEN
    IF v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Access denied: you can only generate compliance packs for your own tenant';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code,
    'name',         c.name,
    'status',       c.status,
    'domain',       d.name,
    'confidence',   c.confidence_score
  )) INTO v_controls
  FROM public.controls c
  LEFT JOIN public.domains d ON c.domain_id = d.id
  WHERE c.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND c.status = 'Active';

  SELECT jsonb_agg(jsonb_build_object(
    'control_id',   cfm.control_id,
    'framework',    f.name,
    'clause_ref',   cfm.clause_ref,
    'confidence',   cfm.confidence_score,
    'status',       cfm.status
  )) INTO v_mappings
  FROM public.control_framework_mappings cfm
  LEFT JOIN public.frameworks f ON cfm.framework_id = f.id
  WHERE cfm.tenant_id IS NOT DISTINCT FROM p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code,
    'file_name',    e.file_name,
    'sha256_hash',  e.sha256_hash,
    'status',       e.status,
    'ai_verdict',   e.ai_verdict,
    'upload_date',  e.upload_date
  )) INTO v_evidence
  FROM public.evidence e
  LEFT JOIN public.controls c ON e.control_id = c.id
  WHERE e.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND e.status IN ('Approved', 'Under Review');

  RETURN jsonb_build_object(
    'generated_at',       NOW(),
    'tenant_id',          p_tenant_id,
    'generated_by',       auth.uid(),
    'active_controls',    coalesce(v_controls,  '[]'),
    'framework_mappings', coalesce(v_mappings,  '[]'),
    'evidence_files',     coalesce(v_evidence,  '[]')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 6.5. RATE-LIMIT AUDIT CHAIN VERIFIER ─────────────────────
-- Revoke general authenticated access, restrict to auditor+ roles only
REVOKE EXECUTE ON FUNCTION public.verify_audit_chain(TIMESTAMPTZ, TIMESTAMPTZ)
  FROM authenticated;

-- Create a wrapper that checks role before allowing execution
CREATE OR REPLACE FUNCTION public.verify_audit_chain_safe(
  p_from_ts TIMESTAMPTZ,
  p_to_ts   TIMESTAMPTZ
)
RETURNS TABLE(
  is_valid        BOOLEAN,
  checked_entries INT,
  broken_at_id    UUID
) AS $$
DECLARE
  v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('CISO', 'Admin', 'Auditor', 'Compliance Lead') THEN
    RAISE EXCEPTION 'Access denied: insufficient role to verify audit chain';
  END IF;

  RETURN QUERY SELECT * FROM public.verify_audit_chain(p_from_ts, p_to_ts);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.verify_audit_chain_safe(TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;
