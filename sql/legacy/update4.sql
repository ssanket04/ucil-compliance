-- ============================================================
-- UCIL SYSTEM UPDATE 4 — TENANTS TABLE, NULL-SAFE RLS,
--   SME EXPIRY SCHEDULING, GDPR ANONYMISATION,
--   CONTROL HISTORY, AI PROMPTS TABLE & AUDIT CHAIN INDEXES
-- ============================================================
-- Run AFTER: ucil-complete.sql, 05_automation.sql, update1.sql
-- NOTE: update2.sql and update3.sql changes are MERGED here.
--       You do NOT need to run update2.sql or update3.sql separately.
-- ============================================================

-- ── PREREQUISITES ────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ════════════════════════════════════════════════════════════
-- FROM UPDATE 2: Audit chain hashing + Tenant columns + Indexes
-- ════════════════════════════════════════════════════════════

-- Audit log hash chain columns
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS prev_hash    TEXT;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS current_hash TEXT;

-- Audit log chaining trigger function
CREATE OR REPLACE FUNCTION public.chain_audit_log()
RETURNS TRIGGER AS $$
DECLARE
  v_prev_hash TEXT;
  v_payload   TEXT;
BEGIN
  SELECT current_hash INTO v_prev_hash
  FROM public.audit_log
  ORDER BY performed_at DESC, id DESC
  LIMIT 1;

  IF v_prev_hash IS NULL THEN
    v_prev_hash := 'GENESIS';
  END IF;

  NEW.prev_hash := v_prev_hash;

  v_payload := coalesce(NEW.performed_by::text, '') || '|' ||
               coalesce(NEW.action, '') || '|' ||
               coalesce(NEW.entity_type, '') || '|' ||
               coalesce(NEW.entity_id::text, '') || '|' ||
               coalesce(NEW.new_values::text, '') || '|' ||
               v_prev_hash;

  NEW.current_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_chain_audit_log ON public.audit_log;
CREATE TRIGGER trg_chain_audit_log
  BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log();

-- Tenant isolation columns (default to legacy sentinel UUID)
ALTER TABLE public.users                      ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.controls                   ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.evidence                   ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.gaps                       ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';
ALTER TABLE public.control_framework_mappings ADD COLUMN IF NOT EXISTS tenant_id UUID DEFAULT '00000000-0000-0000-0000-000000000000';

-- Evidence SHA-256 hash column (in case update1 was not run)
ALTER TABLE public.evidence ADD COLUMN IF NOT EXISTS sha256_hash TEXT;

