# Product Requirements Document (PRD)
## Unified Control Intelligence Layer (UCIL) — Compliance Redefined
**Version:** 1.1
**Status:** DRAFT — Pending Stage 5/6 completion and human governance sign-off (see §9)
**Author:** AI Coding Assistant (drafted); requires named human Product Owner approval before "Approved" status
**Date:** July 5, 2026
**Changelog from v1.0:** Reconciled AI Auto-Approval Rate formula with implementation; added Unified Control Generation workflow with dual confidence scoring; added human-override audit requirement; added AI-failure fallback behavior; added data residency requirement; downgraded status from "Approved" to "Draft" pending real governance sign-off.

---

## 1. Executive Summary & Problem Statement

### 1.1 Context
Organizations operating in highly regulated sectors (e.g., finance, healthcare, technology) must comply with multiple overlapping security frameworks, industry standards, and local guidelines — **ISO/IEC 27001**, **NIST CSF**, **PCI-DSS**, **COBIT**, **SOX**, and local mandates such as the **RBI Cyber Security Framework (CSF)**.

### 1.2 The Problem
Compliance has historically been managed in silos. The same control — e.g., "Quarterly User Access Review" — is implemented, monitored, and audited separately for each standard, causing:
* **Redundant Work** — the same control built 5 times for 5 audits.
* **Evidence Fatigue** — duplicate evidence uploaded to separate portals.
* **Lack of Visibility** — no single view of true compliance posture.
* **Regulatory Inefficiency** — manual cross-referencing of new circulars against hundreds of pages of existing controls.

### 1.3 The UCIL Solution
UCIL is an AI-assisted compliance aggregation platform that:
1. **Consolidates** frameworks, circulars, and policies into a single, deduplicated **Unified Control Library**.
2. **Auto-Maps** incoming clauses to canonical controls via semantic AI similarity, with confidence-tiered human oversight.
3. **Generates Unified Controls** by merging semantically equivalent requirements from multiple frameworks — resolving conflicts using the stricter requirement while preserving per-framework traceability.
4. **Automates Evidence Validation**: one evidence folder per canonical control; AI issues an independent confidence score on submitted evidence, with human review intensity scaled to that score.
5. **Calculates Real-Time Posture** via a single `metrics` table propagated by database triggers.
6. **Reduces effort** through control reuse — target multiplier defined in §2.

> **Important governance note:** AI in this system *recommends and pre-screens*; it does not have final unilateral authority over compliance status. Every AI-driven outcome (unified control generation, evidence verdict) is subject to a human approval gate whose intensity is confidence-dependent (§4.1.1, §4.3.1). No control or evidence status may be marked `Active`/`Approved` without a recorded human approver in `audit_log`, except where explicitly defined as auto-approved below — and even auto-approved records are flagged `ai_auto_approved = true` and remain reversible on human review.

---

## 2. Key Product Metrics

* **Control Multiplier (Efficiency Factor)**
  $$\text{Control Multiplier} = \frac{\text{Total Framework Mapping Clauses}}{\text{Total Unique Canonical Controls}}$$
  *Target:* $> 5.0\times$.

* **Compliance Saturation Rate**
  $$\text{Framework Compliance \%} = \frac{\text{Active Canonical Controls in Framework}}{\text{Total Mapped Controls in Framework}} \times 100$$

* **AI Auto-Approval Rate** *(corrected — was inconsistent with implementation in v1.0)*
  $$\text{Auto-Approval \%} = \frac{\text{Mappings with status = 'Auto-Approved'}}{\text{Total Control–Framework Mappings}} \times 100$$
  This matches the `recalculate_metrics()` trigger exactly. The v1.0 draft's alternate definition ("controls with confidence ≥0.85 / total canonical controls") is retired — it measured a different population and produced a different number on the same dashboard. If a *control-generation-confidence* view is wanted separately, it must ship as a distinctly named metric (e.g., `high_confidence_control_rate`), never reuse this label.

* **Gap Mitigation Speed** — time from `Failed` → `Active` after remediation.

---

## 3. User Personas & Roles (RBAC)

| Role | Primary Responsibility | Key Actions |
| :--- | :--- | :--- |
| **CISO** | Executive oversight. | Dashboard, critical gaps, regulatory tracking, exports. |
| **Compliance Lead** | Framework/ingestion ownership, conflict resolution. | Configures frameworks, triggers scrapers, resolves conflicts, requests remediation plans. |
| **Domain Owner / Domain Head** | Owns a technical domain; final approval authority for that domain. | Final-stage approval of unified controls and evidence per §4.1.1/§4.3.1; monitors domain metrics. |
| **Control Owner** | Implements controls, manages evidence, first-stage reviewer. | Uploads evidence; performs first-stage review of medium-confidence unified controls and evidence. |
| **SME Reviewer** | Resolves clause-to-control mapping ambiguities (distinct from control *generation* review — see note below). | Manages SME Review Queue for ingestion mapping only. |
| **Admin** | System configuration. | DB/RLS management, user setup. |

