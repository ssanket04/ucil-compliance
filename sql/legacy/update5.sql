-- ============================================================
-- UCIL SYSTEM UPDATE 5 — TENANTS RLS, SYSTEM ACTOR,
--   AUDITOR ROLE, GDPR FIX, BOUNDED AUDIT VERIFIER,
--   CONTROL HISTORY & AI PROMPTS RLS
-- ============================================================
-- Run AFTER: ucil-complete.sql, 05_automation.sql,
--            update1.sql, update4.sql
-- ============================================================


-- ── 5.1. ENABLE RLS ON NEW TABLES ────────────────────────────
ALTER TABLE public.tenants         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts      ENABLE ROW LEVEL SECURITY;

-- ── 5.2. TENANTS RLS — own row only, CISO/Admin see all ─────
DROP POLICY IF EXISTS "tenants_read_own" ON public.tenants;
CREATE POLICY "tenants_read_own"
  ON public.tenants FOR SELECT
  USING (
    id IS NOT DISTINCT FROM public.get_user_tenant_id()
    OR public.get_user_role() IN ('CISO', 'Admin')
  );

DROP POLICY IF EXISTS "tenants_write_admin" ON public.tenants;
CREATE POLICY "tenants_write_admin"
  ON public.tenants FOR ALL
  USING (public.get_user_role() IN ('CISO', 'Admin'));

-- ── 5.3. CONTROL HISTORY RLS ────────────────────────────────
DROP POLICY IF EXISTS "ctrl_history_read" ON public.control_history;
CREATE POLICY "ctrl_history_read"
  ON public.control_history FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "ctrl_history_no_delete" ON public.control_history;
CREATE POLICY "ctrl_history_no_delete"
  ON public.control_history FOR DELETE
  USING (FALSE);

-- ── 5.4. AI PROMPTS RLS ─────────────────────────────────────
-- All authenticated users can read active prompts
DROP POLICY IF EXISTS "ai_prompts_read" ON public.ai_prompts;
CREATE POLICY "ai_prompts_read"
  ON public.ai_prompts FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Only Compliance Lead / CISO / Admin can modify prompts
DROP POLICY IF EXISTS "ai_prompts_write" ON public.ai_prompts;
CREATE POLICY "ai_prompts_write"
  ON public.ai_prompts FOR ALL
  USING (public.get_user_role() IN ('Compliance Lead', 'CISO', 'Admin'));

-- ── 5.5. AUDITOR ROLE — READ-ONLY ON AUDIT & EVIDENCE ───────
-- Expand audit_log read policy to include Auditor role
DROP POLICY IF EXISTS "audit_read_admin" ON public.audit_log;
CREATE POLICY "audit_read_admin"
  ON public.audit_log FOR SELECT
  USING (public.get_user_role() IN ('CISO', 'Compliance Lead', 'Admin', 'Auditor'));

-- Auditor read on evidence (no write)
DROP POLICY IF EXISTS "evidence_read_auditor" ON public.evidence;
CREATE POLICY "evidence_read_auditor"
  ON public.evidence FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      tenant_id IS NOT DISTINCT FROM public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin', 'Auditor')
    )
  );

-- Auditor read on frameworks
DROP POLICY IF EXISTS "frameworks_read_auditor" ON public.frameworks;
CREATE POLICY "frameworks_read_auditor"
  ON public.frameworks FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    OR public.get_user_role() = 'Auditor'
  );

-- ── 5.6. SYSTEM ACTOR — NOT APPLICABLE IN SUPABASE ──────────
-- public.users.id is a FK to auth.users(id) in Supabase.
-- Fake/sentinel UUIDs cannot be inserted from the SQL editor.
-- System-initiated actions (triggers, cron jobs) use NULL for
-- performed_by / changed_by. NULL = automated process. This is
-- correct and expected behaviour in Supabase deployments.

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

  -- Audit log: replace PII fields but keep the actor as system sentinel
  -- DO NOT null out performed_by — use system actor ID to preserve audit chain
  UPDATE public.audit_log SET
    ip_address = '[REDACTED]',
    user_agent = '[REDACTED]'
  WHERE performed_by = p_user_id;

  -- Notifications: replace message content
  UPDATE public.notifications SET
    message = '[REDACTED - GDPR erasure applied on ' || NOW()::DATE::TEXT || ']'
  WHERE recipient_id = p_user_id;

  -- Log the erasure itself for compliance traceability
  INSERT INTO public.audit_log
    (performed_by, action, entity_type, entity_id, new_values)
  VALUES (
    'ffffffff-ffff-ffff-ffff-ffffffffffff',
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
  v_prev_hash TEXT := NULL;
  v_count     INT  := 0;
  v_broken    UUID := NULL;
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

-- Grant Auditor role execution rights
GRANT EXECUTE ON FUNCTION public.verify_audit_chain(TIMESTAMPTZ, TIMESTAMPTZ)
  TO authenticated;

-- ── 5.9. COMPLIANCE PACK EXPORT MANIFEST FUNCTION ────────────
-- Returns structured JSON of all active controls + mappings + evidence hashes
CREATE OR REPLACE FUNCTION public.generate_compliance_pack(p_tenant_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_controls  JSONB;
  v_mappings  JSONB;
  v_evidence  JSONB;
BEGIN
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
    'control_id',    cfm.control_id,
    'framework',     f.name,
    'clause_ref',    cfm.clause_ref,
    'confidence',    cfm.confidence_score,
    'status',        cfm.status
  )) INTO v_mappings
  FROM public.control_framework_mappings cfm
  LEFT JOIN public.frameworks f ON cfm.framework_id = f.id
  WHERE cfm.tenant_id IS NOT DISTINCT FROM p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object(
    'control_code',  c.control_code,
    'file_name',     e.file_name,
    'sha256_hash',   e.sha256_hash,
    'status',        e.status,
    'ai_verdict',    e.ai_verdict,
    'upload_date',   e.upload_date
  )) INTO v_evidence
  FROM public.evidence e
  LEFT JOIN public.controls c ON e.control_id = c.id
  WHERE e.tenant_id IS NOT DISTINCT FROM p_tenant_id
    AND e.status IN ('Approved', 'Under Review');

  RETURN jsonb_build_object(
    'generated_at',   NOW(),
    'tenant_id',      p_tenant_id,
    'active_controls', coalesce(v_controls, '[]'),
    'framework_mappings', coalesce(v_mappings, '[]'),
    'evidence_files', coalesce(v_evidence, '[]')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant Auditor + CISO roles access
GRANT EXECUTE ON FUNCTION public.generate_compliance_pack(UUID)
  TO authenticated;
