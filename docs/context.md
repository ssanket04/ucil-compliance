# UCIL Technical Context & Implementation Guidelines
**Version:** 1.0  
**Status:** Approved  
**Author:** AI Coding Assistant  
**Date:** July 5, 2026

---

## 1. Directory Structure

The complete layout of the Unified Control Intelligence Layer (UCIL) codebase is structured as follows:

```
ucil-final/
├── docs/                             # Project documentation and guides
│   ├── CHANGES_SUMMARY.md            # Sync changes summary
│   ├── DASHBOARD_CORRECTIONS.md      # Data fix details for RBI controls
│   ├── DATA_SYNC_VERIFICATION.md     # Verification checklists and metrics
│   ├── DATA_VALIDATION_RULES.md      # Validation constraints and queries
│   ├── FINAL_IMPLEMENTATION.md       # Implementation summary
│   ├── IMPLEMENTATION_GUIDE.md       # Developer setup and deployment instructions
│   ├── LOGIN_SETUP_GUIDE.md          # User auth and profiles reference
│   ├── QUICK_REFERENCE.md            # Summary cheat sheet
│   ├── REGULATORY_STATUS_GUIDE.md    # UI locations of statuses
│   ├── REGULATORY_SYNC_GUIDE.md      # DB triggers for regulatory change mappings
│   ├── SYNCHRONIZATION_RULES.md      # System synchronization rules
│   ├── VERY-IMP_COMPLETE_PROJECT_GUIDE.md # High-level guide
│   └── VISUAL_GUIDE.md               # Flowcharts and maps
├── sql/                              # SQL scripts for database initialization
│   ├── 05_automation.sql             # Triggers and cron setups for Edge Functions
│   └── ucil-complete.sql             # Full DDL, Views, RLS, triggers and seed data
├── supabase/                         # Supabase configuration and Edge Functions
│   └── functions/
│       ├── _shared/                  # Shared Edge Function modules
│       │   └── utils.ts
│       ├── similarity-detection/      # AI: Compares two control statements
│       ├── canonical-generation/      # AI: Generates canonical controls
│       ├── evidence-verdict/          # AI: Reviews evidence uploads
│       ├── gap-narrative/             # AI: Generates business narratives for gaps
│       ├── regulatory-impact/         # AI: Maps regulatory changes to controls
│       ├── conflict-detection/        # AI: Identifies conflicting framework rules
│       ├── remediation-plan/          # AI: Drafts action checklists
│       ├── web-scraper/               # Automation: Scrapes RBI and PCI sites
│       ├── auto-mapping/              # Automation: Maps requirements post-ingest
│       └── notify-dispatch/           # Automation: Dispatches emails
└── web/                              # Client-side web application
    ├── css/                          # Stylesheets (tokens, layout, components)
    ├── javascript/                   # Frontend scripts
    │   ├── core/                     # Core routing, data stubs, layout components
    │   │   ├── components.js
    │   │   ├── data.js
    │   │   └── router.js
    │   ├── pages/                    # Page-specific rendering logic
    │   │   ├── conflicts.js          # Router stubs
    │   │   ├── dashboard.js
    │   │   ├── domainhead.js
    │   │   ├── evidence.js
    │   │   ├── gaps.js
    │   │   ├── ingest.js
    │   │   ├── notifications.js      # Router stubs
    │   │   └── regulatory.js         # Router stubs
    │   └── supabase/                 # Supabase client SDK integration
    │       ├── ai-client-functions.js # Frontend API callers for Edge Functions
    │       └── supabase-client.js    # Core db fetches and user authentication
    ├── index.html                    # Dashboard layout shell
    └── login.html                    # User login panel
```

---

## 2. Supabase CLI & Edge Function Deployment

### 2.1 Project Initialization & Linking
Initialize and link the local workspace configuration to the Supabase host database:
```bash
supabase init
supabase login
supabase link --project-ref rwovywqypipmkrtxnoen
```

### 2.2 Setting System Secrets
The Groq API key and database connection parameters must be set via secrets:
```bash
supabase secrets set GROQ_API_KEY=gsk_YOUR_API_KEY
supabase secrets set SUPABASE_URL=https://rwovywqypipmkrtxnoen.supabase.co
```

### 2.3 Edge Function Deployment
To deploy all 10 Edge Functions simultaneously:
```bash
supabase functions deploy
```
To deploy a specific Edge Function:
```bash
supabase functions deploy evidence-verdict
```

---

## 3. Database Triggers & synchronization Details

The live counts shown in the application are driven by PostgreSQL trigger functions in `sql/ucil-complete.sql`.

### 3.1 Recalculate Metrics Trigger (`recalculate_metrics`)
Updates the single `metrics` row when controls, evidence, gaps, or mappings are updated:
```sql
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
```

### 3.2 Evidence Approval Trigger (`sync_evidence_to_control`)
Transitions control status automatically based on uploads and reviews:
```sql
CREATE OR REPLACE FUNCTION public.sync_evidence_to_control()
RETURNS TRIGGER AS $$
DECLARE
  v_control_id UUID;
  v_total      INT;
  v_approved   INT;
  v_rejected   INT;
  v_new_status TEXT;
BEGIN
  v_control_id := COALESCE(NEW.control_id, OLD.control_id);

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE status = 'Approved'),
    COUNT(*) FILTER (WHERE status = 'Rejected')
  INTO v_total, v_approved, v_rejected
  FROM public.evidence
  WHERE control_id = v_control_id;

  IF v_total = 0 THEN RETURN NEW; END IF;

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
```

