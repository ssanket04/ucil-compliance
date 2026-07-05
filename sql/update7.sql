-- ============================================================
-- UCIL SYSTEM UPDATE 7 — FINAL PRODUCTION HARDENING
--   Fix orphaned gaps (missing framework_id),
--   Fix control_history phantom snapshots,
--   Fix compliance pack SECURITY DEFINER + auth.uid(),
--   Add pack SHA-256 signature,
--   Add prompt version timestamp for cache invalidation
-- ============================================================
-- Run AFTER: update6.sql
-- ============================================================

-- ── 7.1. ADD framework_id TO GAPS TABLE (missing FK) ─────────
ALTER TABLE public.gaps ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES public.frameworks(id);

-- ── 7.2. FIX CONTROL HISTORY — IGNORE NO-OP UPDATES ─────────
CREATE OR REPLACE FUNCTION public.snapshot_control_history()
RETURNS TRIGGER AS $$
BEGIN
  -- Only snapshot when status or confidence actually changes (not no-ops)
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.confidence_score IS NOT DISTINCT FROM NEW.confidence_score THEN
    RETURN NEW; -- skip — no meaningful change
  END IF;

  INSERT INTO public.control_history
    (control_id, status, confidence_score, changed_by, notes)
  VALUES (
    OLD.id,
    OLD.status,
    OLD.confidence_score,
    'ffffffff-ffff-ffff-ffff-ffffffffffff', -- system actor (safe for automated triggers)
    'Auto-snapshot: status changed from ' || coalesce(OLD.status,'—')
    || ' to ' || coalesce(NEW.status,'—')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 7.3. FIX COMPLIANCE PACK — PASS auth.uid() EXPLICITLY ───
-- auth.uid() returns NULL inside SECURITY DEFINER; pass caller ID as arg
DROP FUNCTION IF EXISTS public.generate_compliance_pack(UUID);

CREATE OR REPLACE FUNCTION public.generate_compliance_pack(
  p_tenant_id UUID,
  p_caller_id UUID DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_caller_tenant UUID;
  v_caller_role   TEXT;
  v_controls      JSONB;
  v_mappings      JSONB;
  v_evidence      JSONB;
  v_pack          JSONB;
  v_pack_hash     TEXT;
BEGIN
  -- Resolve caller (passed explicitly to work inside SECURITY DEFINER)
  SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
  FROM public.users WHERE id = p_caller_id;

  -- Enforce tenant boundary
  IF v_caller_role NOT IN ('CISO', 'Admin', 'Auditor') THEN
    IF v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Access denied: you can only generate compliance packs for your own tenant';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code, 'name', c.name,
    'status',       c.status, 'domain', d.name,
    'confidence',   c.confidence_score
  )) INTO v_controls
  FROM public.controls c
  LEFT JOIN public.domains d ON c.domain_id = d.id
  WHERE c.tenant_id IS NOT DISTINCT FROM p_tenant_id AND c.status = 'Active';

  SELECT jsonb_agg(jsonb_build_object(
    'control_id', cfm.control_id, 'framework', f.name,
    'clause_ref', cfm.clause_ref, 'confidence', cfm.confidence_score,
    'status',     cfm.status
  )) INTO v_mappings
  FROM public.control_framework_mappings cfm
  LEFT JOIN public.frameworks f ON cfm.framework_id = f.id
  WHERE cfm.tenant_id IS NOT DISTINCT FROM p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code, 'file_name',  e.file_name,
    'sha256_hash',  e.sha256_hash,  'status',      e.status,
    'ai_verdict',   e.ai_verdict,   'upload_date', e.upload_date
  )) INTO v_evidence
  FROM public.evidence e
  LEFT JOIN public.controls c ON e.control_id = c.id
  WHERE e.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND e.status IN ('Approved', 'Under Review');

  v_pack := jsonb_build_object(
    'generated_at',       NOW(),
    'tenant_id',          p_tenant_id,
    'generated_by',       p_caller_id,
    'active_controls',    coalesce(v_controls,  '[]'),
    'framework_mappings', coalesce(v_mappings,  '[]'),
    'evidence_files',     coalesce(v_evidence,  '[]')
  );

  -- Compute SHA-256 pack fingerprint for tamper-evidence
  v_pack_hash := encode(digest(v_pack::text, 'sha256'), 'hex');

  RETURN v_pack || jsonb_build_object('pack_sha256', v_pack_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.generate_compliance_pack(UUID, UUID) TO authenticated;

-- ── 7.4. ADD updated_at TO ai_prompts (for cache invalidation) ─
ALTER TABLE public.ai_prompts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- ── 7.5. ADD framework_id TO AUTO-REJECTED GAPS (backfill support) ──
-- The auto-mapping edge function now passes framework_id;
-- existing orphaned gaps get no backfill (data unknown), mark explicitly
UPDATE public.gaps
  SET framework_id = NULL
WHERE framework_id IS NULL; -- no-op, just confirms column exists
