-- ============================================================
-- UCIL UPDATE 14 — CRITICAL RUNTIME FIXES
-- ============================================================
-- Run AFTER: update13.sql
-- Fixes three defects that make the live app non-functional:
--   A. recalculate_metrics() runs an UNQUALIFIED `UPDATE public.metrics`.
--      supautils rejects WHERE-less UPDATE/DELETE for the PostgREST
--      session roles (authenticated / service_role), so EVERY insert or
--      update to controls / gaps / evidence / mappings fails at the DB
--      level. Also collapses the metrics table back to a single row and
--      enforces the singleton so future inserts cannot duplicate it.
--   B. RLS: restore the SELECT policies on controls / evidence / gaps and
--      the INSERT policy on evidence. update4 replaced the open read
--      policies with tenant-scoped ones, then update12 dropped the
--      tenant policies (because get_user_tenant_id was broken) WITHOUT
--      recreating any read access — leaving these tables unreadable and
--      evidence un-insertable for every non-service role.
--   C. scan_info: add UNIQUE(scan_type) so the web-scraper and
--      compliance-eval cron `ON CONFLICT (scan_type)` upserts work.
-- Idempotent: safe to run more than once.
-- ============================================================


-- ── A. METRICS SINGLETON + SAFE-UPDATE COMPLIANT RECALC ──────

-- A1. Collapse to one row (keep the most recently calculated)
DELETE FROM public.metrics
WHERE id NOT IN (
  SELECT id FROM public.metrics
  ORDER BY last_calculated_at DESC NULLS LAST, id
  LIMIT 1
);

-- A2. Enforce the singleton (constant-expression unique index → max 1 row)
CREATE UNIQUE INDEX IF NOT EXISTS metrics_singleton ON public.metrics ((TRUE));

-- A3. Guarantee the row exists
INSERT INTO public.metrics DEFAULT VALUES ON CONFLICT DO NOTHING;

-- A4. Rewrite recalculate_metrics() with an explicit WHERE clause
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
  SELECT COUNT(*) INTO v_canonical   FROM public.controls WHERE is_canonical = TRUE;
  SELECT COUNT(*) INTO v_implemented FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE;
  SELECT COUNT(*) INTO v_sme         FROM public.sme_review_queue WHERE status = 'Pending';
  SELECT COUNT(*) INTO v_ev_review   FROM public.evidence WHERE status = 'Under Review';
  SELECT COUNT(*) INTO v_ev_pending  FROM public.evidence WHERE status = 'Pending';
  SELECT COUNT(*) INTO v_ev_reassigned FROM public.evidence WHERE status = 'Reassigned';
  SELECT COUNT(*) INTO v_gaps        FROM public.gaps WHERE status = 'Open';
  SELECT COUNT(*) INTO v_critical_gaps FROM public.gaps WHERE status = 'Open' AND severity = 'critical';
  SELECT COUNT(*) INTO v_fw     FROM public.frameworks WHERE type = 'Framework'        AND status = 'Loaded';
  SELECT COUNT(*) INTO v_circ   FROM public.frameworks WHERE type = 'Circular'         AND status = 'Loaded';
  SELECT COUNT(*) INTO v_intpol FROM public.frameworks WHERE type = 'Internal Policy'  AND status = 'Loaded';
  v_total_sources := v_fw + v_circ + v_intpol;
  SELECT COUNT(*) INTO v_total_maps    FROM public.control_framework_mappings;
  SELECT COUNT(*) INTO v_auto_approved FROM public.control_framework_mappings WHERE status = 'Auto-Approved';
  v_auto_rate := CASE WHEN v_total_maps > 0
                      THEN ROUND((v_auto_approved::NUMERIC / v_total_maps) * 100, 2) ELSE 0 END;
  v_multiplier := CASE WHEN v_canonical > 0
                       THEN ROUND((v_total_maps::NUMERIC / v_canonical), 2) ELSE 1.0 END;

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
    last_calculated_at        = NOW()
  WHERE id IS NOT NULL;   -- explicit predicate: satisfies supautils safe-update guard

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- A5. Fix the hourly metrics cron (also had a WHERE-less UPDATE)
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ucil-metrics-hourly';
SELECT cron.schedule(
  'ucil-metrics-hourly',
  '0 * * * *',
  $CRON$
  UPDATE public.metrics SET
    unique_canonical          = (SELECT COUNT(*) FROM public.controls WHERE is_canonical = TRUE),
    implemented               = (SELECT COUNT(*) FROM public.controls WHERE status = 'Active' AND is_canonical = TRUE),
    in_progress_sme           = (SELECT COUNT(*) FROM public.sme_review_queue WHERE status = 'Pending'),
    in_progress_ev_review     = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Under Review'),
    in_progress_ev_pending    = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Pending'),
    in_progress_ev_reassigned = (SELECT COUNT(*) FROM public.evidence WHERE status = 'Reassigned'),
    open_gaps                 = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open'),
    critical_gaps             = (SELECT COUNT(*) FROM public.gaps WHERE status = 'Open' AND severity = 'critical'),
    last_calculated_at        = NOW()
  WHERE id IS NOT NULL
  $CRON$
);


-- ── B. RESTORE RLS READ / INSERT POLICIES ───────────────────

-- controls: readable by any authenticated user
DROP POLICY IF EXISTS "controls_read_all" ON public.controls;
CREATE POLICY "controls_read_all" ON public.controls
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- evidence: readable by any authenticated user
DROP POLICY IF EXISTS "evidence_read_all" ON public.evidence;
CREATE POLICY "evidence_read_all" ON public.evidence
  FOR SELECT USING (auth.uid() IS NOT NULL);

-- evidence: insertable by the uploader (Control Owner / Compliance Lead / CISO / Admin)
DROP POLICY IF EXISTS "evidence_insert_owner" ON public.evidence;
CREATE POLICY "evidence_insert_owner" ON public.evidence
  FOR INSERT WITH CHECK (
    uploaded_by = auth.uid()
    AND public.get_user_role() IN ('Control Owner','Compliance Lead','CISO','Admin')
  );

-- gaps: readable by any authenticated user
DROP POLICY IF EXISTS "gaps_read_all" ON public.gaps;
CREATE POLICY "gaps_read_all" ON public.gaps
  FOR SELECT USING (auth.uid() IS NOT NULL);


-- ── C. SCAN_INFO UNIQUE(scan_type) FOR UPSERTS ──────────────
-- Enables ON CONFLICT (scan_type) in web-scraper + compliance-eval cron.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.scan_info'::regclass AND conname = 'scan_info_scan_type_key'
  ) THEN
    ALTER TABLE public.scan_info ADD CONSTRAINT scan_info_scan_type_key UNIQUE (scan_type);
  END IF;
END$$;
