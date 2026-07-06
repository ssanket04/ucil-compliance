-- ============================================================
-- UCIL — 02_logic.sql   (RUN 2nd)
-- Helper functions · Trigger functions · Triggers · Utilities
-- ------------------------------------------------------------
-- Final reconciled versions. Key fixes baked in:
--   • recalculate_metrics() uses an explicit WHERE (supautils safe-update) — update14
--   • notify_on_evidence_change() is NULL-recipient safe — update12
--   • snapshot_control_history() no-op guard — update6
--   • make_gap_code_unique() de-dupes gap codes — update9
--   • anonymize_user / verify_audit_chain / generate_compliance_pack — update5/6/12
-- ============================================================

-- ── Role / domain helpers (used by RLS in 03_security.sql) ───
CREATE OR REPLACE FUNCTION public.get_user_role()
RETURNS TEXT AS $$ SELECT role FROM public.users WHERE id = auth.uid(); $$
LANGUAGE SQL SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION public.get_user_domain()
RETURNS TEXT AS $$ SELECT domain FROM public.users WHERE id = auth.uid(); $$
LANGUAGE SQL SECURITY DEFINER STABLE;

-- ── updated_at maintenance ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_users_updated_at      BEFORE UPDATE ON public.users              FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_controls_updated_at   BEFORE UPDATE ON public.controls           FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_evidence_updated_at   BEFORE UPDATE ON public.evidence           FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_gaps_updated_at       BEFORE UPDATE ON public.gaps               FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_regulatory_updated_at BEFORE UPDATE ON public.regulatory_changes FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_conflicts_updated_at  BEFORE UPDATE ON public.conflicts          FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER trg_queue_updated_at      BEFORE UPDATE ON public.sme_review_queue   FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ── Auto-create public profile on auth signup ────────────────
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
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Tamper-evident audit hash chain ──────────────────────────
CREATE OR REPLACE FUNCTION public.chain_audit_log()
RETURNS TRIGGER AS $$
DECLARE v_prev_hash TEXT; v_payload TEXT;
BEGIN
  SELECT current_hash INTO v_prev_hash FROM public.audit_log ORDER BY performed_at DESC, id DESC LIMIT 1;
  IF v_prev_hash IS NULL THEN v_prev_hash := 'GENESIS'; END IF;
  NEW.prev_hash := v_prev_hash;
  v_payload := coalesce(NEW.performed_by::text,'') || '|' || coalesce(NEW.action,'') || '|' ||
               coalesce(NEW.entity_type,'') || '|' || coalesce(NEW.entity_id::text,'') || '|' ||
               coalesce(NEW.new_values::text,'') || '|' || v_prev_hash;
  NEW.current_hash := encode(digest(v_payload, 'sha256'), 'hex');
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_chain_audit_log BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.chain_audit_log();

-- ── Evidence timeline auto-logging ───────────────────────────
CREATE OR REPLACE FUNCTION public.log_evidence_action()
RETURNS TRIGGER AS $$
DECLARE action_text TEXT; action_type TEXT;
BEGIN
  IF TG_OP = 'INSERT' THEN
    action_text := 'Evidence uploaded'; action_type := 'info';
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    CASE NEW.status
      WHEN 'Under Review' THEN action_text := 'Submitted for review';        action_type := 'info';
      WHEN 'Approved'     THEN action_text := 'Approved by Domain Head';      action_type := 'success';
      WHEN 'Rejected'     THEN action_text := 'Rejected — returned to owner'; action_type := 'danger';
      WHEN 'Reassigned'   THEN action_text := 'Reassigned to new owner';      action_type := 'warning';
      ELSE action_text := 'Status changed to ' || NEW.status;                 action_type := 'info';
    END CASE;
  ELSE RETURN NEW; END IF;
  INSERT INTO public.evidence_timeline (evidence_id, action, action_type, performed_by, performed_at)
  VALUES (NEW.id, action_text, action_type, auth.uid(), NOW());
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_evidence_timeline AFTER INSERT OR UPDATE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.log_evidence_action();

-- ── Generic audit logging ────────────────────────────────────
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
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_audit_controls AFTER INSERT OR UPDATE OR DELETE ON public.controls         FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_evidence AFTER INSERT OR UPDATE          ON public.evidence          FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_gaps     AFTER INSERT OR UPDATE          ON public.gaps              FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();
CREATE TRIGGER trg_audit_queue    AFTER UPDATE                    ON public.sme_review_queue  FOR EACH ROW EXECUTE FUNCTION public.log_to_audit();