> **Role clarification (new in v1.1):** The **SME Review Queue** (ingestion mapping: clause→existing control, thresholds 0.65/0.85 from §4.1 of v1.0) and the **Unified Control Generation review** (merging multiple clauses into a *new* canonical control, thresholds defined in §4.1.1 below) are two distinct workflows with distinct queues and distinct approvers (SME Reviewer vs. Control Owner → Domain Owner). Prior versions of this PRD implicitly conflated them. They must be visually and functionally separate in the UI and in the `sme_review_queue` vs. new `control_generation_queue` tables.

---

## 4. Module-by-Module Functional Requirements

### 4.1 Ingestion & AI Mapping Engine
* Upload framework files, policy updates, or regulatory circulars.
* Extract clauses/requirement statements.
* Compute semantic similarity between an incoming clause and an *existing* canonical control.
  * Confidence ≥ 0.85 → auto-approve mapping.
  * 0.65 ≤ confidence < 0.85 → route to **SME Review Queue**.
  * Confidence < 0.65 → auto-reject the mapping (clause is *not* matched to that control; it proceeds to §4.1.1 for possible new-control generation).

#### 4.1.1 Unified Control Generation (new — from workflow clarification)
When an ingested requirement has no adequate match to an existing control (or when multiple clauses across frameworks are semantically equivalent to each other but not yet unified), the AI generates a **new Unified Control**:
* Merges semantically identical requirements from different frameworks/documents into one canonical control statement.
* **Unique controls** (no equivalent elsewhere) are added to the library unmodified, still through the same confidence gate below (confidence here reflects "is this really a distinct, well-formed control," not merge quality).
* **Conflicting requirements** (e.g., ISO retention = 6 months vs. RBI = 12 months): the unified control adopts the **stricter/more comprehensive** value. The original per-framework values are preserved as structured notes/references on the control record — not just prose — so downstream compliance evaluation can reference them independently (see §4.1.2).

**Control Generation Confidence Score (0–1)** — a second, independent score from mapping confidence, representing "how confident is the AI that this merged control accurately represents all source controls":
| Confidence | Workflow |
| :--- | :--- |
| **≥ 0.85** (default X — configurable per org) | Sent directly to **Domain Owner** for final approval. |
| **0.65 ≤ conf < 0.85** (default Y–X band) | Two-stage: **Control Owner review** → **Domain Owner approval**. |
| **< 0.65** (default Y) | Auto-rejected. AI must regenerate before re-entering the workflow. Regeneration attempts are capped (recommend max 3) and logged; after the cap, the control is force-routed to manual authoring by a Compliance Lead — the system must never loop indefinitely on a bad merge. |

Defaults of 0.85/0.65 are proposed to match the existing mapping thresholds for consistency, but **must be independently tunable** per organization/regulator — do not hard-code a shared constant with the mapping thresholds in code.

#### 4.1.2 Framework-Specific Compliance Under a Unified Control
Because a unified control may resolve conflicting source requirements to the stricter value, compliance must be evaluated **per originating framework, not just once at the unified-control level**:
* Example: org retains data for 6 months. Unified control requires 12 months (RBI-driven).
  * Framework requiring 6 months → **Compliant**.
  * Framework requiring 12 months → **Partially Compliant**.
* This requires the `control_framework_mappings` table to carry its own compliance-status field per mapping, independent of the parent control's aggregate status. The Unified Control Library UI must display both the single unified status *and* the per-framework breakdown — showing only the aggregate would mislead an auditor checking a specific framework.

### 4.2 Unified Control Library
* Displays all canonical controls, framework tags, domain, owner, status.
* Filter by status, domain, confidence score.
* **New:** Each control detail view must show (a) Control Generation Confidence and its approval trail, (b) source clauses with their original (pre-reconciliation) requirement values, (c) per-framework compliance status per §4.1.2.

### 4.3 Evidence Management
* One evidence folder per canonical control.
* Control Owners upload PDF/Word/Excel evidence.

#### 4.3.1 Evidence Validation Confidence (new — replaces flat "AI verdict" in v1.0)
AI evaluates submitted evidence against the control and produces an **Evidence Validation Confidence Score (0–1)** — independent from the Control Generation Confidence:
| Confidence | Workflow |
| :--- | :--- |
| **≥ 0.90** (default, tunable) | Forwarded directly to **Domain Owner** for final validation. |
| **0.70 ≤ conf < 0.90** | Two-stage: **Control Owner review** → **Domain Owner approval**. |
| **< 0.70** | Auto-rejected; evidence returned to Control Owner (`Reassigned` status) with AI-extracted missing elements/red flags attached, for resubmission. |

Evidence-side thresholds (0.90/0.70) are deliberately set higher/stricter than control-generation thresholds — evidence is the actual audit artifact and should carry a higher bar for automation, whereas control generation is a structural/editorial merge. Both threshold pairs are configuration, not code constants.

