-- ============================================================
-- UCIL — 03_security.sql   (RUN 3rd)
-- Row-Level Security · Storage bucket + policies · Grants
-- ------------------------------------------------------------
-- Final policy set. Read access restored for controls / evidence /
-- gaps (the update12 regression) and evidence INSERT re-enabled — update14.
-- Depends on public.get_user_role() from 02_logic.sql.
-- ============================================================

-- ── Enable RLS on every application table ────────────────────
ALTER TABLE public.users                      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenants                    ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE public.control_history            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_prompts                 ENABLE ROW LEVEL SECURITY;

-- USERS
DROP POLICY IF EXISTS "users_read_system" ON public.users;
CREATE POLICY "users_read_system" ON public.users FOR SELECT
  USING (id = auth.uid() OR public.get_user_role() IN ('CISO','Compliance Lead','Admin','Auditor'));
DROP POLICY IF EXISTS "users_update_own" ON public.users;
CREATE POLICY "users_update_own"   ON public.users FOR UPDATE USING (id = auth.uid());
DROP POLICY IF EXISTS "users_insert_admin" ON public.users;
CREATE POLICY "users_insert_admin" ON public.users FOR INSERT WITH CHECK (public.get_user_role() IN ('Admin','CISO'));

-- TENANTS
DROP POLICY IF EXISTS "tenants_read_auth" ON public.tenants;
CREATE POLICY "tenants_read_auth"  ON public.tenants FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "tenants_write_admin" ON public.tenants;
CREATE POLICY "tenants_write_admin" ON public.tenants FOR ALL USING (public.get_user_role() IN ('CISO','Admin'));

-- FRAMEWORKS
DROP POLICY IF EXISTS "frameworks_read_all" ON public.frameworks;
CREATE POLICY "frameworks_read_all"   ON public.frameworks FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "frameworks_write_admin" ON public.frameworks;
CREATE POLICY "frameworks_write_admin" ON public.frameworks FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- DOMAINS
DROP POLICY IF EXISTS "domains_read_all" ON public.domains;
CREATE POLICY "domains_read_all"    ON public.domains FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "domains_write_admin" ON public.domains;
CREATE POLICY "domains_write_admin" ON public.domains FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONTROLS
DROP POLICY IF EXISTS "controls_read_all" ON public.controls;
CREATE POLICY "controls_read_all"     ON public.controls FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "controls_update_owner" ON public.controls;
CREATE POLICY "controls_update_owner" ON public.controls FOR UPDATE
  USING (owner_id = auth.uid() OR public.get_user_role() IN ('Domain Head','Compliance Lead','CISO','Admin'));
DROP POLICY IF EXISTS "controls_insert_admin" ON public.controls;
CREATE POLICY "controls_insert_admin" ON public.controls FOR INSERT
  WITH CHECK (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONTROL_FRAMEWORK_MAPPINGS
DROP POLICY IF EXISTS "mappings_read_all" ON public.control_framework_mappings;
CREATE POLICY "mappings_read_all"    ON public.control_framework_mappings FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "mappings_write_admin" ON public.control_framework_mappings;
CREATE POLICY "mappings_write_admin" ON public.control_framework_mappings FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- SME_REVIEW_QUEUE
DROP POLICY IF EXISTS "queue_read_all" ON public.sme_review_queue;
CREATE POLICY "queue_read_all"        ON public.sme_review_queue FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "queue_update_reviewer" ON public.sme_review_queue;
CREATE POLICY "queue_update_reviewer" ON public.sme_review_queue FOR UPDATE
  USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin') OR assigned_to = auth.uid());
DROP POLICY IF EXISTS "queue_insert_system" ON public.sme_review_queue;
CREATE POLICY "queue_insert_system"   ON public.sme_review_queue FOR INSERT
  WITH CHECK (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- GAPS
DROP POLICY IF EXISTS "gaps_read_all" ON public.gaps;
CREATE POLICY "gaps_read_all"        ON public.gaps FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "gaps_write_admin" ON public.gaps;
CREATE POLICY "gaps_write_admin"     ON public.gaps FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));
DROP POLICY IF EXISTS "gaps_update_assigned" ON public.gaps;
CREATE POLICY "gaps_update_assigned" ON public.gaps FOR UPDATE USING (assigned_to = auth.uid());

-- EVIDENCE
DROP POLICY IF EXISTS "evidence_read_all" ON public.evidence;
CREATE POLICY "evidence_read_all"     ON public.evidence FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "evidence_insert_owner" ON public.evidence;
CREATE POLICY "evidence_insert_owner" ON public.evidence FOR INSERT
  WITH CHECK (uploaded_by = auth.uid() AND public.get_user_role() IN ('Control Owner','Compliance Lead','CISO','Admin'));
DROP POLICY IF EXISTS "evidence_update_roles" ON public.evidence;
CREATE POLICY "evidence_update_roles" ON public.evidence FOR UPDATE
  USING (uploaded_by = auth.uid() OR reviewed_by = auth.uid() OR public.get_user_role() IN ('Domain Head','Compliance Lead','CISO','Admin'));