-- ── Live metrics recalculation (WHERE clause = supautils-safe) ─
CREATE OR REPLACE FUNCTION public.recalculate_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_canonical INT; v_implemented INT; v_sme INT;
  v_ev_review INT; v_ev_pending INT; v_ev_reassigned INT;
  v_gaps INT; v_critical_gaps INT;
  v_fw INT; v_circ INT; v_intpol INT; v_total_sources INT;
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
  SELECT COUNT(*) INTO v_fw     FROM public.frameworks WHERE type = 'Framework'       AND status = 'Loaded';
  SELECT COUNT(*) INTO v_circ   FROM public.frameworks WHERE type = 'Circular'        AND status = 'Loaded';
  SELECT COUNT(*) INTO v_intpol FROM public.frameworks WHERE type = 'Internal Policy' AND status = 'Loaded';
  v_total_sources := v_fw + v_circ + v_intpol;
  SELECT COUNT(*) INTO v_total_maps    FROM public.control_framework_mappings;
  SELECT COUNT(*) INTO v_auto_approved FROM public.control_framework_mappings WHERE status = 'Auto-Approved';
  v_auto_rate  := CASE WHEN v_total_maps > 0 THEN ROUND((v_auto_approved::NUMERIC / v_total_maps) * 100, 2) ELSE 0 END;
  v_multiplier := CASE WHEN v_canonical  > 0 THEN ROUND((v_total_maps::NUMERIC / v_canonical), 2)          ELSE 1.0 END;

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
    internal_policies         = COALESCE(v_intpol,0),
    total_sources             = COALESCE(v_total_sources,0),
    ai_auto_approval_rate     = COALESCE(v_auto_rate,0),
    control_multiplier        = COALESCE(v_multiplier,1.0),
    total_mappings            = COALESCE(v_total_maps,0),
    last_calculated_at        = NOW()
  WHERE id IS NOT NULL;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_metrics_controls AFTER INSERT OR UPDATE          ON public.controls                   FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_evidence AFTER INSERT OR UPDATE          ON public.evidence                   FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_gaps     AFTER INSERT OR UPDATE OR DELETE ON public.gaps                      FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();
CREATE TRIGGER trg_metrics_mappings AFTER INSERT OR UPDATE          ON public.control_framework_mappings FOR EACH ROW EXECUTE FUNCTION public.recalculate_metrics();

-- ── Notifications on evidence status change (NULL-recipient safe) ─
CREATE OR REPLACE FUNCTION public.notify_on_evidence_change()
RETURNS TRIGGER AS $$
DECLARE v_owner UUID; v_head UUID; v_name TEXT; v_code TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  SELECT c.owner_id, c.domain_head_id, c.name, c.control_code
    INTO v_owner, v_head, v_name, v_code
  FROM public.controls c WHERE c.id = NEW.control_id;

  IF NEW.status = 'Under Review' AND OLD.status = 'Pending' AND v_head IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_head, 'Evidence uploaded', 'Evidence ready for review',
            COALESCE(v_code,'') || ' — ' || COALESCE(v_name,'') || ': evidence awaiting your review.', 'evidence', NEW.id);
  END IF;
  IF NEW.status = 'Approved' AND v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_owner, 'Evidence approved', 'Evidence approved',
            COALESCE(v_code,'') || ' — ' || COALESCE(v_name,'') || ': evidence approved.', 'evidence', NEW.id);
  END IF;
  IF NEW.status = 'Rejected' AND v_owner IS NOT NULL THEN
    INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
    VALUES (v_owner, 'Evidence rejected / returned', 'Evidence returned — action required',
            COALESCE(v_code,'') || ' — ' || COALESCE(v_name,'') || ': evidence rejected. Reason: ' ||
            COALESCE(NEW.rejection_reason,'See remarks.'), 'evidence', NEW.id);
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_evidence AFTER UPDATE ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_evidence_change();

-- ── Notifications on critical gap ────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_on_gap_change()
RETURNS TRIGGER AS $$
DECLARE v_ids UUID[]; v_uid UUID;
BEGIN
  IF (TG_OP = 'INSERT' OR OLD.severity != NEW.severity) AND NEW.severity = 'critical' THEN
    SELECT ARRAY_AGG(id) INTO v_ids FROM public.users WHERE role IN ('CISO','Compliance Lead');
    FOREACH v_uid IN ARRAY COALESCE(v_ids,'{}') LOOP
      INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
      VALUES (v_uid, 'Gap marked critical', 'Critical gap requires immediate action',
              NEW.gap_code || ': ' || LEFT(NEW.description,100), 'gaps', NEW.id);
    END LOOP;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_notify_gap AFTER INSERT OR UPDATE ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.notify_on_gap_change();