### 3.3 Control-to-Gap Linkage (`sync_control_to_gap` / `sync_gap_to_control`)
Automates creation of a gap when a control fails:
```sql
CREATE OR REPLACE FUNCTION public.sync_control_to_gap()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'Failed' AND (TG_OP = 'INSERT' OR OLD.status != 'Failed') THEN
    INSERT INTO public.gaps (gap_code, clause_ref, severity, description, status)
    VALUES (NEW.control_code, 'CONTROL-FAILED', 'high', NEW.name, 'Open')
    ON CONFLICT (gap_code) DO UPDATE SET status = 'Open', updated_at = NOW();
  END IF;
  IF OLD.status = 'Failed' AND NEW.status != 'Failed' THEN
    UPDATE public.gaps SET status = 'Resolved', resolved_at = NOW(), updated_at = NOW()
    WHERE gap_code = NEW.control_code AND status = 'Open';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

---

## 4. Frontend API Callers Reference

The frontend invokes the Edge Functions using client handlers loaded from `web/javascript/supabase/ai-client-functions.js`:

```javascript
async function callEdgeFunction(fnName, body) {
  const { data, error } = await sb.functions.invoke(fnName, { body });
  if (error) { console.error(`${fnName} error:`, error); throw error; }
  return data;
}

// 1. Run Similarity Detection
async function runSimilarityDetection(controlAText, controlBText, controlAId, controlBId) {
  return callEdgeFunction('similarity-detection', {
    control_a_text: controlAText,
    control_b_text: controlBText,
    control_a_id:   controlAId || null,
    control_b_id:   controlBId || null,
  });
}

// 2. Generate Remediation Plan
async function generateRemediationPlan(gapIds) {
  return callEdgeFunction('remediation-plan', { gap_ids: gapIds || null });
}

// 3. Evidence Review Analysis
async function runEvidenceVerdict(evidenceId, controlId) {
  return callEdgeFunction('evidence-verdict', { evidence_id: evidenceId, control_id: controlId });
}
```

### 4.1 Frontend Button Wiring Guide

#### A. Wire the Remediation Plan Generator (`web/javascript/pages/gaps.js`)
Locate button click triggers and attach:
```javascript
async function handleRemediationPlan() {
  const btn = event.target;
  setAILoading(btn, true, 'Generate remediation plan');
  try {
    const result = await generateRemediationPlan();
    document.getElementById('remediation-output').innerHTML = `
      <div class="card">
        <div class="card-title">AI Remediation Plan</div>
        <p>${result.executive_summary}</p>
        <!-- Map and render each item in result.plan -->
      </div>`;
  } catch(err) {
    showError(err.message);
  }
  setAILoading(btn, false, 'Generate remediation plan');
}
```

#### B. Wire AI Verdict Trigger on Evidence Upload (`web/javascript/pages/evidence.js`)
```javascript
async function runAIOnEvidence(evidenceId, controlId) {
  const result = await runEvidenceVerdict(evidenceId, controlId);
  const verdictEl = document.getElementById('ai-verdict-' + evidenceId);
  if (verdictEl) {
    verdictEl.innerHTML = `
      <div>${renderAIVerdict(result.verdict)}</div>
      <div>${result.detail}</div>`;
  }
}
```

---

## 5. Row-Level Security (RLS) SQL Checklist

RLS is enabled across all tables to enforce strict data confidentiality.

| Table | Policy Rule | SQL Definition |
| :--- | :--- | :--- |
| **users** | Read Own / Admin read all | `CREATE POLICY "users_read_own" ON public.users FOR SELECT USING (id = auth.uid());` |
| **controls** | Authenticated read / Owner write | `CREATE POLICY "controls_read_all" ON public.controls FOR SELECT USING (auth.uid() IS NOT NULL);` |
| **evidence** | Owner write / Reviewer update | `CREATE POLICY "evidence_insert_owner" ON public.evidence FOR INSERT WITH CHECK (uploaded_by = auth.uid());` |
| **audit_log** | Block updates & deletions | `CREATE POLICY "audit_no_update" ON public.audit_log FOR UPDATE USING (FALSE);` |

---

## 6. Regulatory Change Validation Queries

Use these queries in the Supabase SQL editor to audit database synchronization:

### 6.1 Validation: Gaps count $\le$ total controls
```sql
SELECT 
  circular_id,
  total_impacted as impacted_controls,
  (SELECT COUNT(*) FROM controls) as total_controls,
  CASE 
    WHEN total_impacted <= (SELECT COUNT(*) FROM controls) THEN '✓ Valid'
    ELSE '✗ Invalid'
  END as validation
FROM regulatory_changes;
```

### 6.2 Validation: Circular gaps $\le$ total system gaps
```sql
SELECT 
  circular_id,
  gaps_count,
  (SELECT COUNT(*) FROM controls WHERE status = 'Failed') as total_system_gaps,
  CASE 
    WHEN gaps_count <= (SELECT COUNT(*) FROM controls WHERE status = 'Failed') THEN '✓ Valid'
    ELSE '✗ Invalid'
  END as validation
FROM regulatory_changes;
```

### 6.3 Cost Estimate for Edge Functions (Llama-3.3-70b-versatile via Groq)
- **Inputs**: $0.59 / M tokens.
- **Outputs**: $0.79 / M tokens.
- **Projected Expense**:
  * Similarity maps + ingestion review: ~2,000 tokens $\approx$ $0.001.
  * Evidence parses (10 uploads/day): ~1,500 tokens each $\approx$ $0.01/day.
  * Monthly operations total estimate: **<$1.00 USD** (highly cost-effective).