-- EVIDENCE_TIMELINE
DROP POLICY IF EXISTS "timeline_read_all" ON public.evidence_timeline;
CREATE POLICY "timeline_read_all"   ON public.evidence_timeline FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "timeline_insert_all" ON public.evidence_timeline;
CREATE POLICY "timeline_insert_all" ON public.evidence_timeline FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "timeline_no_delete" ON public.evidence_timeline;
CREATE POLICY "timeline_no_delete"  ON public.evidence_timeline FOR DELETE USING (FALSE);

-- REGULATORY_CHANGES
DROP POLICY IF EXISTS "regulatory_read_all" ON public.regulatory_changes;
CREATE POLICY "regulatory_read_all"   ON public.regulatory_changes FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "regulatory_write_admin" ON public.regulatory_changes;
CREATE POLICY "regulatory_write_admin" ON public.regulatory_changes FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- CONFLICTS
DROP POLICY IF EXISTS "conflicts_read_all" ON public.conflicts;
CREATE POLICY "conflicts_read_all"    ON public.conflicts FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "conflicts_write_admin" ON public.conflicts;
CREATE POLICY "conflicts_write_admin" ON public.conflicts FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- NOTIFICATIONS
DROP POLICY IF EXISTS "notifications_read_own" ON public.notifications;
CREATE POLICY "notifications_read_own"   ON public.notifications FOR SELECT USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_update_own" ON public.notifications;
CREATE POLICY "notifications_update_own" ON public.notifications FOR UPDATE USING (recipient_id = auth.uid());
DROP POLICY IF EXISTS "notifications_insert_any" ON public.notifications;
CREATE POLICY "notifications_insert_any" ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

-- AUDIT_LOG (immutable, admin/auditor read only)
DROP POLICY IF EXISTS "audit_read_admin" ON public.audit_log;
CREATE POLICY "audit_read_admin" ON public.audit_log FOR SELECT
  USING (public.get_user_role() IN ('CISO','Compliance Lead','Admin','Auditor'));
DROP POLICY IF EXISTS "audit_insert_all" ON public.audit_log;
CREATE POLICY "audit_insert_all" ON public.audit_log FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "audit_no_update" ON public.audit_log;
CREATE POLICY "audit_no_update"  ON public.audit_log FOR UPDATE USING (FALSE);
DROP POLICY IF EXISTS "audit_no_delete" ON public.audit_log;
CREATE POLICY "audit_no_delete"  ON public.audit_log FOR DELETE USING (FALSE);

-- SCAN_INFO
DROP POLICY IF EXISTS "scan_read_all" ON public.scan_info;
CREATE POLICY "scan_read_all"    ON public.scan_info FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "scan_write_admin" ON public.scan_info;
CREATE POLICY "scan_write_admin" ON public.scan_info FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- METRICS
DROP POLICY IF EXISTS "metrics_read_all" ON public.metrics;
CREATE POLICY "metrics_read_all"  ON public.metrics FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "metrics_write_admin" ON public.metrics;
CREATE POLICY "metrics_write_admin" ON public.metrics FOR ALL USING (public.get_user_role() IN ('Admin','CISO','Compliance Lead'));

-- CONTROL_HISTORY
DROP POLICY IF EXISTS "ctrl_history_read" ON public.control_history;
CREATE POLICY "ctrl_history_read"      ON public.control_history FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ctrl_history_no_delete" ON public.control_history;
CREATE POLICY "ctrl_history_no_delete" ON public.control_history FOR DELETE USING (FALSE);

-- AI_PROMPTS
DROP POLICY IF EXISTS "ai_prompts_read" ON public.ai_prompts;
CREATE POLICY "ai_prompts_read"  ON public.ai_prompts FOR SELECT USING (auth.uid() IS NOT NULL);
DROP POLICY IF EXISTS "ai_prompts_write" ON public.ai_prompts;
CREATE POLICY "ai_prompts_write" ON public.ai_prompts FOR ALL USING (public.get_user_role() IN ('Compliance Lead','CISO','Admin'));

-- ── Function execution grants ────────────────────────────────
GRANT EXECUTE ON FUNCTION public.verify_audit_chain_safe(TIMESTAMPTZ, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_compliance_pack(UUID, UUID)              TO authenticated;

-- ============================================================
-- STORAGE — private evidence bucket + access policies
-- ============================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('evidence-files','evidence-files', false, 52428800,
  ARRAY['application/pdf',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/plain'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Allow authenticated upload to evidence-files" ON storage.objects;
CREATE POLICY "Allow authenticated upload to evidence-files" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'evidence-files');

DROP POLICY IF EXISTS "Allow authenticated read from evidence-files" ON storage.objects;
CREATE POLICY "Allow authenticated read from evidence-files" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'evidence-files');
