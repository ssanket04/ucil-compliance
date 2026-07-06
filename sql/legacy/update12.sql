-- ============================================================
-- UCIL UPDATE 12 — ARCHITECTURAL SCHEMA CORRECTIONS
-- ============================================================
-- Run AFTER: update11.sql
-- Purpose: Fixes all schema-level defects identified in the
--          Enterprise Architecture Audit Report (2026-07-06)
--
-- Changes:
--   A. Add missing `internal_policies` column to metrics table
--   B. Fix recalculate_metrics() trigger to include internal_policies
--   C. Add NULL-safety guard to notify_on_evidence_change() trigger
--   D. Drop broken get_user_tenant_id() function (references non-existent column)
--   E. Add verify_audit_chain() RPC if not already present
-- ============================================================


-- ── A. Add internal_policies column to metrics ───────────────
ALTER TABLE public.metrics 
  ADD COLUMN IF NOT EXISTS internal_policies INT DEFAULT 0;


-- ── B. Rewrite recalculate_metrics() to include internal_policies ─
CREATE OR REPLACE FUNCTION public.recalculate_metrics()
RETURNS TRIGGER AS $$
DECLARE
  v_canonical       INT; v_implemented     INT; v_sme             INT;
  v_ev_review       INT; v_ev_pending      INT; v_ev_reassigned   INT;
  v_gaps            INT; v_critical_gaps   INT;
  v_fw              INT; v_circ            INT; v_intpol          INT;
  v_total_sources   INT;
  v_total_maps      INT; v_auto_approved   INT;
  v_auto_rate       NUMERIC; v_multiplier  NUMERIC;
BEGIN
  -- Controls
  SELECT COUNT(*) INTO v_canonical   FROM public.controls WHERE is_canonical = TRUE;
  SELECT COUNT(*) INTO v_implemented FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE;

  -- SME Queue
  SELECT COUNT(*) INTO v_sme FROM public.sme_review_queue WHERE status = 'Pending';

  -- Evidence statuses
  SELECT COUNT(*) INTO v_ev_review    FROM public.evidence WHERE status = 'Under Review';
  SELECT COUNT(*) INTO v_ev_pending   FROM public.evidence WHERE status = 'Pending';
  SELECT COUNT(*) INTO v_ev_reassigned FROM public.evidence WHERE status = 'Reassigned';

  -- Gaps
  SELECT COUNT(*) INTO v_gaps        FROM public.gaps WHERE status = 'Open';
  SELECT COUNT(*) INTO v_critical_gaps FROM public.gaps WHERE status = 'Open' AND severity = 'critical';

  -- Frameworks by type (only Loaded count as ingested)
  SELECT COUNT(*) INTO v_fw     FROM public.frameworks WHERE type = 'Framework'        AND status = 'Loaded';
  SELECT COUNT(*) INTO v_circ   FROM public.frameworks WHERE type = 'Circular'         AND status = 'Loaded';
  SELECT COUNT(*) INTO v_intpol FROM public.frameworks WHERE type = 'Internal Policy'  AND status = 'Loaded';
  v_total_sources := v_fw + v_circ + v_intpol;

  -- Mappings and AI approval rate
  SELECT COUNT(*) INTO v_total_maps    FROM public.control_framework_mappings;
  SELECT COUNT(*) INTO v_auto_approved FROM public.control_framework_mappings WHERE status = 'Auto-Approved';
  v_auto_rate := CASE WHEN v_total_maps > 0 
                      THEN ROUND((v_auto_approved::NUMERIC / v_total_maps) * 100, 2) 
                      ELSE 0 END;

  -- Control multiplier (average mappings per canonical control)
  v_multiplier := CASE WHEN v_canonical > 0 
                       THEN ROUND((v_total_maps::NUMERIC / v_canonical), 2) 
                       ELSE 1.0 END;

  -- Single authoritative UPDATE — one row always exists
  UPDATE public.metrics SET
    unique_canonical          = COALESCE(v_canonical, 0),
    implemented               = COALESCE(v_implemented, 0),
    in_progress_sme           = COALESCE(v_sme, 0),
    in_progress_ev_review     = COALESCE(v_ev_review, 0),
    in_progress_ev_pending    = COALESCE(v_ev_pending, 0),
    in_progress_ev_reassigned = COALESCE(v_ev_reassigned, 0),
    open_gaps                 = COALESCE(v_gaps, 0),
    critical_gaps             = COALESCE(v_critical_gaps, 0),
    frameworks_ingested       = COALESCE(v_fw, 0),
    circulars_ingested        = COALESCE(v_circ, 0),
    internal_policies         = COALESCE(v_intpol, 0),
    total_sources             = COALESCE(v_total_sources, 0),
    ai_auto_approval_rate     = COALESCE(v_auto_rate, 0),
    control_multiplier        = COALESCE(v_multiplier, 1.0),
    total_mappings            = COALESCE(v_total_maps, 0),
    last_calculated_at        = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── C. Fix notify_on_evidence_change() — NULL-safe recipient guard ──
CREATE OR REPLACE FUNCTION public.notify_on_evidence_change()
RETURNS TRIGGER AS $$
DECLARE 
  v_owner UUID; v_head UUID; v_name TEXT; v_code TEXT;