-- SME assignment expiry columns
ALTER TABLE public.sme_review_queue ADD COLUMN IF NOT EXISTS assigned_at TIMESTAMPTZ;
ALTER TABLE public.sme_review_queue ADD COLUMN IF NOT EXISTS expires_at  TIMESTAMPTZ;

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_audit_log_chain        ON public.audit_log(performed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_control_status ON public.evidence(control_id, status);
CREATE INDEX IF NOT EXISTS idx_mappings_fw_ctrl        ON public.control_framework_mappings(framework_id, control_id);
CREATE INDEX IF NOT EXISTS idx_controls_domain_status  ON public.controls(domain_id, status);
CREATE INDEX IF NOT EXISTS idx_controls_tenant         ON public.controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant         ON public.evidence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_gaps_tenant             ON public.gaps(tenant_id);


-- ════════════════════════════════════════════════════════════
-- FROM UPDATE 3: Helper functions, RLS policies, SME trigger
-- ════════════════════════════════════════════════════════════

-- Tenant helper function (SECURITY DEFINER bypasses users RLS)
CREATE OR REPLACE FUNCTION public.get_user_tenant_id()
RETURNS UUID AS $$
  SELECT tenant_id FROM public.users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

-- SME auto-expiry trigger
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

-- Recreate v_evidence_full with sha256_hash column
DROP VIEW IF EXISTS public.v_evidence_full CASCADE;
CREATE OR REPLACE VIEW public.v_evidence_full AS
SELECT
  e.id, e.control_id, e.file_name, e.file_path, e.file_size,
  e.status, e.manual_remark, e.ai_verdict, e.ai_verdict_detail,
  e.ai_missing_elements, e.ai_red_flags, e.observations, e.rejection_reason,
  e.sha256_hash,
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

-- Settings table RLS (in case update1 was not run)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Restrict read settings" ON public.settings;
CREATE POLICY "Restrict read settings"
  ON public.settings FOR SELECT
  TO service_role, postgres USING (true);
DROP POLICY IF EXISTS "Restrict write settings" ON public.settings;
CREATE POLICY "Restrict write settings"
  ON public.settings FOR ALL
  TO service_role, postgres USING (true);


-- ════════════════════════════════════════════════════════════
-- NEW IN UPDATE 4
-- ════════════════════════════════════════════════════════════

-- ── 4.1. TENANTS REGISTRY TABLE ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  plan        TEXT DEFAULT 'Standard' CHECK (plan IN ('Trial','Standard','Enterprise')),
  region      TEXT DEFAULT 'in-south-1',
  contact     TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Insert legacy sentinel tenant so all existing records are owned
INSERT INTO public.tenants (id, name, plan, region)
VALUES ('00000000-0000-0000-0000-000000000000', 'Legacy / Unpartitioned', 'Enterprise', 'in-south-1')
ON CONFLICT (id) DO NOTHING;

-- ── 4.2. NULL-SAFE TENANT RLS POLICIES ───────────────────────
-- Drop old broad-open policies first, replace with tenant-scoped ones

DROP POLICY IF EXISTS "controls_read_all"     ON public.controls;
DROP POLICY IF EXISTS "controls_read_tenant"  ON public.controls;
CREATE POLICY "controls_read_tenant"
  ON public.controls FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      tenant_id IS NOT DISTINCT FROM public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

DROP POLICY IF EXISTS "evidence_read_all"     ON public.evidence;
DROP POLICY IF EXISTS "evidence_read_tenant"  ON public.evidence;
CREATE POLICY "evidence_read_tenant"
  ON public.evidence FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      tenant_id IS NOT DISTINCT FROM public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

DROP POLICY IF EXISTS "gaps_read_all"         ON public.gaps;
DROP POLICY IF EXISTS "gaps_read_tenant"      ON public.gaps;
CREATE POLICY "gaps_read_tenant"
  ON public.gaps FOR SELECT
  USING (
    auth.uid() IS NOT NULL AND (
      tenant_id IS NOT DISTINCT FROM public.get_user_tenant_id()
      OR public.get_user_role() IN ('CISO', 'Admin')
    )
  );

DROP POLICY IF EXISTS "evidence_insert_owner"  ON public.evidence;
DROP POLICY IF EXISTS "evidence_insert_tenant" ON public.evidence;
CREATE POLICY "evidence_insert_tenant"
  ON public.evidence FOR INSERT
  WITH CHECK (
    uploaded_by = auth.uid()
    AND tenant_id IS NOT DISTINCT FROM public.get_user_tenant_id()
    AND public.get_user_role() IN ('Control Owner','Compliance Lead','CISO','Admin')
  );

-- ── 4.3. SME EXPIRY RECLAIM (pg_cron hourly job) ─────────────
CREATE OR REPLACE FUNCTION public.expire_stale_sme_assignments()
RETURNS void AS $$
BEGIN
  UPDATE public.sme_review_queue
  SET
    assigned_to = NULL,
    assigned_at = NULL,
    expires_at  = NULL,
    status      = 'Pending'
  WHERE
    status      = 'Pending'
    AND assigned_to IS NOT NULL
    AND expires_at  < NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Idempotent pg_cron job registration (safe to re-run)
SELECT cron.unschedule(jobid)
  FROM cron.job WHERE jobname = 'ucil-sme-expiry-hourly';
SELECT cron.schedule(
  'ucil-sme-expiry-hourly',
  '0 * * * *',
  $$SELECT public.expire_stale_sme_assignments();$$
);

-- ── 4.4. GDPR ANONYMISE USER FUNCTION ────────────────────────
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS void AS $$
BEGIN
  -- Anonymise core user record
  UPDATE public.users SET
    full_name = '[REDACTED]',
    email     = '[redacted-' || p_user_id::text || '@gdpr.invalid]'
  WHERE id = p_user_id;

  -- Anonymise audit log actor entries
  UPDATE public.audit_log SET
    performed_by = NULL,
    ip_address   = '[REDACTED]',
    user_agent   = '[REDACTED]'
  WHERE performed_by = p_user_id;

  -- Anonymise notifications
  UPDATE public.notifications SET
    message = '[REDACTED - GDPR erasure applied]'
  WHERE recipient_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── 4.5. CONTROL POSTURE HISTORY TABLE ───────────────────────
CREATE TABLE IF NOT EXISTS public.control_history (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id     UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  status         TEXT NOT NULL,
  confidence_score NUMERIC(4,3),
  changed_by     UUID REFERENCES public.users(id),
  snapshot_at    TIMESTAMPTZ DEFAULT NOW(),
  notes          TEXT
);

CREATE INDEX IF NOT EXISTS idx_control_history_ctrl
  ON public.control_history(control_id, snapshot_at DESC);

-- Trigger to auto-record history on status or score change
CREATE OR REPLACE FUNCTION public.snapshot_control_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status
     OR OLD.confidence_score IS DISTINCT FROM NEW.confidence_score THEN
    INSERT INTO public.control_history
      (control_id, status, confidence_score, changed_by, notes)
    VALUES
      (OLD.id, OLD.status, OLD.confidence_score, auth.uid(),
       'Auto-snapshot: status changed from ' || coalesce(OLD.status,'—') || ' to ' || coalesce(NEW.status,'—'));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_snapshot_control ON public.controls;
CREATE TRIGGER trg_snapshot_control
  AFTER UPDATE ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_control_history();

-- ── 4.6. AI PROMPTS VERSION TABLE ────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_prompts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  function_name TEXT NOT NULL,
  version       TEXT NOT NULL DEFAULT 'v1.0',
  prompt_text   TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(function_name, version)
);

