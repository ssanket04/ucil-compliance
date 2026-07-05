-- ============================================================
-- UCIL SYSTEM UPDATE 5 FIX — CONTINUATION AFTER FK ERROR
-- ============================================================
-- Run this INSTEAD of re-running update5.sql from scratch.
-- Sections 5.1 - 5.5 already applied successfully.
-- This file applies 5.7 onwards, skipping the system actor
-- insert (5.6) which fails because public.users.id is a
-- foreign key to auth.users — we cannot insert fake UUIDs.
-- System-initiated changes will use NULL for performed_by,
-- which is the correct Supabase pattern (NULL = automated).
-- ============================================================

-- ── 5.7. FIX anonymize_user — TRUE IRREVERSIBLE ANONYMISATION ─
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS void AS $$
DECLARE
  v_token TEXT;
BEGIN
  -- Generate a random irreversible token (does NOT embed original UUID)
  v_token := encode(gen_random_bytes(8), 'hex');

  -- Anonymise core user record
  UPDATE public.users SET
    full_name = '[REDACTED]',
    email     = 'redacted-' || v_token || '@gdpr.invalid'
  WHERE id = p_user_id;

  -- Audit log: redact PII fields only — keep performed_by intact (chain integrity)
  UPDATE public.audit_log SET
    ip_address = '[REDACTED]',
    user_agent = '[REDACTED]'
  WHERE performed_by = p_user_id;

  -- Notifications: replace message content
  UPDATE public.notifications SET
    message = '[REDACTED - GDPR erasure applied on ' || NOW()::DATE::TEXT || ']'
  WHERE recipient_id = p_user_id;

  -- Log the erasure itself for compliance traceability
  -- performed_by = NULL here means: automated system action (no auth context)
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

-- ── 5.8. BOUNDED AUDIT CHAIN VERIFIER (replaces full scan) ───
-- Uses timestamp range instead of iterating all rows
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

-- Grant execution only to authenticated users (role check done in safe wrapper)
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- ── 5.9. COMPLIANCE PACK EXPORT MANIFEST FUNCTION ────────────
-- Returns structured JSON of all active controls + mappings + evidence hashes
-- Accepts caller_id explicitly because SECURITY DEFINER nullifies auth.uid()
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
  -- Resolve caller identity
  SELECT tenant_id, role INTO v_caller_tenant, v_caller_role
  FROM public.users WHERE id = p_caller_id;

  -- Enforce tenant boundary (Auditor/CISO/Admin can cross tenants)
  IF v_caller_role NOT IN ('CISO', 'Admin', 'Auditor') THEN
    IF v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Access denied: you can only generate compliance packs for your own tenant';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code', c.control_code, 'name', c.name,
    'status',       c.status,       'domain', d.name,
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

  -- Compute SHA-256 pack fingerprint for tamper-evidence
  v_pack_hash := encode(digest(v_pack::text, 'sha256'), 'hex');

  RETURN v_pack || jsonb_build_object('pack_sha256', v_pack_hash);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.generate_compliance_pack(UUID, UUID) TO authenticated;