BEGIN
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;

  SELECT c.owner_id, c.domain_head_id, c.name, c.control_code
  INTO v_owner, v_head, v_name, v_code
  FROM public.controls c WHERE c.id = NEW.control_id;

  -- Guard: only notify if recipient UUID is non-null
  IF NEW.status = 'Under Review' AND OLD.status = 'Pending' THEN
    IF v_head IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
      VALUES (v_head, 'Evidence uploaded', 'Evidence ready for review',
              COALESCE(v_code, '') || ' — ' || COALESCE(v_name, '') || ': evidence awaiting your review.',
              'evidence', NEW.id);
    END IF;
  END IF;

  IF NEW.status = 'Approved' THEN
    IF v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
      VALUES (v_owner, 'Evidence approved', 'Evidence approved',
              COALESCE(v_code, '') || ' — ' || COALESCE(v_name, '') || ': evidence approved.',
              'evidence', NEW.id);
    END IF;
  END IF;

  IF NEW.status = 'Rejected' THEN
    IF v_owner IS NOT NULL THEN
      INSERT INTO public.notifications (recipient_id, trigger_event, title, message, related_page, related_id)
      VALUES (v_owner, 'Evidence rejected / returned', 'Evidence returned — action required',
              COALESCE(v_code, '') || ' — ' || COALESCE(v_name, '') || ': evidence rejected. Reason: ' ||
              COALESCE(NEW.rejection_reason, 'See remarks.'),
              'evidence', NEW.id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- ── D. Drop broken get_user_tenant_id() — references non-existent column ──
-- First, drop the legacy policies depending on this function
DROP POLICY IF EXISTS controls_read_tenant ON public.controls;
DROP POLICY IF EXISTS evidence_read_tenant ON public.evidence;
DROP POLICY IF EXISTS gaps_read_tenant ON public.gaps;
DROP POLICY IF EXISTS evidence_insert_tenant ON public.evidence;
DROP POLICY IF EXISTS tenants_read_own ON public.tenants;
DROP POLICY IF EXISTS evidence_read_auditor ON public.evidence;

DROP FUNCTION IF EXISTS public.get_user_tenant_id();


-- ── E. Add verify_audit_chain() RPC — used by Dashboard tamper check ──
DROP FUNCTION IF EXISTS public.verify_audit_chain(timestamptz, timestamptz);

CREATE OR REPLACE FUNCTION public.verify_audit_chain(p_from_ts TIMESTAMPTZ, p_to_ts TIMESTAMPTZ)
RETURNS TABLE(is_valid BOOLEAN, checked_count INT, broken_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_prev_hash  TEXT  := 'GENESIS';
  v_count      INT   := 0;
  v_broken_at  TIMESTAMPTZ := NULL;
  r            RECORD;
BEGIN
  FOR r IN
    SELECT id, prev_hash, current_hash, performed_at
    FROM public.audit_log
    WHERE performed_at BETWEEN p_from_ts AND p_to_ts
    ORDER BY performed_at ASC, id ASC
  LOOP
    v_count := v_count + 1;
    -- First record must reference GENESIS or the previous known hash
    IF v_count = 1 THEN
      v_prev_hash := COALESCE(r.prev_hash, 'GENESIS');
    ELSE
      IF r.prev_hash IS DISTINCT FROM v_prev_hash THEN
        v_broken_at := r.performed_at;
        RETURN QUERY SELECT FALSE, v_count, v_broken_at;
        RETURN;
      END IF;
    END IF;
    v_prev_hash := r.current_hash;
  END LOOP;

  RETURN QUERY SELECT TRUE, v_count, NULL::TIMESTAMPTZ;
END;
$$;


-- ── F. Ensure metrics row exists (idempotent) ─────────────────
INSERT INTO public.metrics DEFAULT VALUES
ON CONFLICT DO NOTHING;


-- ── G. Force-recalculate metrics to reflect current schema ────
-- This sets the metrics to actual live values from the DB
DO $$
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
  SELECT COUNT(*) INTO v_fw     FROM public.frameworks WHERE type = 'Framework' AND status = 'Loaded';
  SELECT COUNT(*) INTO v_circ   FROM public.frameworks WHERE type = 'Circular'  AND status = 'Loaded';
  SELECT COUNT(*) INTO v_intpol FROM public.frameworks WHERE type = 'Internal Policy' AND status = 'Loaded';
  v_total_sources := v_fw + v_circ + v_intpol;
  SELECT COUNT(*) INTO v_total_maps    FROM public.control_framework_mappings;
  SELECT COUNT(*) INTO v_auto_approved FROM public.control_framework_mappings WHERE status = 'Auto-Approved';
  v_auto_rate := CASE WHEN v_total_maps > 0 THEN ROUND((v_auto_approved::NUMERIC / v_total_maps) * 100, 2) ELSE 0 END;
  v_multiplier := CASE WHEN v_canonical > 0 THEN ROUND((v_total_maps::NUMERIC / v_canonical), 2) ELSE 1.0 END;

  UPDATE public.metrics SET
    unique_canonical          = COALESCE(v_canonical, 0),
    implemented               = COALESCE(v_implemented, 0),
    in_progress_sme           = COALESCE(v_sme, 0),
    in_progress_ev_review     = COALESCE(v_ev_review, 0),
    in_progress_ev_pending    = COALESCE(v_ev_pending, 0),
    in_progress_ev_reassigned = COALESCE(v_ev_reassigned, 0),
    open_gaps                 = COALESCE(v_gaps, 0),
    critical_gaps             = COALESCE(v_critical_gaps, 0),
    frameworks_ingested       = COALESCE(v_fw, 0),
    circulars_ingested        = COALESCE(v_circ, 0),
    internal_policies         = COALESCE(v_intpol, 0),
    total_sources             = COALESCE(v_total_sources, 0),
    ai_auto_approval_rate     = COALESCE(v_auto_rate, 0),
    control_multiplier        = COALESCE(v_multiplier, 1.0),
    total_mappings            = COALESCE(v_total_maps, 0),
    last_calculated_at        = NOW();
END;
$$;