-- Seed with current production prompts
INSERT INTO public.ai_prompts (function_name, version, prompt_text, is_active)
VALUES
  ('evidence-verdict', 'v1.0',
   'You are a compliance auditor reviewing evidence documents. Assess whether the uploaded evidence adequately proves that a compliance control is implemented. Respond ONLY with valid JSON: { "verdict": "Sufficient", "covered": [...], "missing": [...], "red_flags": [...], "detail": "...", "confidence": 0.91 }. verdict must be one of: "Sufficient", "Insufficient", "Partial".',
   TRUE),
  ('auto-mapping', 'v1.0',
   'You are a compliance mapping engine. Compare a new framework clause against multiple existing controls and find the best match. Respond ONLY with valid JSON: { "best_match_index": 2, "confidence": 0.91, "rationale": "...", "is_conflict": false, "conflict_note": "" }. best_match_index: 0-based index of best matching control, or -1 if no match. confidence: 0 to 1.',
   TRUE)
ON CONFLICT (function_name, version) DO NOTHING;

-- ── 4.7. AUDIT LOG CHAIN VERIFICATION FUNCTION ───────────────
-- Auditors can call this to verify chain integrity between two log IDs
CREATE OR REPLACE FUNCTION public.verify_audit_chain(
  p_from_id UUID,
  p_to_id   UUID
)
RETURNS TABLE(
  is_valid         BOOLEAN,
  checked_entries  INT,
  broken_at_id     UUID
) AS $$
DECLARE
  rec             RECORD;
  v_prev_hash     TEXT := NULL;
  v_count         INT  := 0;
  v_broken        UUID := NULL;
  v_valid         BOOLEAN := TRUE;
  v_in_range      BOOLEAN := FALSE;
BEGIN
  FOR rec IN
    SELECT id, prev_hash, current_hash, performed_at
    FROM public.audit_log
    ORDER BY performed_at ASC, id ASC
  LOOP
    IF rec.id = p_from_id THEN v_in_range := TRUE; END IF;

    IF v_in_range THEN
      v_count := v_count + 1;
      IF v_prev_hash IS NOT NULL AND rec.prev_hash <> v_prev_hash THEN
        v_valid    := FALSE;
        v_broken   := rec.id;
        EXIT;
      END IF;
      v_prev_hash := rec.current_hash;
    END IF;

    IF rec.id = p_to_id THEN EXIT; END IF;
  END LOOP;

  RETURN QUERY SELECT v_valid, v_count, v_broken;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
