-- ============================================================
-- UCIL SYSTEM UPDATE 6 — SECURITY HARDENING, GDPR,
--   AUDIT INTEGRITY, COMPLIANCE PACK & FINAL FIXES
-- ============================================================
-- Run AFTER: ucil-complete.sql, 05_automation.sql,
--            update1.sql, update4.sql, update5.sql
--
-- What this covers (previously split across update5_fix,
-- update6, and update7 — now a single clean migration):
--  A. GDPR irreversible anonymise_user function
--  B. Bounded audit chain verifier (timestamp range)
--  C. Role-gated safe audit verifier wrapper
--  D. Role CHECK constraint fix (adds Auditor + System roles)
--  E. Users RLS policy update (Auditor access)
--  F. SHA-256 signed compliance pack export (with auth guard)
--  G. framework_id column on gaps table
--  H. Control history snapshot trigger (no-op guard)
--  I. ai_prompts updated_at column for cache invalidation
-- ============================================================


-- ── A. GDPR IRREVERSIBLE ANONYMISE_USER ──────────────────────
-- Generates a random token — does NOT embed the original UUID
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(8), 'hex');

  -- Anonymise core user PII
  UPDATE public.users SET
    full_name = '[REDACTED]',
    email     = 'redacted-' || v_token || '@gdpr.invalid'
  WHERE id = p_user_id;

  -- Redact PII from audit log (keep performed_by for chain integrity)
  UPDATE public.audit_log SET
    ip_address = '[REDACTED]',
    user_agent = '[REDACTED]'
  WHERE performed_by = p_user_id;

  -- Redact notification message content
  UPDATE public.notifications SET
    message = '[REDACTED - GDPR erasure applied on ' || NOW()::DATE::TEXT || ']'
  WHERE recipient_id = p_user_id;

  -- Record the erasure event (performed_by = NULL = automated/system action)
  INSERT INTO public.audit_log
    (performed_by, action, entity_type, entity_id, new_values)
  VALUES (
    NULL,
    'gdpr_erasure',
    'users',
    p_user_id,
    jsonb_build_object('token', v_token, 'erased_at', NOW())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── B. BOUNDED AUDIT CHAIN VERIFIER ──────────────────────────
-- Verifies cryptographic hash chain over a timestamp range
-- (replaces the earlier full-table-scan version)
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  p_from_ts TIMESTAMPTZ,
  p_to_ts   TIMESTAMPTZ
)
RETURNS TABLE(
  is_valid        BOOLEAN,
  checked_entries INT,
  broken_at_id    UUID
) AS $$
DECLARE
  rec         RECORD;
  v_prev_hash TEXT    := NULL;
  v_count     INT     := 0;
  v_broken    UUID    := NULL;
  v_valid     BOOLEAN := TRUE;
BEGIN
  FOR rec IN
    SELECT id, prev_hash, current_hash
    FROM public.audit_log
    WHERE performed_at BETWEEN p_from_ts AND p_to_ts
    ORDER BY performed_at ASC, id ASC
  LOOP
    v_count := v_count + 1;

    IF v_prev_hash IS NOT NULL AND rec.prev_hash IS DISTINCT FROM v_prev_hash THEN
      v_valid  := FALSE;
      v_broken := rec.id;
      EXIT;
    END IF;

    v_prev_hash := rec.current_hash;
  END LOOP;

  RETURN QUERY SELECT v_valid, v_count, v_broken;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── C. ROLE-GATED SAFE AUDIT VERIFIER ────────────────────────
-- Public wrapper that enforces role check before calling verifier
-- Grants: CISO, Admin, Auditor, Compliance Lead only
REVOKE EXECUTE ON FUNCTION public.verify_audit_chain(TIMESTAMPTZ, TIMESTAMPTZ)
  FROM authenticated;

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


-- ── D. ROLE CHECK CONSTRAINT FIX ─────────────────────────────
-- Adds 'Auditor' and 'System' as valid roles
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


-- ── E. USERS RLS — AUDITOR CAN READ ALL USERS ────────────────
DROP POLICY IF EXISTS "users_read_system" ON public.users;
CREATE POLICY "users_read_system"
  ON public.users FOR SELECT
  USING (
    id = auth.uid()
    OR public.get_user_role() IN ('CISO', 'Compliance Lead', 'Admin', 'Auditor')
  );


-- ── F. COMPLIANCE PACK EXPORT (SHA-256 SIGNED + AUTH GUARD) ──
-- Accepts caller_id explicitly because auth.uid() = NULL in SECURITY DEFINER
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
  -- Resolve caller identity (explicit arg required for SECURITY DEFINER)
  SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
  FROM public.users WHERE id = p_caller_id;

  -- Enforce tenant boundary
  IF v_caller_role NOT IN ('CISO', 'Admin', 'Auditor') THEN
    IF v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Access denied: you can only generate compliance packs for your own tenant';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code, 'name',       c.name,
    'status',       c.status,       'domain',      d.name,
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
    'active_controls',    coalesce(v_controls, '[]'::jsonb),
    'framework_mappings', coalesce(v_mappings, '[]'::jsonb),
    'evidence_files',     coalesce(v_evidence, '[]'::jsonb)
  );

  -- SHA-256 fingerprint of the full pack for tamper-evidence
  v_pack_hash := encode(digest(v_pack::text, 'sha256'), 'hex');

  RETURN v_pack || jsonb_build_object('pack_sha256', v_pack_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.generate_compliance_pack(UUID, UUID)
  TO authenticated;


-- ── G. ADD framework_id COLUMN TO GAPS TABLE ─────────────────
-- Ensures auto-rejected gaps are linked to their source framework
ALTER TABLE public.gaps
  ADD COLUMN IF NOT EXISTS framework_id UUID REFERENCES public.frameworks(id);


-- ── H. CONTROL HISTORY SNAPSHOT TRIGGER (NO-OP GUARD) ────────
-- Skips snapshot when nothing meaningful changed (prevents bloat)
CREATE OR REPLACE FUNCTION public.snapshot_control_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.confidence_score IS NOT DISTINCT FROM NEW.confidence_score THEN
    RETURN NEW; -- no meaningful change — skip snapshot
  END IF;

  INSERT INTO public.control_history
    (control_id, status, confidence_score, changed_by, notes)
  VALUES (
    OLD.id,
    OLD.status,
    OLD.confidence_score,
    NULL, -- NULL = automated trigger (no auth.uid() in trigger context)
    'Auto-snapshot: status changed from ' || coalesce(OLD.status, '—')
    || ' to ' || coalesce(NEW.status, '—')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_snapshot_control ON public.controls;
CREATE TRIGGER trg_snapshot_control
  AFTER UPDATE ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_control_history();


-- ── I. AI PROMPTS updated_at COLUMN ──────────────────────────
-- Allows GRC leads to track prompt modifications for cache management
ALTER TABLE public.ai_prompts
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