* Track evidence state: `Pending`, `Under Review`, `Reassigned`, `Approved`, `Rejected`.
* **AI failure fallback (new):** if the evidence-verdict or control-generation Edge Function errors, times out, or returns a malformed response, the record must default to `Pending Manual Review` — never silently pass, never silently fail closed to `Rejected` either. A distinct `ai_status = 'error'` flag must be visible to the Domain Owner queue so failures aren't confused with legitimate low-confidence rejections.

### 4.4 SME Review Queue
Unchanged from v1.0 — scoped strictly to clause→existing-control mapping ambiguities, not to be confused with the Control Generation queue (§4.1.1).

### 4.5 Gap Analysis & Remediation — unchanged from v1.0.

### 4.6 Regulatory Change Impact — unchanged from v1.0.

### 4.7 Domain Head View
* **New:** must surface both the Control Generation approval queue and the Evidence two-stage queue for the domain, not just evidence-under-review counts as in v1.0.

### 4.8 Notifications Center — unchanged, plus: critical notification on any AI Edge Function error (§4.3.1 fallback) so failures don't sit invisibly in "Pending Manual Review."

---

## 5. System Architecture & Data Sync Model

### 5.1 Single Source of Truth — unchanged mechanism (metrics table + triggers), Supabase/Postgres retained per current decision.

### 5.2 Synchronization & Validation Matrix (updated)

1. **Total Integrity**: Dashboard Canonical Controls = Library Total = Domain Head Total = Σ Domain Counts.
2. **Active Consistency**: Dashboard Implemented = Library Active = Evidence Approved = Domain Head Active.
3. **In-Progress Sum**: Dashboard In Progress = SME Queue + Control Generation Queue (new) + Evidence UR + Evidence Reassigned + Evidence Pending.
4. **Gap Identity**: Dashboard Open Gaps = Library Failed = Evidence Rejected = Gap Analysis Total = Domain Head Failed.
5. **Impact Bound**: Impacted Controls for Circular ≤ Total Unique Canonical Controls.
6. **Gap Bound**: Gaps Created by Circular ≤ Impacted Controls for Circular.
7. **Compliance Thresholds** (per framework mapping, per §4.1.2, not per unified control alone):
   * Satisfied % ≥ 90% → **Compliant**
   * Satisfied % ≥ 70% → **Partially Compliant**
   * Satisfied % < 70% → **Not Compliant**
8. **Confidence-tier consistency (new)**: The sum of records in "direct-to-Domain-Owner," "two-stage," and "auto-rejected" buckets for both Control Generation and Evidence Validation must equal the total generated/submitted for that period — a validation query should confirm no records silently vanish between tiers.

---

## 6. AI & Automation Specifications
Unchanged list of Edge Functions (§6.1–6.10 in v1.0), with two additions:
* `canonical-generation` must now return **both** a merge rationale **and** a Control Generation Confidence Score, and must accept a `regeneration_attempt_count` parameter to enforce the cap in §4.1.1.
* `evidence-verdict` must return an Evidence Validation Confidence Score (not just Approved/Rejected) to drive the tiered workflow in §4.3.1.

---

## 7. Security & Compliance (Non-Functional)

1. **Authentication** — unchanged (Supabase Auth, session auto-refresh, blocked unauthorized routes).
2. **Row-Level Security (RLS)** — must be re-verified against the RBAC table in §3; the "authenticated read = all controls" pattern noted in the technical context needs explicit sign-off that this is intentional (broad read, restricted write) rather than an oversight, given the domain-segmented RBAC promised in §3.
3. **Audit Trail** — every insert/update/delete on `controls`, `evidence`, `gaps`, and the two new confidence-scored generation events must write to `audit_log`, including: actor (human or `system:ai`), the AI confidence score at time of action (if applicable), and whether a human override changed an AI-proposed status.
4. **Human Override Field (new)** — add `human_overridden boolean` and `override_reason text` to `controls` and `evidence`. Any human approver who changes an AI-proposed verdict must record a reason. This is the primary artifact for defending automated decisions to an external auditor.
5. **Data Residency (new — must be resolved before further build)** — this system is explicitly designed around RBI (Indian financial regulator) requirements. The Supabase project region, and any data localization obligations that follow from housing regulated Indian financial-sector data, must be documented and confirmed compliant before this PRD can move from Draft to Approved. This is a blocking item, not a nice-to-have.

---

## 8. Configuration Requirements (new)
The following must be **org-configurable**, not hard-coded, since thresholds are compliance-sensitive and will differ by regulator/client:
* Mapping confidence thresholds (ingestion): default 0.85 / 0.65.
* Control Generation Confidence thresholds: default 0.85 / 0.65.
* Evidence Validation Confidence thresholds: default 0.90 / 0.70.
* Regeneration attempt cap: default 3.

---

## 9. Status & Sign-off Requirements (new)
This document remains **Draft** until:
* §7.5 (data residency) is resolved.
* A named human Product Owner (not "AI Coding Assistant") signs off.
* Stage 5 (AI Edge Functions) and Stage 6 (Access Control) in the companion Build Stages document reach at least 90% completion, since core claims in §1.3 depend on them.