-- ── Control ↔ gap sync ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_control_to_gap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Failed' AND (TG_OP = 'INSERT' OR OLD.status != 'Failed') THEN
    INSERT INTO public.gaps (gap_code, clause_ref, severity, description, status)
    VALUES (NEW.control_code, 'CONTROL-FAILED', 'high',
            NEW.name || COALESCE(' — ' || NEW.status_reason, ''), 'Open')
    ON CONFLICT (gap_code) DO UPDATE
      SET status = 'Open', description = EXCLUDED.description, updated_at = NOW();
  END IF;
  IF OLD.status = 'Failed' AND NEW.status != 'Failed' THEN
    UPDATE public.gaps SET status = 'Resolved', resolved_at = NOW(), updated_at = NOW()
     WHERE gap_code = NEW.control_code AND status = 'Open';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_control_to_gap AFTER INSERT OR UPDATE OF status ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.sync_control_to_gap();

CREATE OR REPLACE FUNCTION public.sync_gap_to_control()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status IN ('Resolved','Accepted Risk') AND OLD.status = 'Open' THEN
    UPDATE public.controls SET status = 'Under Review',
           status_reason = 'Gap resolved — pending evidence review.', updated_at = NOW()
     WHERE control_code = NEW.gap_code AND status = 'Failed';
  END IF;
  IF NEW.status = 'Open' AND OLD.status != 'Open' THEN
    UPDATE public.controls SET status = 'Failed', status_reason = 'Gap re-opened.', updated_at = NOW()
     WHERE control_code = NEW.gap_code AND status != 'Failed';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_gap_to_control AFTER UPDATE OF status ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.sync_gap_to_control();

-- ── Evidence ↔ control status sync ───────────────────────────
CREATE OR REPLACE FUNCTION public.sync_evidence_to_control()
RETURNS TRIGGER AS $$
DECLARE v_control_id UUID; v_total INT; v_approved INT; v_rejected INT; v_inprogress INT; v_new_status TEXT;
BEGIN
  v_control_id := COALESCE(NEW.control_id, OLD.control_id);
  SELECT COUNT(*),
         COUNT(*) FILTER (WHERE status = 'Approved'),
         COUNT(*) FILTER (WHERE status = 'Rejected'),
         COUNT(*) FILTER (WHERE status IN ('Under Review','Reassigned','Pending'))
    INTO v_total, v_approved, v_rejected, v_inprogress
  FROM public.evidence WHERE control_id = v_control_id;

  IF v_total = 0 THEN RETURN NEW; END IF;
  IF v_rejected > 0        THEN v_new_status := 'Failed';
  ELSIF v_total = v_approved THEN v_new_status := 'Active';
  ELSE                          v_new_status := 'Under Review';
  END IF;

  UPDATE public.controls SET status = v_new_status, updated_at = NOW()
   WHERE id = v_control_id AND status != v_new_status;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_sync_evidence_to_control AFTER INSERT OR UPDATE OF status ON public.evidence
  FOR EACH ROW EXECUTE FUNCTION public.sync_evidence_to_control();

-- ── SME assignment expiry (72h) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_sme_expiry()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.assigned_to IS NOT NULL AND OLD.assigned_to IS DISTINCT FROM NEW.assigned_to THEN
    NEW.assigned_at := NOW();
    NEW.expires_at  := NOW() + INTERVAL '72 hours';
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_set_sme_expiry BEFORE UPDATE ON public.sme_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_sme_expiry();

-- ── Control posture history snapshot (no-op guard) ───────────
CREATE OR REPLACE FUNCTION public.snapshot_control_history()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status IS NOT DISTINCT FROM NEW.status
     AND OLD.confidence_score IS NOT DISTINCT FROM NEW.confidence_score THEN
    RETURN NEW;
  END IF;
  INSERT INTO public.control_history (control_id, status, confidence_score, changed_by, notes)
  VALUES (OLD.id, OLD.status, OLD.confidence_score, NULL,
          'Auto-snapshot: status changed from ' || coalesce(OLD.status,'—') || ' to ' || coalesce(NEW.status,'—'));
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_snapshot_control AFTER UPDATE ON public.controls
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_control_history();

