# Product Requirements Document (PRD)
## Unified Control Intelligence Layer (UCIL) — Enterprise Compliance Platform
**Version:** 1.1  
**Status:** RELEASE APPROVED  
**Classification:** Restricted — Internal Use Only  
**Author:** Lead Software Architect & Product Director  
**Date:** July 6, 2026  

---

## 1. Executive Summary & Business Context

### 1.1 Background
Enterprises in highly regulated industries (banking, insurance, cybersecurity, and cloud services) face a continuous influx of overlapping regulatory standards and guidelines. Typically, compliance is managed in silos. Separate teams audit the same controls independently for different frameworks—such as **ISO/IEC 27001**, **NIST CSF**, **PCI-DSS**, **COBIT**, **SOX**, and local guidelines like the **Reserve Bank of India (RBI) Cyber Security Framework**. This leads to:
* **Duplicate Work**: Implementing, testing, and auditing similar controls multiple times.
* **Evidence Fatigue**: Control owners uploading the same audit logs to multiple portals.
* **Lack of Visibility**: Senior executives have no single view of the overall compliance posture.
* **Ingestion Bottlenecks**: Compliance teams manually mapping new circulars against hundreds of pages of existing control structures.

### 1.2 The UCIL Solution
The Unified Control Intelligence Layer (UCIL) consolidates compliance frameworks into a single, deduplicated **Unified Control Library (UCL)**. By employing a database-first architecture and LLaMA-based AI Edge Functions, UCIL automates the ingestion, mapping, and audit verification lifecycle. It reduces compliance costs by utilizing control reuse while maintaining full auditor traceability.

---

## 2. Key Product Metrics

UCIL aggregates compliance status using mathematical formulas calculated in the database layer via triggers:

### 2.1 Control Multiplier (Efficiency Factor)
Represents the average number of framework clauses satisfied by a single canonical control:
$$\text{Control Multiplier} = \frac{\text{Total Framework Mapped Clauses}}{\text{Total Unique Canonical Controls}}$$
*Target:* $> 3.5\times$ (meaning one test satisfies more than three audits).

### 2.2 Framework Compliance Percentage
Measures the coverage percentage of a specific framework based on satisfied requirements:
$$\text{Framework Compliance \%} = \frac{\text{Active Canonical Controls satisfying Framework}}{\text{Total Mapped Controls in Framework}} \times 100$$

### 2.3 AI Auto-Approval Rate
Tracks the percentage of framework mappings automatically approved by AI without manual SME intervention:
$$\text{Auto-Approval \%} = \frac{\text{Mappings with status = 'Auto-Approved'}}{\text{Total Control–Framework Mappings}} \times 100$$

---

## 3. User Personas & RBAC Matrix

The system enforces Row-Level Security (RLS) policies based on six user personas:

| Persona | Description | Primary Screen Access | Allowed DB Mutations |
|---|---|---|---|
| **CISO** | Executive monitor. Reviews dashboard, audit feeds, and exports audits. | Dashboard, UCL, Reports | None |
| **Compliance Lead** | Platform operator. Ingests documents, routes SME tasks, manages conflicts. | Ingestion, Gaps, Regulatory | Frameworks, Circulars, Gaps |
| **Domain Head** | Technical leader. Approves evidence and overrides generated controls. | Domain Head, UCL | Controls (Status), Evidence (Verdict) |
| **Control Owner** | Action owner. Uploads evidence files, tracks reassigned items. | Evidence, UCL | Evidence (Insert) |
| **SME Reviewer** | Specialist. Resolves low-confidence clause-to-control mapping cards. | SME Review Queue | Mappings, SME Queue |
| **Admin** | System admin. Manages users, tables, and settings. | All screens | All tables |

---

## 4. Module-by-Module Functional Requirements

### 4.1 Dashboard
* **Metrics Cards**: Displays Canonical Controls, Implemented Controls, In Progress Reviews, and Open Gaps. All values are read from the single-source `metrics` row.
* **Framework Compliance Status**: Lists progress bars indicating percentage coverage per loaded standard.
* **SecOps Audit Trail**: Surfaces real-time logs with cryptographic verification status (Tamper Check Indicator).
* **Live Circular Scraper**: Displays the automated scraper's scan status and last run timestamp.

