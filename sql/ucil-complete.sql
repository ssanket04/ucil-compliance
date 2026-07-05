-- ============================================================
-- UCIL v3 — COMPLETE SQL (Run top to bottom in SQL Editor)
-- Covers: Schema → RLS → Triggers → Views → Seed Data
-- ============================================================


-- ── STEP 0: Extensions ───────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";


-- ============================================================
-- TABLES
-- ============================================================

-- 1. USERS
CREATE TABLE public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL CHECK (role IN ('Control Owner','Domain Head','Compliance Lead','CISO','Admin')),
  domain          TEXT,
  avatar_initials TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. FRAMEWORKS
CREATE TABLE public.frameworks (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  type             TEXT NOT NULL CHECK (type IN ('Framework','Circular','Internal Policy')),
  version          TEXT,
  issuer           TEXT,
  description      TEXT,
  source_url       TEXT,
  ingested_at      TIMESTAMPTZ,
  total_clauses    INT DEFAULT 0,
  satisfied_pct    NUMERIC(5,2) DEFAULT 0,
  partial_pct      NUMERIC(5,2) DEFAULT 0,
  missing_pct      NUMERIC(5,2) DEFAULT 0,
  status           TEXT DEFAULT 'Not Loaded' CHECK (status IN ('Not Loaded','Loaded','Processing','Error')),
  compliance_status TEXT DEFAULT 'Not Compliant' CHECK (compliance_status IN ('Compliant','Partially Compliant','Not Compliant','In progress')),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DOMAINS
CREATE TABLE public.domains (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name           TEXT NOT NULL UNIQUE,
  domain_head_id UUID REFERENCES public.users(id),
  description    TEXT,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 4. CONTROLS
CREATE TABLE public.controls (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_code     TEXT NOT NULL UNIQUE,
  name             TEXT NOT NULL,
  description      TEXT NOT NULL,
  canonical_text   TEXT,
  domain_id        UUID REFERENCES public.domains(id),
  owner_id         UUID REFERENCES public.users(id),
  domain_head_id   UUID REFERENCES public.users(id),
  status           TEXT DEFAULT 'Active' CHECK (status IN ('Active','Failed','Under Review','Updated','Rejected','Pending')),
  status_reason    TEXT,
  confidence_score NUMERIC(4,3),
  multiplier       NUMERIC(4,2),
  is_canonical     BOOLEAN DEFAULT FALSE,
  parent_control_id UUID REFERENCES public.controls(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CONTROL_FRAMEWORK_MAPPINGS
CREATE TABLE public.control_framework_mappings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id       UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  framework_id     UUID NOT NULL REFERENCES public.frameworks(id) ON DELETE CASCADE,
  clause_ref       TEXT NOT NULL,
  clause_text      TEXT,
  confidence_score NUMERIC(4,3),
  rationale        TEXT,
  status           TEXT DEFAULT 'Auto-Approved' CHECK (status IN ('Auto-Approved','SME-Approved','SME-Rejected','Pending-Review')),
  approved_by      UUID REFERENCES public.users(id),
  approved_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(control_id, framework_id, clause_ref)
);

-- 6. SME_REVIEW_QUEUE
CREATE TABLE public.sme_review_queue (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mapping_id       TEXT NOT NULL,
  control_id_a     UUID NOT NULL REFERENCES public.controls(id),
  control_id_b     UUID,
  framework_id     UUID REFERENCES public.frameworks(id),
  clause_ref       TEXT,
  confidence_score NUMERIC(4,3) NOT NULL,
  ai_rationale     TEXT,
  status           TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Approved','Rejected','Edited','Reassigned')),
  reviewed_by      UUID REFERENCES public.users(id),
  reviewed_at      TIMESTAMPTZ,
  justification    TEXT,
  assigned_to      UUID REFERENCES public.users(id),
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 7. GAPS
CREATE TABLE public.gaps (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gap_code             TEXT NOT NULL UNIQUE,
  framework_id         UUID REFERENCES public.frameworks(id),
  clause_ref           TEXT NOT NULL,
  clause_text          TEXT,
  severity             TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description          TEXT NOT NULL,
  why_critical         TEXT,
  impact_if_unresolved TEXT,
  benefit_if_resolved  TEXT,
  impact_category      TEXT[],
  status               TEXT DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Accepted Risk')),
  assigned_to          UUID REFERENCES public.users(id),
  target_date          DATE,
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 8. EVIDENCE
CREATE TABLE public.evidence (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id       UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  file_name        TEXT NOT NULL,
  file_path        TEXT NOT NULL,
  file_size        TEXT,
  file_type        TEXT,
  uploaded_by      UUID NOT NULL REFERENCES public.users(id),
  upload_date      TIMESTAMPTZ DEFAULT NOW(),
  status           TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Under Review','Approved','Rejected','Reassigned')),
  reviewed_by      UUID REFERENCES public.users(id),
  review_date      TIMESTAMPTZ,
  manual_remark    TEXT,
  ai_verdict       TEXT,
  ai_verdict_detail TEXT,
  ai_missing_elements TEXT,
  ai_red_flags     TEXT,
  observations     TEXT,
  rejection_reason TEXT,
  reassigned_to    UUID REFERENCES public.users(id),
  sha256_hash      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EVIDENCE_TIMELINE
CREATE TABLE public.evidence_timeline (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_id  UUID NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN ('info','warning','success','danger')),
  performed_by UUID REFERENCES public.users(id),
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT
);

-- 10. REGULATORY_CHANGES
CREATE TABLE public.regulatory_changes (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circular_id          TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  issuer               TEXT NOT NULL,
  issued_date          DATE,
  source_url           TEXT,
  file_path            TEXT,
  impacted_control_ids UUID[],
  unmatched_clauses    JSONB,
  total_impacted       INT DEFAULT 0,
  total_gaps_created   INT DEFAULT 0,
  status               TEXT DEFAULT 'Active' CHECK (status IN ('Active','In review','Remediated','Dismissed')),
  ai_impact_summary    TEXT,
  detected_by          TEXT DEFAULT 'Manual' CHECK (detected_by IN ('Manual','Web Scraper')),
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 11. CONFLICTS
CREATE TABLE public.conflicts (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conflict_code       TEXT NOT NULL UNIQUE,
  title               TEXT NOT NULL,
  framework_id_1      UUID REFERENCES public.frameworks(id),
  policy_ref_1        TEXT NOT NULL,
  requirement_1       TEXT NOT NULL,
  framework_id_2      UUID REFERENCES public.frameworks(id),
  policy_ref_2        TEXT NOT NULL,
  requirement_2       TEXT NOT NULL,
  affected_control_ids UUID[],
  status              TEXT DEFAULT 'Conflict Detected' CHECK (status IN ('Conflict Detected','Under Review','Resolved','Accepted')),
  partial_status      TEXT,
  explanation         TEXT,
  suggested_resolution TEXT,
  resolution_applied  TEXT,
  resolved_by         UUID REFERENCES public.users(id),
  resolved_at         TIMESTAMPTZ,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 12. NOTIFICATIONS
CREATE TABLE public.notifications (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id  UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trigger_event TEXT NOT NULL,
  title         TEXT NOT NULL,
  message       TEXT NOT NULL,
  related_page  TEXT,
  related_id    UUID,
  is_read       BOOLEAN DEFAULT FALSE,
  sent_via_email BOOLEAN DEFAULT FALSE,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- 13. AUDIT_LOG (immutable)
CREATE TABLE public.audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  performed_by UUID REFERENCES public.users(id),
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  old_values   JSONB,
  new_values   JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. SCAN_INFO
CREATE TABLE public.scan_info (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_type         TEXT NOT NULL CHECK (scan_type IN ('circular_scan','compliance_eval','scheduled_scrape')),
  status            TEXT NOT NULL CHECK (status IN ('up-to-date','pending','failed','running')),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  sources_checked   TEXT[],
  new_items_found   INT DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 15. METRICS (single row — auto-updated by triggers)
CREATE TABLE public.metrics (
  id                       UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unique_canonical         INT DEFAULT 0,
  implemented              INT DEFAULT 0,
  in_progress_sme          INT DEFAULT 0,
  in_progress_ev_review    INT DEFAULT 0,
  in_progress_ev_pending   INT DEFAULT 0,
  in_progress_ev_reassigned INT DEFAULT 0,
  open_gaps                INT DEFAULT 0,
  critical_gaps            INT DEFAULT 0,
  frameworks_ingested      INT DEFAULT 0,
  circulars_ingested       INT DEFAULT 0,
  total_sources            INT DEFAULT 0,
  ai_auto_approval_rate    NUMERIC(5,2) DEFAULT 0,
  control_multiplier       NUMERIC(4,2) DEFAULT 0,
  total_mappings           INT DEFAULT 0,
  last_calculated_at       TIMESTAMPTZ DEFAULT NOW()
);


-- ============================================================
-- VIEWS  (used directly by supabase-client.js)
-- ============================================================

-- v_controls_full: joined control with domain + owner names
CREATE OR REPLACE VIEW public.v_controls_full AS
SELECT
  c.id, c.control_code, c.name, c.description, c.canonical_text,
  c.status, c.status_reason, c.confidence_score, c.multiplier, c.is_canonical,
  d.name           AS domain_name,
  u_owner.full_name AS owner_name,
  u_head.full_name  AS domain_head_name,
  c.owner_id, c.domain_head_id, c.domain_id,
  c.created_at, c.updated_at
FROM public.controls c
LEFT JOIN public.domains  d       ON c.domain_id      = d.id
LEFT JOIN public.users    u_owner ON c.owner_id        = u_owner.id
LEFT JOIN public.users    u_head  ON c.domain_head_id  = u_head.id;

-- v_evidence_full: evidence with control + uploader names
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

-- v_latest_scans: most recent scan per type (used by dashboard scan widget)
CREATE OR REPLACE VIEW public.v_latest_scans AS
SELECT DISTINCT ON (scan_type)
  scan_type, status, completed_at, next_scheduled_at, new_items_found
FROM public.scan_info
ORDER BY scan_type, created_at DESC;

-- v_framework_coverage: framework list with mapping count (used by dashboard bars)
CREATE OR REPLACE VIEW public.v_framework_coverage AS
SELECT
  f.id, f.name, f.type, f.issuer, f.version,
  f.compliance_status, f.satisfied_pct, f.partial_pct, f.missing_pct,
  f.status AS load_status,
  COUNT(cfm.id) AS total_mappings
FROM public.frameworks f
LEFT JOIN public.control_framework_mappings cfm ON cfm.framework_id = f.id
GROUP BY f.id, f.name, f.type, f.issuer, f.version,
         f.compliance_status, f.satisfied_pct, f.partial_pct, f.missing_pct, f.status;


-- ============================================================
-- HELPER FUNCTIONS
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$
  SELECT role FROM public.users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_domain()
RETURNS TEXT AS $$
  SELECT domain FROM public.users WHERE id = auth.uid();
$$ LANGUAGE SQL SECURITY DEFINER STABLE;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

ALTER TABLE public.users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.frameworks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.controls                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_framework_mappings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sme_review_queue           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gaps                       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.evidence_timeline          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.regulatory_changes         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.conflicts                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.scan_info                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.metrics                    ENABLE ROW LEVEL SECURITY;

-- USERS
CREATE POLICY "users_read_own"        ON public.users FOR SELECT USING (id = auth.uid());
CREATE POLICY "users_read_all_admin"  ON public.users FOR SELECT USING (public.get_user_role() IN ('CISO','Compliance Lead','Admin'));
CREATE POLICY "users_update_own"      ON public.users FOR UPDATE USING (id = auth.uid());
CREATE POLICY "users_insert_admin"    ON public.users FOR INSERT WITH CHECK (public.get_user_role() IN ('Admin','CISO'));

-- FRAMEWORKS
CREATE POLICY "frameworks_read_all"   ON public.frameworks FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "frameworks_write_admin" ON public.frameworks FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- DOMAINS
CREATE POLICY "domains_read_all"      ON public.domains FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "domains_write_admin"   ON public.domains FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONTROLS
CREATE POLICY "controls_read_all"     ON public.controls FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "controls_update_owner" ON public.controls FOR UPDATE USING (owner_id = auth.uid() OR public.get_user_role() IN ('Domain Head','Compliance Lead','CISO','Admin'));
CREATE POLICY "controls_insert_admin" ON public.controls FOR INSERT WITH CHECK (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONTROL_FRAMEWORK_MAPPINGS
CREATE POLICY "mappings_read_all"     ON public.control_framework_mappings FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "mappings_write_admin"  ON public.control_framework_mappings FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- SME_REVIEW_QUEUE
CREATE POLICY "queue_read_all"        ON public.sme_review_queue FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "queue_update_reviewer" ON public.sme_review_queue FOR UPDATE USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin') OR assigned_to = auth.uid());
CREATE POLICY "queue_insert_system"   ON public.sme_review_queue FOR INSERT WITH CHECK (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- GAPS
CREATE POLICY "gaps_read_all"         ON public.gaps FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "gaps_write_admin"      ON public.gaps FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));
CREATE POLICY "gaps_update_assigned"  ON public.gaps FOR UPDATE USING (assigned_to = auth.uid());

-- EVIDENCE
CREATE POLICY "evidence_read_all"     ON public.evidence FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "evidence_insert_owner" ON public.evidence FOR INSERT WITH CHECK (uploaded_by = auth.uid() AND public.get_user_role() IN ('Control Owner','Compliance Lead','CISO','Admin'));
CREATE POLICY "evidence_update_roles" ON public.evidence FOR UPDATE USING (uploaded_by = auth.uid() OR reviewed_by = auth.uid() OR public.get_user_role() IN ('Domain Head','Compliance Lead','CISO','Admin'));

-- EVIDENCE_TIMELINE
CREATE POLICY "timeline_read_all"     ON public.evidence_timeline FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "timeline_insert_all"   ON public.evidence_timeline FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "timeline_no_delete"    ON public.evidence_timeline FOR DELETE USING (FALSE);

-- REGULATORY_CHANGES
CREATE POLICY "regulatory_read_all"   ON public.regulatory_changes FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "regulatory_write_admin" ON public.regulatory_changes FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONFLICTS
CREATE POLICY "conflicts_read_all"    ON public.conflicts FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "conflicts_write_admin" ON public.conflicts FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- NOTIFICATIONS
CREATE POLICY "notifications_read_own"    ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
CREATE POLICY "notifications_update_own"  ON public.notifications FOR UPDATE USING (recipient_id = auth.uid());
CREATE POLICY "notifications_insert_any"  ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- AUDIT_LOG
CREATE POLICY "audit_read_admin"      ON public.audit_log FOR SELECT USING (public.get_user_role() IN ('CISO','Compliance Lead','Admin'));
CREATE POLICY "audit_insert_all"      ON public.audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "audit_no_update"       ON public.audit_log FOR UPDATE USING (FALSE);
CREATE POLICY "audit_no_delete"       ON public.audit_log FOR DELETE USING (FALSE);

-- SCAN_INFO
CREATE POLICY "scan_read_all"         ON public.scan_info FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "scan_write_admin"      ON public.scan_info FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- METRICS
CREATE POLICY "metrics_read_all"      ON public.metrics FOR SELECT USING (auth.uid() IS NOT NULL);
CREATE POLICY "metrics_write_admin"   ON public.metrics FOR ALL USING (public.get_user_role() IN ('Admin','CISO','Compliance Lead'));


-- ============================================================
-- TRIGGERS
-- ============================================================

-- Auto updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at       BEFORE UPDATE ON public.users       FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Automatically create public profile on auth user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, full_name, email, role, avatar_initials)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'Compliance Lead'),
    UPPER(SUBSTRING(SPLIT_PART(NEW.email, '@', 1) FROM 1 FOR 2))
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
CREATE TRIGGER trg_controls_updated_at    BEFORE UPDATE ON public.controls    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_evidence_updated_at    BEFORE UPDATE ON public.evidence    FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_gaps_updated_at        BEFORE UPDATE ON public.gaps        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_regulatory_updated_at  BEFORE UPDATE ON public.regulatory_changes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_conflicts_updated_at   BEFORE UPDATE ON public.conflicts   FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_queue_updated_at       BEFORE UPDATE ON public.sme_review_queue FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- Auto evidence timeline logging
CREATE OR REPLACE FUNCTION public.log_evidence_action()
RETURNS TRIGGER AS $$
DECLARE action_text TEXT; action_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_text := 'Evidence uploaded'; action_type := 'info';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    CASE NEW.status
      WHEN 'Under Review' THEN action_text := 'Submitted for review';          action_type := 'info';
      WHEN 'Approved'     THEN action_text := 'Approved by Domain Head';        action_type := 'success';
      WHEN 'Rejected'     THEN action_text := 'Rejected — returned to owner';   action_type := 'danger';
      WHEN 'Reassigned'   THEN action_text := 'Reassigned to new owner';        action_type := 'warning';
      ELSE                     action_text := 'Status changed to ' || NEW.status; action_type := 'info';
    END CASE;
  ELSE RETURN NEW; END IF;
  INSERT INTO public.evidence_timeline (evidence_id, action, action_type, performed_by, performed_at)
  VALUES (NEW.id, action_text, action_type, auth.uid(), NOW());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_evidence_timeline
  AFTER INSERT OR UPDATE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.log_evidence_action();

-- Auto audit log
CREATE OR REPLACE FUNCTION public.log_to_audit()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.audit_log (performed_by, action, entity_type, entity_id, old_values, new_values, performed_at)
  VALUES (
    auth.uid(), TG_TABLE_NAME || '_' || TG_OP, TG_TABLE_NAME,
    CASE WHEN TG_OP = 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE WHEN TG_OP != 'INSERT' THEN to_jsonb(OLD) ELSE NULL END,
    CASE WHEN TG_OP != 'DELETE' THEN to_jsonb(NEW) ELSE NULL END,
    NOW()
  );
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_controls  AFTER INSERT OR UPDATE OR DELETE ON public.controls       FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_evidence  AFTER INSERT OR UPDATE          ON public.evidence        FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_gaps      AFTER INSERT OR UPDATE          ON public.gaps            FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_queue     AFTER UPDATE                    ON public.sme_review_queue FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();

-- Auto recalculate metrics (keeps metrics table live at all times)
CREATE OR REPLACE FUNCTION public.recalculate_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_canonical INT; v_implemented INT; v_sme INT;
  v_ev_review INT; v_ev_pending INT; v_ev_reassigned INT;
  v_gaps INT; v_critical_gaps INT;
  v_fw INT; v_circ INT; v_total_sources INT;
  v_total_maps INT; v_auto_approved INT;
  v_auto_rate NUMERIC; v_multiplier NUMERIC;
BEGIN
  SELECT COUNT(*) INTO v_canonical   FROM public.controls WHERE is_canonical = TRUE;
  SELECT COUNT(*) INTO v_implemented FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE;
  SELECT COUNT(*) INTO v_sme         FROM public.sme_review_queue WHERE status = 'Pending';
  SELECT COUNT(*) INTO v_ev_review   FROM public.evidence WHERE status = 'Under Review';
  SELECT COUNT(*) INTO v_ev_pending  FROM public.evidence WHERE status = 'Pending';
  SELECT COUNT(*) INTO v_ev_reassigned FROM public.evidence WHERE status = 'Reassigned';
  SELECT COUNT(*) INTO v_gaps        FROM public.gaps WHERE status = 'Open';
  SELECT COUNT(*) INTO v_critical_gaps FROM public.gaps WHERE status = 'Open' AND severity = 'critical';
  SELECT COUNT(*) INTO v_fw   FROM public.frameworks WHERE type = 'Framework' AND status = 'Loaded';
  SELECT COUNT(*) INTO v_circ FROM public.frameworks WHERE type = 'Circular'  AND status = 'Loaded';
  v_total_sources := v_fw + v_circ + (SELECT COUNT(*) FROM public.frameworks WHERE type = 'Internal Policy' AND status = 'Loaded');
  SELECT COUNT(*) INTO v_total_maps    FROM public.control_framework_mappings;
  SELECT COUNT(*) INTO v_auto_approved FROM public.control_framework_mappings WHERE status = 'Auto-Approved';
  v_auto_rate  := CASE WHEN v_total_maps > 0 THEN ROUND((v_auto_approved::NUMERIC / v_total_maps) * 100, 2) ELSE 0 END;
  SELECT ROUND(AVG(multiplier),2) INTO v_multiplier FROM public.controls WHERE multiplier IS NOT NULL;

  UPDATE public.metrics SET
    unique_canonical          = COALESCE(v_canonical,0),
    implemented               = COALESCE(v_implemented,0),
    in_progress_sme           = COALESCE(v_sme,0),
    in_progress_ev_review     = COALESCE(v_ev_review,0),
    in_progress_ev_pending    = COALESCE(v_ev_pending,0),
    in_progress_ev_reassigned = COALESCE(v_ev_reassigned,0),
    open_gaps                 = COALESCE(v_gaps,0),
    critical_gaps             = COALESCE(v_critical_gaps,0),
    frameworks_ingested       = COALESCE(v_fw,0),
    circulars_ingested        = COALESCE(v_circ,0),
    total_sources             = COALESCE(v_total_sources,0),
    ai_auto_approval_rate     = COALESCE(v_auto_rate,0),
    control_multiplier        = COALESCE(v_multiplier,0),
    total_mappings            = COALESCE(v_total_maps,0),
    last_calculated_at        = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_metrics_controls  AFTER INSERT OR UPDATE ON public.controls                FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_evidence  AFTER INSERT OR UPDATE ON public.evidence                FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_gaps      AFTER INSERT OR UPDATE OR DELETE ON public.gaps          FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_mappings  AFTER INSERT OR UPDATE ON public.control_framework_mappings FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();

-- Auto notify on evidence status change
CREATE OR REPLACE FUNCTION public.notify_on_evidence_change()
RETURNS TRIGGER AS $$
DECLARE v_owner UUID; v_head UUID; v_name TEXT; v_code TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT c.owner_id, c.domain_head_id, c.name, c.control_code
  INTO v_owner, v_head, v_name, v_code
  FROM public.controls c WHERE c.id = NEW.control_id;

  IF NEW.status = 'Under Review' AND OLD.status = 'Pending' THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_head, 'Evidence uploaded', 'Evidence ready for review', v_code || ' — ' || v_name || ': evidence awaiting your review.', 'evidence', NEW.id);
  END IF;
  IF NEW.status = 'Approved' THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_owner, 'Evidence approved', 'Evidence approved', v_code || ' — ' || v_name || ': evidence approved.', 'evidence', NEW.id);
  END IF;
  IF NEW.status = 'Rejected' THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_owner, 'Evidence rejected / returned', 'Evidence returned — action required', v_code || ' — ' || v_name || ': evidence rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'See remarks.'), 'evidence', NEW.id);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_evidence AFTER UPDATE ON public.evidence FOR EACH ROW EXECUTE FUNCTION public.notify_on_evidence_change();

-- Auto notify on critical gap
CREATE OR REPLACE FUNCTION public.notify_on_gap_change()
RETURNS TRIGGER AS $$
DECLARE v_ids UUID[]; v_uid UUID;
BEGIN
  IF (TG_OP = 'INSERT' OR OLD.severity != NEW.severity) AND NEW.severity = 'critical' THEN
    SELECT ARRAY_AGG(id) INTO v_ids FROM public.users WHERE role IN ('CISO','Compliance Lead');
    FOREACH v_uid IN ARRAY COALESCE(v_ids,'{}') LOOP
      INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
      VALUES (v_uid, 'Gap marked critical', 'Critical gap requires immediate action', NEW.gap_code || ': ' || LEFT(NEW.description,100), 'gaps', NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_gap AFTER INSERT OR UPDATE ON public.gaps FOR EACH ROW EXECUTE FUNCTION public.notify_on_gap_change();


-- ============================================================
-- SYNC: Failed controls ↔ gaps table
-- A control marked Failed auto-creates an Open gap (gap_code = control_code)
-- A gap marked Resolved/Accepted Risk auto-sets control back to Under Review
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_control_to_gap()
RETURNS TRIGGER AS $$
BEGIN
  -- When a control is set to Failed, ensure a gap row exists
  IF NEW.status = 'Failed' AND (TG_OP = 'INSERT' OR OLD.status != 'Failed') THEN
    INSERT INTO public.gaps (gap_code, clause_ref, severity, description, status)
    VALUES (
      NEW.control_code,
      'CONTROL-FAILED',
      'high',
      NEW.name || COALESCE(' — ' || NEW.status_reason, ''),
      'Open'
    )
    ON CONFLICT (gap_code) DO UPDATE
      SET status = 'Open',
          description = EXCLUDED.description,
          updated_at = NOW();
  END IF;

  -- When a control moves away from Failed, resolve its gap
  IF OLD.status = 'Failed' AND NEW.status != 'Failed' THEN
    UPDATE public.gaps
    SET status = 'Resolved', resolved_at = NOW(), updated_at = NOW()
    WHERE gap_code = NEW.control_code AND status = 'Open';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_control_to_gap
  AFTER INSERT OR UPDATE OF status ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.sync_control_to_gap();


CREATE OR REPLACE FUNCTION public.sync_gap_to_control()
RETURNS TRIGGER AS $$
BEGIN
  -- When a gap is Resolved or Accepted Risk, move the control out of Failed
  IF NEW.status IN ('Resolved', 'Accepted Risk') AND OLD.status = 'Open' THEN
    UPDATE public.controls
    SET status = 'Under Review', status_reason = 'Gap resolved — pending evidence review.', updated_at = NOW()
    WHERE control_code = NEW.gap_code AND status = 'Failed';
  END IF;

  -- When a gap is re-opened, mark the control Failed again
  IF NEW.status = 'Open' AND OLD.status != 'Open' THEN
    UPDATE public.controls
    SET status = 'Failed', status_reason = 'Gap re-opened.', updated_at = NOW()
    WHERE control_code = NEW.gap_code AND status != 'Failed';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_gap_to_control
  AFTER UPDATE OF status ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.sync_gap_to_control();


-- ============================================================
-- SYNC: Evidence approved ↔ control status
-- When ALL evidence for a control is Approved → control becomes Active
-- When any evidence is Rejected → control becomes Failed
-- When any evidence is Under Review/Reassigned/Pending → control becomes Under Review
-- ============================================================

CREATE OR REPLACE FUNCTION public.sync_evidence_to_control()
RETURNS TRIGGER AS $$
DECLARE
  v_control_id UUID;
  v_total      INT;
  v_approved   INT;
  v_rejected   INT;
  v_inprogress INT;
  v_new_status TEXT;
BEGIN
  v_control_id := COALESCE(NEW.control_id, OLD.control_id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'Approved'),
    COUNT(*) FILTER (WHERE status = 'Rejected'),
    COUNT(*) FILTER (WHERE status IN ('Under Review','Reassigned','Pending'))
  INTO v_total, v_approved, v_rejected, v_inprogress
  FROM public.evidence
  WHERE control_id = v_control_id;

  IF v_total = 0 THEN
    RETURN NEW;
  END IF;

  IF v_rejected > 0 THEN
    v_new_status := 'Failed';
  ELSIF v_total = v_approved THEN
    v_new_status := 'Active';
  ELSE
    v_new_status := 'Under Review';
  END IF;

  UPDATE public.controls
  SET status = v_new_status, updated_at = NOW()
  WHERE id = v_control_id AND status != v_new_status;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_evidence_to_control
  AFTER INSERT OR UPDATE OF status ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.sync_evidence_to_control();


-- ============================================================
-- SEED DATA  (real starting data — not dummy)
-- ============================================================

-- One metrics row (triggers will keep it live from here)
INSERT INTO public.metrics DEFAULT VALUES;

-- Frameworks
INSERT INTO public.frameworks (name, type, version, issuer, satisfied_pct, partial_pct, missing_pct, compliance_status, status) VALUES
('ISO 27001',       'Framework',       '2022', 'ISO',     88, 0,  12, 'Compliant',           'Loaded'),
('SOX',             'Framework',       '2024', 'PCAOB',   91, 0,  9,  'Compliant',           'Loaded'),
('NIST CSF',        'Framework',       '2.0',  'NIST',    72, 10, 18, 'Partially Compliant', 'Loaded'),
('RBI CSF',         'Circular',        'v2',   'RBI',     60, 16, 24, 'Partially Compliant', 'Loaded'),
('PCI-DSS',         'Framework',       '4.0',  'PCI SSC', 55, 15, 30, 'Not Compliant',       'Loaded'),
('COBIT',           'Framework',       '2019', 'ISACA',   50, 14, 36, 'Not Compliant',       'Loaded'),
('Internal Policy', 'Internal Policy', 'v3',   'Internal',90, 5,  5,  'Compliant',           'Loaded');

-- Domains
INSERT INTO public.domains (name, description) VALUES
('Access Control',    'Controls related to user access, identity, and privilege management'),
('Privileged Access', 'Controls for privileged and administrative account management'),
('Incident Mgmt',     'Controls for incident detection, response, and recovery'),
('Data Protection',   'Controls for data encryption, classification, and retention'),
('Change Mgmt',       'Controls for change management and configuration control'),
('Risk Management',   'Controls for risk assessment and treatment'),
('Vendor Management', 'Controls for third-party and vendor risk');

-- Scan info
INSERT INTO public.scan_info (scan_type, status, completed_at, next_scheduled_at) VALUES
('circular_scan',    'up-to-date', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '14 hours'),
('compliance_eval',  'up-to-date', NOW() - INTERVAL '1 day',    NOW() + INTERVAL '23 hours'),
('scheduled_scrape', 'pending',    NULL,                          NOW() + INTERVAL '14 hours');

-- Regulatory changes
INSERT INTO public.regulatory_changes (circular_id, title, issuer, issued_date, total_impacted, total_gaps_created, status, detected_by) VALUES
('RBI/2024-25/112', 'Cyber Resilience Framework Update',  'RBI',     '2025-04-12', 23, 3, 'Active',    'Web Scraper'),
('PCI-DSS-v4.0.1',  'PCI-DSS v4.0.1 Section 6 Update',   'PCI SSC', '2025-03-01', 11, 0, 'Remediated','Manual'),
('ISO-27001-2022',  'ISO 27001:2022 Annex A Update',      'ISO',     '2025-01-15', 8,  0, 'Remediated','Manual');

-- Conflicts
INSERT INTO public.conflicts
  (conflict_code, title, policy_ref_1, requirement_1, policy_ref_2, requirement_2, status, partial_status, explanation, suggested_resolution)
VALUES
(
  'CONF-001', 'Data retention period conflict',
  'ISO 27001 A.8.10', '3-year retention minimum',
  'RBI CSF 5.4.2',    '5-year retention minimum',
  'Conflict Detected',
  'Compliant with ISO 27001, Non-compliant with RBI CSF',
  'ISO requires minimum 3-year data retention while RBI mandates 5 years. Internal policy currently aligned to 3 years, creating a compliance gap against RBI.',
  'Align internal policy to 5-year retention to satisfy both frameworks simultaneously.'
),
(
  'CONF-002', 'BCP testing frequency conflict',
  'ISO 27001 A.17.1', 'Annual BCP test',
  'RBI CSF 6.3',      'Biannual BCP test',
  'Conflict Detected',
  'Compliant with ISO 27001, Non-compliant with RBI CSF',
  'ISO requires annual BCP testing. RBI requires biannual (every 6 months). Current practice is annual only.',
  'Increase BCP testing to biannual cadence to satisfy RBI without violating ISO.'
);

-- Gaps (matches DATA.gaps in data.js exactly)
INSERT INTO public.gaps (gap_code, clause_ref, severity, description, why_critical, impact_if_unresolved, benefit_if_resolved, impact_category, status) VALUES
('CC-0287', 'COBIT-BAI06', 'critical', 'Change management approval — ITSM audit trail export failed during last compliance run',
 'Critical control gap identified in unified library. ITSM tool integration failure prevents audit trail generation.',
 'Regulatory penalty, supervisory observation letter, reputational damage.',
 'Closes critical gap; demonstrates proactive cyber governance to regulators.',
 ARRAY['Financial','Reputational'], 'Open'),

('CC-0400', 'RBI-4.2.1', 'critical', 'Cyber crisis management plan — no documented plan exists for cyber-specific crisis scenarios',
 'RBI mandates a documented cyber crisis management plan. No current plan exists, creating a direct regulatory gap.',
 'RBI supervisory action, potential enforcement notice, inability to respond to cyber crisis.',
 'Closes critical RBI requirement; enables structured incident response.',
 ARRAY['Regulatory','Reputational'], 'Open'),

('CC-0401', 'NIST-RS.CO-3', 'high', 'Incident communication plan — no formal communication protocol for security incidents',
 'No documented protocol exists for communicating security incidents to internal and external stakeholders.',
 'Delayed response, reputational damage, potential regulatory non-compliance.',
 'Reduces incident response time; demonstrates mature security governance.',
 ARRAY['Reputational','Non-financial'], 'Open'),

('CC-0402', 'PCI-DSS-6.3.3', 'high', 'Patch management SLA — no formal SLA defined for critical vulnerability remediation',
 'PCI-DSS 6.3.3 requires defined timelines for applying security patches. No SLA currently documented.',
 'PCI-DSS non-compliance, increased vulnerability exposure, potential data breach.',
 'Reduces attack surface; demonstrates PCI compliance to assessors.',
 ARRAY['Financial','Regulatory'], 'Open'),

('CC-0403', 'ISO-A.8.16', 'high', 'Monitoring activities — no automated alerting for anomalous access patterns',
 'ISO 27001 A.8.16 requires monitoring and alerting capabilities. Current monitoring is manual and incomplete.',
 'Delayed detection of security incidents, increased breach impact.',
 'Enables rapid detection of threats; reduces mean time to respond.',
 ARRAY['Non-financial','Reputational'], 'Open'),

('CC-0404', 'COBIT-DSS05', 'medium', 'Vendor access review — no periodic review of third-party system access',
 'Vendor accounts are not periodically reviewed for appropriateness, creating privilege accumulation risk.',
 'Unauthorized access by former vendor personnel, potential data exposure.',
 'Reduces third-party risk; demonstrates vendor governance to auditors.',
 ARRAY['Financial','Non-financial'], 'Open'),

('CC-0405', 'RBI-7.2', 'low', 'Security awareness training — training completion not tracked centrally',
 'RBI requires documented evidence of security awareness training. No central tracking exists.',
 'Unable to demonstrate regulatory compliance during supervisory review.',
 'Closes audit finding; demonstrates workforce security awareness.',
 ARRAY['Non-financial'], 'Open');

-- ============================================================
-- YOUR USER RECORD
-- Run this AFTER creating your account in Supabase Auth
-- Replace the UUID with your actual auth user ID
-- ============================================================
-- INSERT INTO public.users (id, full_name, email, role, domain, avatar_initials)
-- VALUES (
--   'YOUR-AUTH-USER-UUID-HERE',
--   'Sanket Sondawle',
--   'sanket1@gmail.com',
--   'Compliance Lead',
--   NULL,
--   'SS'
-- );