-- ── Unique gap_code generation (prevents same-ms collisions) ─
CREATE OR REPLACE FUNCTION public.make_gap_code_unique()
RETURNS TRIGGER AS $$
DECLARE v_num INT := 1; v_code TEXT;
BEGIN
  v_code := NEW.gap_code;
  WHILE EXISTS (SELECT 1 FROM public.gaps WHERE gap_code = v_code) LOOP
    v_code := NEW.gap_code || '-' || v_num; v_num := v_num + 1;
  END LOOP;
  NEW.gap_code := v_code;
  RETURN NEW;
END; $$ LANGUAGE plpgsql;

CREATE TRIGGER trg_make_gap_code_unique BEFORE INSERT ON public.gaps
  FOR EACH ROW EXECUTE FUNCTION public.make_gap_code_unique();

-- ── Cascade domain-head / default-owner to controls ──────────
CREATE OR REPLACE FUNCTION public.cascade_domain_ownership()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.domain_head_id IS DISTINCT FROM OLD.domain_head_id THEN
    UPDATE public.controls SET domain_head_id = NEW.domain_head_id WHERE domain_id = NEW.id;
  END IF;
  IF NEW.default_owner_id IS DISTINCT FROM OLD.default_owner_id THEN
    UPDATE public.controls SET owner_id = NEW.default_owner_id WHERE domain_id = NEW.id AND owner_id IS NULL;
  END IF;
  RETURN NEW;
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_cascade_domain_ownership AFTER UPDATE ON public.domains
  FOR EACH ROW EXECUTE FUNCTION public.cascade_domain_ownership();

-- ============================================================
-- UTILITY / RPC FUNCTIONS
-- ============================================================