### 4.2 Unified Control Library
* **Unified Inventory**: Consolidates all canonical controls in a scrollable list.
* **Dynamic Filters**: Filters controls by status, domain, framework, and search terms.
* **Details Panel**: Shows the requirement description, domain head, associated owner, mapped framework clauses, and historical audit logs.

### 4.3 Evidence Management
* **Evidence Folders**: Every canonical control has a private evidence folder.
* **Upload Zone**: Control Owners drag and drop files. Form enforces a **50MB maximum size limit** and calculates a SHA-256 hash client-side.
* **Timeline Feed**: Shows chronological logs (file uploads, AI checks, manual reviews, reassignments).

### 4.4 SME Review Queue
* **Mapping Resolution**: Displays mapping proposals that fell into the 0.50–0.84 AI confidence band.
* **Approval Gates**: SMEs approve mappings (optional justification) or reject them (mandatory justification). Approvals write to `control_framework_mappings`.

### 4.5 Data Ingestion
* **Document Upload**: Ingests PDF, DOCX, or XLSX circulars.
* **Connected Ingestion Sources**: Displays currently loaded compliance standards and internal policies.
* **Recent History**: Tabulates ingestion jobs, listing method, total controls mapped, and status.

### 4.6 Gap Analysis
* **Gaps Registry**: Lists open compliance gaps, categorized by severity (Critical, High, Medium, Low).
* **AI Remediation Planner**: Generates a unified action plan with recommended deadlines, effort estimates, and responsible teams.

### 4.7 Regulatory Change Impact
* **Impact Matrix**: Maps incoming circulars to existing controls.
* **Gaps Created**: Highlights unmatched circular clauses that were auto-rejected by AI and converted into gaps.

### 4.8 Domain Head View
* **Domain Queue**: Consolidates controls under review, pending evidence uploads, and rejected files within the domain.
* **Direct Actions**: Permits approving or rejecting evidence packages on behalf of the domain.

### 4.9 Notifications Center
* **Live Alerts**: Communicates task assignments, evidence approvals, low-confidence rejections, and system errors.
* **Real-time Sync**: Badges on the sidebar update instantly via Supabase subscription channels.

---

## 5. Ingestion & AI Mapping Architecture

UCIL coordinates ingestion through a 4-step pipeline:

```
[ Ingest UI Upload ] ──────────► 1. Compute SHA-256 hash client-side
       │
       ▼
[ Storage API ] ───────────────► 2. Upload file to evidence-files bucket
       │
       ▼
[ Database Insert ] ───────────► 3. Create regulatory_changes record
       │
       ▼
[ Deno Edge Function ] ────────► 4. Call regulatory-impact with record UUID
                                        │
                                        ▼ (Processes with LLaMA)
                                 - Inserts mappings (confidence >= 0.85)
                                 - Inserts SME reviews (0.50 <= conf < 0.85)
                                 - Inserts gaps (confidence < 0.50)
```

---

## 6. System Synchronization Rules (Triggers)

Data consistency is enforced in the database via triggers:
1. **Metrics Sync (`trg_metrics_on_*`)**: Updates the `metrics` row on insert/update/delete of controls, evidence, gaps, or mappings.
2. **Evidence-to-Control Sync (`trg_sync_evidence_to_control`)**:
   * If all evidence is approved → control status set to `Active`.
   * If any evidence is rejected → control status set to `Failed`.
   * Otherwise → control status set to `Under Review`.
3. **Control-to-Gap Linkage (`trg_sync_control_to_gap`)**: If a control fails, an open gap is inserted automatically. When the control returns to Active, the gap status is updated to `Resolved`.

---

## 7. Security & Observability Specification

* **Row-Level Security (RLS)**: Enforced on all tables. Only authorized users or administrators can mutate rows.
* **Signed URLs**: Storage bucket is private. Clients download files via temp signed URLs (expires in 3600s).
* **SecOps Audit Trail**: Every data mutation writes to `audit_log`. Each entry contains the previous log entry's hash, creating an immutable SHA-256 block chain ledger.

---

## 8. Fail-Safe fallbacks & Error Handling

* **Edge Function Offline Fallback**: If an AI Edge Function fails, the system logs the error, marks the record's `ai_status = 'error'`, and routes the task to a manual review queue. The UI displays an warning card instead of locking or crashing.
* **Network Interruptions**: The frontend intercepts fetch exceptions using `PageErrorBoundary` blocks, showing a refresh option while preserving local state.
