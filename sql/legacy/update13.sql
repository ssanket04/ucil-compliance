-- ============================================================
-- UCIL UPDATE 13 — PERFORMANCE INDEXES & INTEGRITY CASCADES
-- ============================================================
-- Run AFTER: update12.sql
-- Purpose: Resolves performance bottlenecks (table scans) and
--          user deletion integrity bugs in the database layer.
-- ============================================================

-- ── A. ENFORCE USER PURGE & CASCADING INTEGRITY ON DELETE ───────

-- 1. Domains head fkey
ALTER TABLE public.domains 
  DROP CONSTRAINT IF EXISTS domains_domain_head_id_fkey,
  ADD CONSTRAINT domains_domain_head_id_fkey FOREIGN KEY (domain_head_id) REFERENCES public.users(id) ON DELETE SET NULL;

-- 2. Controls relations
ALTER TABLE public.controls
  DROP CONSTRAINT IF EXISTS controls_domain_id_fkey,
  DROP CONSTRAINT IF EXISTS controls_owner_id_fkey,
  DROP CONSTRAINT IF EXISTS controls_domain_head_id_fkey,
  DROP CONSTRAINT IF EXISTS controls_parent_control_id_fkey,
  ADD CONSTRAINT controls_domain_id_fkey FOREIGN KEY (domain_id) REFERENCES public.domains(id) ON DELETE SET NULL,
  ADD CONSTRAINT controls_owner_id_fkey FOREIGN KEY (owner_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT controls_domain_head_id_fkey FOREIGN KEY (domain_head_id) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT controls_parent_control_id_fkey FOREIGN KEY (parent_control_id) REFERENCES public.controls(id) ON DELETE SET NULL;

-- 3. Control mappings
ALTER TABLE public.control_framework_mappings
  DROP CONSTRAINT IF EXISTS control_framework_mappings_control_id_fkey,
  DROP CONSTRAINT IF EXISTS control_framework_mappings_framework_id_fkey,
  DROP CONSTRAINT IF EXISTS control_framework_mappings_approved_by_fkey,
  ADD CONSTRAINT control_framework_mappings_control_id_fkey FOREIGN KEY (control_id) REFERENCES public.controls(id) ON DELETE CASCADE,
  ADD CONSTRAINT control_framework_mappings_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES public.frameworks(id) ON DELETE CASCADE,
  ADD CONSTRAINT control_framework_mappings_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 4. SME Review Queue
ALTER TABLE public.sme_review_queue
  DROP CONSTRAINT IF EXISTS sme_review_queue_control_id_a_fkey,
  DROP CONSTRAINT IF EXISTS sme_review_queue_control_id_b_fkey,
  DROP CONSTRAINT IF EXISTS sme_review_queue_framework_id_fkey,
  DROP CONSTRAINT IF EXISTS sme_review_queue_reviewed_by_fkey,
  DROP CONSTRAINT IF EXISTS sme_review_queue_assigned_to_fkey,
  ADD CONSTRAINT sme_review_queue_control_id_a_fkey FOREIGN KEY (control_id_a) REFERENCES public.controls(id) ON DELETE CASCADE,
  ADD CONSTRAINT sme_review_queue_control_id_b_fkey FOREIGN KEY (control_id_b) REFERENCES public.controls(id) ON DELETE CASCADE,
  ADD CONSTRAINT sme_review_queue_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES public.frameworks(id) ON DELETE CASCADE,
  ADD CONSTRAINT sme_review_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT sme_review_queue_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- 5. Gaps
ALTER TABLE public.gaps
  DROP CONSTRAINT IF EXISTS gaps_framework_id_fkey,
  DROP CONSTRAINT IF EXISTS gaps_assigned_to_fkey,
  ADD CONSTRAINT gaps_framework_id_fkey FOREIGN KEY (framework_id) REFERENCES public.frameworks(id) ON DELETE CASCADE,
  ADD CONSTRAINT gaps_assigned_to_fkey FOREIGN KEY (assigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- 6. Evidence
ALTER TABLE public.evidence
  DROP CONSTRAINT IF EXISTS evidence_uploaded_by_fkey,
  DROP CONSTRAINT IF EXISTS evidence_reviewed_by_fkey,
  DROP CONSTRAINT IF EXISTS evidence_reassigned_to_fkey,
  ALTER COLUMN uploaded_by DROP NOT NULL,
  ADD CONSTRAINT evidence_uploaded_by_fkey FOREIGN KEY (uploaded_by) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT evidence_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id) ON DELETE SET NULL,
  ADD CONSTRAINT evidence_reassigned_to_fkey FOREIGN KEY (reassigned_to) REFERENCES public.users(id) ON DELETE SET NULL;

-- 7. Evidence Timeline
ALTER TABLE public.evidence_timeline
  DROP CONSTRAINT IF EXISTS evidence_timeline_performed_by_fkey,
  ADD CONSTRAINT evidence_timeline_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;

-- 8. Notifications recipient
ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_recipient_id_fkey,
  ADD CONSTRAINT notifications_recipient_id_fkey FOREIGN KEY (recipient_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- 9. Audit Log actor
ALTER TABLE public.audit_log
  DROP CONSTRAINT IF EXISTS audit_log_performed_by_fkey,
  ADD CONSTRAINT audit_log_performed_by_fkey FOREIGN KEY (performed_by) REFERENCES public.users(id) ON DELETE SET NULL;


-- ── B. CREATE COMPREHENSIVE PERFORMANCE INDEXES ──────────────────

-- Controls Indexing
CREATE INDEX IF NOT EXISTS idx_controls_domain_id ON public.controls (domain_id);
CREATE INDEX IF NOT EXISTS idx_controls_owner_id ON public.controls (owner_id);
CREATE INDEX IF NOT EXISTS idx_controls_status ON public.controls (status);
CREATE INDEX IF NOT EXISTS idx_controls_is_canonical ON public.controls (is_canonical);

-- Mappings Indexing
CREATE INDEX IF NOT EXISTS idx_cf_mappings_control_id ON public.control_framework_mappings (control_id);
CREATE INDEX IF NOT EXISTS idx_cf_mappings_framework_id ON public.control_framework_mappings (framework_id);

-- SME Queue Indexing
CREATE INDEX IF NOT EXISTS idx_sme_queue_status ON public.sme_review_queue (status);
CREATE INDEX IF NOT EXISTS idx_sme_queue_assigned_to ON public.sme_review_queue (assigned_to);

-- Gaps Indexing
CREATE INDEX IF NOT EXISTS idx_gaps_status ON public.gaps (status);
CREATE INDEX IF NOT EXISTS idx_gaps_severity ON public.gaps (severity);
CREATE INDEX IF NOT EXISTS idx_gaps_framework_id ON public.gaps (framework_id);

-- Evidence Indexing
CREATE INDEX IF NOT EXISTS idx_evidence_control_id ON public.evidence (control_id);
CREATE INDEX IF NOT EXISTS idx_evidence_status ON public.evidence (status);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256 ON public.evidence (sha256_hash);

-- Notifications Indexing
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications (recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON public.notifications (is_read);

-- Audit Log Indexing (Immutable lookup)
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at ON public.audit_log (performed_at DESC);


-- ── C. INCREASE NUMERIC MULTIPLIER PRECISION ────────────────────

-- Drop dependent view before changing column type
DROP VIEW IF EXISTS public.v_controls_full;

ALTER TABLE public.controls ALTER COLUMN multiplier TYPE NUMERIC(6,2);
ALTER TABLE public.metrics ALTER COLUMN control_multiplier TYPE NUMERIC(6,2);

-- Recreate view after changing column type
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