-- Reclaim stale SME assignments (called by cron)
CREATE OR REPLACE FUNCTION public.expire_stale_sme_assignments()
RETURNS void AS $$
BEGIN
  UPDATE public.sme_review_queue
     SET assigned_to = NULL, assigned_at = NULL, expires_at = NULL, status = 'Pending'
   WHERE status = 'Pending' AND assigned_to IS NOT NULL AND expires_at < NOW();
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- GDPR irreversible anonymisation
CREATE OR REPLACE FUNCTION public.anonymize_user(p_user_id UUID)
RETURNS void AS $$
DECLARE v_token TEXT;
BEGIN
  v_token := encode(gen_random_bytes(8), 'hex');
  UPDATE public.users SET full_name = '[REDACTED]', email = 'redacted-' || v_token || '@gdpr.invalid'
   WHERE id = p_user_id;
  UPDATE public.audit_log SET ip_address = '[REDACTED]', user_agent = '[REDACTED]'
   WHERE performed_by = p_user_id;
  UPDATE public.notifications SET message = '[REDACTED - GDPR erasure applied on ' || NOW()::DATE::TEXT || ']'
   WHERE recipient_id = p_user_id;
  INSERT INTO public.audit_log (performed_by, action, entity_type, entity_id, new_values)
  VALUES (NULL, 'gdpr_erasure', 'users', p_user_id, jsonb_build_object('token', v_token, 'erased_at', NOW()));
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- Bounded audit-chain verifier (used by Dashboard tamper check)
CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_from_ts TIMESTAMPTZ, p_to_ts TIMESTAMPTZ)
RETURNS TABLE(is_valid BOOLEAN, checked_count INT, broken_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_prev_hash TEXT := 'GENESIS'; v_count INT := 0; v_broken_at TIMESTAMPTZ := NULL; r RECORD;
BEGIN
  FOR r IN SELECT id, prev_hash, current_hash, performed_at FROM public.audit_log
           WHERE performed_at BETWEEN p_from_ts AND p_to_ts ORDER BY performed_at ASC, id ASC
  LOOP
    v_count := v_count + 1;
    IF v_count = 1 THEN v_prev_hash := COALESCE(r.prev_hash, 'GENESIS');
    ELSE
      IF r.prev_hash IS DISTINCT FROM v_prev_hash THEN
        v_broken_at := r.performed_at;
        RETURN QUERY SELECT FALSE, v_count, v_broken_at; RETURN;
      END IF;
    END IF;
    v_prev_hash := r.current_hash;
  END LOOP;
  RETURN QUERY SELECT TRUE, v_count, NULL::TIMESTAMPTZ;
END; $$;

-- Role-gated wrapper
CREATE OR REPLACE FUNCTION public.verify_audit_chain_safe(p_from_ts TIMESTAMPTZ, p_to_ts TIMESTAMPTZ)
RETURNS TABLE(is_valid BOOLEAN, checked_count INT, broken_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_role TEXT;
BEGIN
  SELECT role INTO v_role FROM public.users WHERE id = auth.uid();
  IF v_role NOT IN ('CISO','Admin','Auditor','Compliance Lead') THEN
    RAISE EXCEPTION 'Access denied: insufficient role to verify audit chain';
  END IF;
  RETURN QUERY SELECT * FROM public.verify_audit_chain(p_from_ts, p_to_ts);
END; $$;

-- SHA-256 signed compliance pack export
CREATE OR REPLACE FUNCTION public.generate_compliance_pack(p_tenant_id UUID, p_caller_id UUID DEFAULT NULL)
RETURNS JSONB AS $$
DECLARE v_caller_tenant UUID; v_caller_role TEXT; v_controls JSONB; v_mappings JSONB; v_evidence JSONB;
        v_pack JSONB; v_pack_hash TEXT;
BEGIN
  SELECT tenant_id, role INTO v_caller_tenant, v_caller_role FROM public.users WHERE id = p_caller_id;
  IF v_caller_role NOT IN ('CISO','Admin','Auditor') THEN
    IF v_caller_tenant IS DISTINCT FROM p_tenant_id THEN
      RAISE EXCEPTION 'Access denied: you can only generate compliance packs for your own tenant';
    END IF;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('control_code', c.control_code, 'name', c.name, 'status', c.status,
                                      'domain', d.name, 'confidence', c.confidence_score))
    INTO v_controls
  FROM public.controls c LEFT JOIN public.domains d ON c.domain_id = d.id
  WHERE c.tenant_id IS NOT DISTINCT FROM p_tenant_id AND c.status = 'Active';

  SELECT jsonb_agg(jsonb_build_object('control_id', cfm.control_id, 'framework', f.name,
                                      'clause_ref', cfm.clause_ref, 'confidence', cfm.confidence_score,
                                      'status', cfm.status))
    INTO v_mappings
  FROM public.control_framework_mappings cfm LEFT JOIN public.frameworks f ON cfm.framework_id = f.id
  WHERE cfm.tenant_id IS NOT DISTINCT FROM p_tenant_id;

  SELECT jsonb_agg(jsonb_build_object('control_code', c.control_code, 'file_name', e.file_name,
                                      'sha256_hash', e.sha256_hash, 'status', e.status,
                                      'ai_verdict', e.ai_verdict, 'upload_date', e.upload_date))
    INTO v_evidence
  FROM public.evidence e LEFT JOIN public.controls c ON e.control_id = c.id
  WHERE e.tenant_id IS NOT DISTINCT FROM p_tenant_id AND e.status IN ('Approved','Under Review');

  v_pack := jsonb_build_object('generated_at', NOW(), 'tenant_id', p_tenant_id, 'generated_by', p_caller_id,
                               'active_controls', coalesce(v_controls,'[]'::jsonb),
                               'framework_mappings', coalesce(v_mappings,'[]'::jsonb),
                               'evidence_files', coalesce(v_evidence,'[]'::jsonb));
  v_pack_hash := encode(digest(v_pack::text, 'sha256'), 'hex');
  RETURN v_pack || jsonb_build_object('pack_sha256', v_pack_hash);
END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── Seed default AI prompts (used by Edge Functions) ─────────
INSERT INTO public.ai_prompts (function_name, version, prompt_text, is_active) VALUES
('evidence-verdict', 'v1.0',
 'You are a compliance auditor reviewing evidence documents. Assess whether the uploaded evidence adequately proves that a compliance control is implemented. Respond ONLY with valid JSON: { "verdict": "Sufficient", "covered": [...], "missing": [...], "red_flags": [...], "detail": "...", "confidence": 0.91 }. verdict must be one of: "Sufficient", "Insufficient", "Partial".',
 TRUE),
('auto-mapping', 'v1.0',
 'You are a compliance mapping engine. Compare a new framework clause against multiple existing controls and find the best match. Respond ONLY with valid JSON: { "best_match_index": 2, "confidence": 0.91, "rationale": "...", "is_conflict": false, "conflict_note": "" }. best_match_index: 0-based index of best matching control, or -1 if no match. confidence: 0 to 1.',
 TRUE)
ON CONFLICT (function_name, version) DO NOTHING;
