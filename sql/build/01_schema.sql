-- ============================================================
-- UCIL — 01_schema.sql   (RUN 1st)
-- Extensions · Tables · Indexes · Views
-- ------------------------------------------------------------
-- Consolidated final structure. Incorporates every schema change
-- from ucil-complete.sql + update1..update14:
--   • tenant_id columns + tenants registry (update4)
--   • gaps.framework_id (update6) and gaps.clause_ref DEFAULT '—' (update7)
--   • evidence.sha256_hash + uploaded_by nullable (update1/13)
--   • controls.multiplier / metrics.control_multiplier NUMERIC(6,2) (update13)
--   • metrics.internal_policies + singleton index (update12/14)
--   • scan_info UNIQUE(scan_type) for cron upserts (update14)
--   • role CHECK incl. Auditor/System (update6)
--   • ON DELETE cascade/set-null integrity (update13)
--   • performance indexes (update4/13)
-- ============================================================

-- ── Extensions ───────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- required by digest() in audit chain

-- ============================================================
-- TABLES
-- ============================================================

-- 1. USERS
CREATE TABLE public.users (
  id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name       TEXT NOT NULL,
  email           TEXT NOT NULL UNIQUE,
  role            TEXT NOT NULL CHECK (role IN
                    ('Control Owner','Domain Head','Compliance Lead','CISO','Admin','Auditor','System')),
  domain          TEXT,
  avatar_initials TEXT,
  tenant_id       UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- 2. TENANTS (multi-tenant registry; app runs single-tenant on the legacy sentinel)
CREATE TABLE public.tenants (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL UNIQUE,
  plan        TEXT DEFAULT 'Standard' CHECK (plan IN ('Trial','Standard','Enterprise')),
  region      TEXT DEFAULT 'in-south-1',
  contact     TEXT,
  is_active   BOOLEAN DEFAULT TRUE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.tenants (id, name, plan, region)
VALUES ('00000000-0000-0000-0000-000000000000','Legacy / Unpartitioned','Enterprise','in-south-1')
ON CONFLICT (id) DO NOTHING;

-- 3. FRAMEWORKS
CREATE TABLE public.frameworks (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name              TEXT NOT NULL UNIQUE,
  type              TEXT NOT NULL CHECK (type IN ('Framework','Circular','Internal Policy')),
  version           TEXT,
  issuer            TEXT,
  description       TEXT,
  source_url        TEXT,
  ingested_at       TIMESTAMPTZ,
  total_clauses     INT DEFAULT 0,
  satisfied_pct     NUMERIC(5,2) DEFAULT 0,
  partial_pct       NUMERIC(5,2) DEFAULT 0,
  missing_pct       NUMERIC(5,2) DEFAULT 0,
  status            TEXT DEFAULT 'Not Loaded' CHECK (status IN ('Not Loaded','Loaded','Processing','Error')),
  compliance_status TEXT DEFAULT 'Not Compliant' CHECK (compliance_status IN
                      ('Compliant','Partially Compliant','Not Compliant','In progress')),
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 4. DOMAINS
CREATE TABLE public.domains (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL UNIQUE,
  domain_head_id   UUID REFERENCES public.users(id) ON DELETE SET NULL,
  default_owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  description      TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 5. CONTROLS
CREATE TABLE public.controls (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_code      TEXT NOT NULL UNIQUE,
  name              TEXT NOT NULL,
  description       TEXT NOT NULL,
  canonical_text    TEXT,
  domain_id         UUID REFERENCES public.domains(id) ON DELETE SET NULL,
  owner_id          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  domain_head_id    UUID REFERENCES public.users(id) ON DELETE SET NULL,
  status            TEXT DEFAULT 'Active' CHECK (status IN
                      ('Active','Failed','Under Review','Updated','Rejected','Pending')),
  status_reason     TEXT,
  confidence_score  NUMERIC(4,3),
  multiplier        NUMERIC(6,2),
  is_canonical      BOOLEAN DEFAULT FALSE,
  parent_control_id UUID REFERENCES public.controls(id) ON DELETE SET NULL,
  tenant_id         UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 6. CONTROL_FRAMEWORK_MAPPINGS
CREATE TABLE public.control_framework_mappings (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id       UUID NOT NULL REFERENCES public.controls(id)   ON DELETE CASCADE,
  framework_id     UUID NOT NULL REFERENCES public.frameworks(id) ON DELETE CASCADE,
  clause_ref       TEXT NOT NULL,
  clause_text      TEXT,
  confidence_score NUMERIC(4,3),
  rationale        TEXT,
  status           TEXT DEFAULT 'Auto-Approved' CHECK (status IN
                     ('Auto-Approved','SME-Approved','SME-Rejected','Pending-Review')),
  approved_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_at      TIMESTAMPTZ,
  tenant_id        UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (control_id, framework_id, clause_ref)
);

-- 7. SME_REVIEW_QUEUE
CREATE TABLE public.sme_review_queue (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mapping_id       TEXT NOT NULL,
  control_id_a     UUID NOT NULL REFERENCES public.controls(id)   ON DELETE CASCADE,
  control_id_b     UUID REFERENCES public.controls(id)            ON DELETE CASCADE,
  framework_id     UUID REFERENCES public.frameworks(id)          ON DELETE CASCADE,
  clause_ref       TEXT,
  confidence_score NUMERIC(4,3) NOT NULL,
  ai_rationale     TEXT,
  status           TEXT DEFAULT 'Pending' CHECK (status IN
                     ('Pending','Approved','Rejected','Edited','Reassigned')),
  reviewed_by      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  justification    TEXT,
  assigned_to      UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_at      TIMESTAMPTZ,
  expires_at       TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

-- 8. GAPS
CREATE TABLE public.gaps (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  gap_code             TEXT NOT NULL UNIQUE,
  framework_id         UUID REFERENCES public.frameworks(id) ON DELETE CASCADE,
  clause_ref           TEXT NOT NULL DEFAULT '—',
  clause_text          TEXT,
  severity             TEXT NOT NULL CHECK (severity IN ('critical','high','medium','low')),
  description          TEXT NOT NULL,
  why_critical         TEXT,
  impact_if_unresolved TEXT,
  benefit_if_resolved  TEXT,
  impact_category      TEXT[],
  status               TEXT DEFAULT 'Open' CHECK (status IN ('Open','In Progress','Resolved','Accepted Risk')),
  assigned_to          UUID REFERENCES public.users(id) ON DELETE SET NULL,
  target_date          DATE,
  resolved_at          TIMESTAMPTZ,
  tenant_id            UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 9. EVIDENCE
CREATE TABLE public.evidence (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id          UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  file_name           TEXT NOT NULL,
  file_path           TEXT NOT NULL,
  file_size           TEXT,
  file_type           TEXT,
  uploaded_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,  -- nullable (update13)
  upload_date         TIMESTAMPTZ DEFAULT NOW(),
  status              TEXT DEFAULT 'Pending' CHECK (status IN
                        ('Pending','Under Review','Approved','Rejected','Reassigned')),
  reviewed_by         UUID REFERENCES public.users(id) ON DELETE SET NULL,
  review_date         TIMESTAMPTZ,
  manual_remark       TEXT,
  ai_verdict          TEXT,
  ai_verdict_detail   TEXT,
  ai_missing_elements TEXT,
  ai_red_flags        TEXT,
  observations        TEXT,
  rejection_reason    TEXT,
  reassigned_to       UUID REFERENCES public.users(id) ON DELETE SET NULL,
  sha256_hash         TEXT,
  tenant_id           UUID DEFAULT '00000000-0000-0000-0000-000000000000',
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- 10. EVIDENCE_TIMELINE
CREATE TABLE public.evidence_timeline (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  evidence_id  UUID NOT NULL REFERENCES public.evidence(id) ON DELETE CASCADE,
  action       TEXT NOT NULL,
  action_type  TEXT NOT NULL CHECK (action_type IN ('info','warning','success','danger')),
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  performed_at TIMESTAMPTZ DEFAULT NOW(),
  notes        TEXT
);

-- 11. REGULATORY_CHANGES
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

-- 12. CONFLICTS
CREATE TABLE public.conflicts (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conflict_code        TEXT NOT NULL UNIQUE,
  title                TEXT NOT NULL,
  framework_id_1       UUID REFERENCES public.frameworks(id),
  policy_ref_1         TEXT NOT NULL,
  requirement_1        TEXT NOT NULL,
  framework_id_2       UUID REFERENCES public.frameworks(id),
  policy_ref_2         TEXT NOT NULL,
  requirement_2        TEXT NOT NULL,
  affected_control_ids UUID[],
  status               TEXT DEFAULT 'Conflict Detected' CHECK (status IN
                         ('Conflict Detected','Under Review','Resolved','Accepted')),
  partial_status       TEXT,
  explanation          TEXT,
  suggested_resolution TEXT,
  resolution_applied   TEXT,
  resolved_by          UUID REFERENCES public.users(id),
  resolved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  updated_at           TIMESTAMPTZ DEFAULT NOW()
);

-- 13. NOTIFICATIONS
CREATE TABLE public.notifications (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id   UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  trigger_event  TEXT NOT NULL,
  title          TEXT NOT NULL,
  message        TEXT NOT NULL,
  related_page   TEXT,
  related_id     UUID,
  is_read        BOOLEAN DEFAULT FALSE,
  sent_via_email BOOLEAN DEFAULT FALSE,
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- 14. AUDIT_LOG (immutable, hash-chained)
CREATE TABLE public.audit_log (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  performed_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  action       TEXT NOT NULL,
  entity_type  TEXT NOT NULL,
  entity_id    UUID,
  old_values   JSONB,
  new_values   JSONB,
  ip_address   TEXT,
  user_agent   TEXT,
  prev_hash    TEXT,
  current_hash TEXT,
  performed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 15. SCAN_INFO  (UNIQUE(scan_type) enables ON CONFLICT upserts — update14)
CREATE TABLE public.scan_info (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  scan_type         TEXT NOT NULL UNIQUE CHECK (scan_type IN ('circular_scan','compliance_eval','scheduled_scrape')),
  status            TEXT NOT NULL CHECK (status IN ('up-to-date','pending','failed','running')),
  started_at        TIMESTAMPTZ,
  completed_at      TIMESTAMPTZ,
  next_scheduled_at TIMESTAMPTZ,
  sources_checked   TEXT[],
  new_items_found   INT DEFAULT 0,
  error_message     TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW()
);

-- 16. METRICS (single authoritative row, kept live by triggers)
CREATE TABLE public.metrics (
  id                        UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  unique_canonical          INT DEFAULT 0,
  implemented               INT DEFAULT 0,
  in_progress_sme           INT DEFAULT 0,
  in_progress_ev_review     INT DEFAULT 0,
  in_progress_ev_pending    INT DEFAULT 0,
  in_progress_ev_reassigned INT DEFAULT 0,
  open_gaps                 INT DEFAULT 0,
  critical_gaps             INT DEFAULT 0,
  frameworks_ingested       INT DEFAULT 0,
  circulars_ingested        INT DEFAULT 0,
  internal_policies         INT DEFAULT 0,
  total_sources             INT DEFAULT 0,
  ai_auto_approval_rate     NUMERIC(5,2) DEFAULT 0,
  control_multiplier        NUMERIC(6,2) DEFAULT 0,
  total_mappings            INT DEFAULT 0,
  last_calculated_at        TIMESTAMPTZ DEFAULT NOW()
);
-- Enforce the singleton: only ever one metrics row can exist (update14)
CREATE UNIQUE INDEX metrics_singleton ON public.metrics ((TRUE));
INSERT INTO public.metrics DEFAULT VALUES ON CONFLICT DO NOTHING;

-- 17. CONTROL_HISTORY (posture snapshots)
CREATE TABLE public.control_history (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  control_id       UUID NOT NULL REFERENCES public.controls(id) ON DELETE CASCADE,
  status           TEXT NOT NULL,
  confidence_score NUMERIC(4,3),
  changed_by       UUID REFERENCES public.users(id),
  snapshot_at      TIMESTAMPTZ DEFAULT NOW(),
  notes            TEXT
);

-- 18. AI_PROMPTS (hot-swappable Edge Function prompts)
CREATE TABLE public.ai_prompts (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  function_name TEXT NOT NULL,
  version       TEXT NOT NULL DEFAULT 'v1.0',
  prompt_text   TEXT NOT NULL,
  is_active     BOOLEAN DEFAULT TRUE,
  created_by    UUID REFERENCES public.users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (function_name, version)
);

-- 19. DISCOVERED_CIRCULARS (web-scraper staging queue)
CREATE TABLE public.discovered_circulars (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  circular_id  TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL,
  issuer       TEXT NOT NULL,
  source_url   TEXT,
  scraped_at   TIMESTAMPTZ DEFAULT NOW(),
  status       TEXT DEFAULT 'Pending' CHECK (status IN ('Pending','Ingested','Dismissed')),
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES  (update4 + update13)
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_audit_log_chain          ON public.audit_log(performed_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_performed_at    ON public.audit_log(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_evidence_control_status   ON public.evidence(control_id, status);
CREATE INDEX IF NOT EXISTS idx_evidence_control_id       ON public.evidence(control_id);
CREATE INDEX IF NOT EXISTS idx_evidence_status           ON public.evidence(status);
CREATE INDEX IF NOT EXISTS idx_evidence_sha256           ON public.evidence(sha256_hash);
CREATE INDEX IF NOT EXISTS idx_evidence_tenant           ON public.evidence(tenant_id);
CREATE INDEX IF NOT EXISTS idx_mappings_fw_ctrl          ON public.control_framework_mappings(framework_id, control_id);
CREATE INDEX IF NOT EXISTS idx_cf_mappings_control_id    ON public.control_framework_mappings(control_id);
CREATE INDEX IF NOT EXISTS idx_cf_mappings_framework_id  ON public.control_framework_mappings(framework_id);
CREATE INDEX IF NOT EXISTS idx_controls_domain_status    ON public.controls(domain_id, status);
CREATE INDEX IF NOT EXISTS idx_controls_domain_id        ON public.controls(domain_id);
CREATE INDEX IF NOT EXISTS idx_controls_owner_id         ON public.controls(owner_id);
CREATE INDEX IF NOT EXISTS idx_controls_status           ON public.controls(status);
CREATE INDEX IF NOT EXISTS idx_controls_is_canonical     ON public.controls(is_canonical);
CREATE INDEX IF NOT EXISTS idx_controls_tenant           ON public.controls(tenant_id);
CREATE INDEX IF NOT EXISTS idx_sme_queue_status          ON public.sme_review_queue(status);
CREATE INDEX IF NOT EXISTS idx_sme_queue_assigned_to     ON public.sme_review_queue(assigned_to);
CREATE INDEX IF NOT EXISTS idx_gaps_status               ON public.gaps(status);
CREATE INDEX IF NOT EXISTS idx_gaps_severity             ON public.gaps(severity);
CREATE INDEX IF NOT EXISTS idx_gaps_framework_id         ON public.gaps(framework_id);
CREATE INDEX IF NOT EXISTS idx_gaps_tenant               ON public.gaps(tenant_id);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient_id ON public.notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read      ON public.notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_control_history_ctrl       ON public.control_history(control_id, snapshot_at DESC);

-- ============================================================
-- VIEWS  (read by the frontend data layer)
-- ============================================================
CREATE OR REPLACE VIEW public.v_controls_full AS
SELECT
  c.id, c.control_code, c.name, c.description, c.canonical_text,
  c.status, c.status_reason, c.confidence_score, c.multiplier, c.is_canonical,
  d.name            AS domain_name,
  u_owner.full_name AS owner_name,
  u_head.full_name  AS domain_head_name,
  c.owner_id, c.domain_head_id, c.domain_id,
  c.created_at, c.updated_at
FROM public.controls c
LEFT JOIN public.domains d       ON c.domain_id     = d.id
LEFT JOIN public.users   u_owner ON c.owner_id      = u_owner.id
LEFT JOIN public.users   u_head  ON c.domain_head_id = u_head.id;

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
LEFT JOIN public.controls c  ON e.control_id  = c.id
LEFT JOIN public.domains  d  ON c.domain_id   = d.id
LEFT JOIN public.users u_up  ON e.uploaded_by = u_up.id
LEFT JOIN public.users u_rev ON e.reviewed_by = u_rev.id;

CREATE OR REPLACE VIEW public.v_latest_scans AS
SELECT DISTINCT ON (scan_type)
  scan_type, status, completed_at, next_scheduled_at, new_items_found
FROM public.scan_info
ORDER BY scan_type, created_at DESC;

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
