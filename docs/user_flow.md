# Unified Control Intelligence Layer (UCIL) — User Flow & Lifecycle Scenarios

This document details the step-by-step user interaction flows, state transitions, and edge cases inside the UCIL application, starting from authentication to document ingestion and evidence validation.

---

## 1. Phase 1: Authentication & Role Setup

### 1.1 Login & Account Creation
1. The user navigates to the application. If no active session exists, they are redirected to the Login card.
2. **Login Scenario**: The user enters their email and password.
   * If credentials match, the session is initialized, `setCurrentUser()` stores their profile, and they are redirected to the Dashboard.
   * If credentials fail (e.g. incorrect password or network error), the form displays a red warning banner: *"Invalid login credentials"* or *"Could not connect to database"*.
3. **Sign-Up Scenario**: The user toggles to "Create Account", enters their name, email, password, and selects a role (Control Owner, Domain Head, Compliance Lead, CISO, Admin).
   * Registering inserts a profile into `public.users` via database trigger.
   * Once sign-up is complete, they are logged in automatically.

---

## 2. Phase 2: Empty Database (Zero-State Baseline)

If the database is clean (e.g., after running a truncation script):
* **Dashboard**: All cards show exactly `0`. The framework coverage block displays: *"No framework/standard/circulars ingested yet. Ingest your first policy or standard document to dynamically generate compliance and multiplier analytics."*
* **Unified Library**: Displays an empty state: *"No compliance controls mapped yet. Ingest your first document to dynamically build this library."*
* **Evidence Management**: Shows folders count as `0` and a guide card: *"No controls or evidence folders generated yet. Upload your first regulatory standard or policy in the Ingestion tab..."*
* **SME Review Queue**: Shows: *"All mappings verified. Review queue is empty."*
* **Gap Analysis**: Shows: *"No open compliance gaps detected. Your library is fully covered!"*
* **Regulatory Change Impact**: Shows: *"No regulatory changes or circulars ingested yet."*
* **Conflicts Panel**: Shows: *"No policy or standard conflicts identified."*
* **Notifications**: Shows: *"No recent notifications to display."*
* **Sidebar Queue Badge**: Defaults to `0` (hidden).

---

## 3. Phase 3: Data Ingestion Flow (Manual Document Ingestion)

This details what happens when a Compliance Lead uploads a new regulation document:

```
[ Ingest manual upload ] ──► Calculates file SHA-256 client-side
           │
           ▼
[ Storage Upload ] ───────► Files bucket upload (upsert = false)
           │
           ▼
[ Deno Edge Function ] ───► AI analysis via Groq LLaMA models
           │
           ├── Matches existing Canonical Controls -> updates status
           └── Finds new requirement gaps -> inserts to Gaps table
           │
           ▼
[ DB Triggers ] ──────────► recalculate_metrics() recalculates aggregate KPIs
           │
           ├── Updates single metrics row (Single Source of Truth)
           └── dispatches notify_on_evidence_change() -> recipient notifications
           │
           ▼
[ Real-time Sync ] ───────► Client UI metrics & SME badge update instantly
```

### 3.1 Edge Case: Uploading large files
* If a file exceeds **50MB**, the browser intercepts it on the client side before triggering any network requests. An error banner displays: *"File [name] exceeds the 50MB limit. Please compress the document."*

---

## 4. Phase 4: Mappings & SME Review Queue Flow

1. For AI mappings returning a confidence score between **0.50 and 0.84**, the system routes a review card to the **SME Review Queue**.
2. **SME Action - Approve**: The SME clicks "Approve".
   * This creates a record in `control_framework_mappings`.
   * The review card status changes to `'Approved'`.
   * The trigger recalculates metrics, updating the dashboard auto-approval rate and decrementing the sidebar badge instantly.
3. **SME Action - Reject**: The SME clicks "Reject".
   * A justification text is mandatory. If left blank, the UI stops execution and warns: *"Justification is mandatory"*.
   * Once rejected, the card status becomes `'Rejected'`.
4. **Concurrency Scenario**: If two SMEs try to resolve the same queue card simultaneously:
   * The first click updates the status to `'Approved'` or `'Rejected'`.
   * The second click matches `status = 'Pending'` but finds 0 rows, throwing a lock exception. The UI notifies the second SME: *"This item has already been resolved by another reviewer."*

---

## 5. Phase 5: Evidence Management & Review Cycle

1. When a control is created, the Control Owner opens the folder in the **Evidence Management** tab.
2. **Uploading Evidence**: The Control Owner uploads an audit log file (PDF/TXT).
   * The file is uploaded, and the database status is set to `'Pending'`.
   * The Control Owner clicks "Submit for Review", changing status to `'Under Review'`.
   * The trigger `notify_on_evidence_change` dispatches a notification to the assigned Domain Head: *"Evidence ready for review for control [code]"*.
3. **Domain Head Action**: The Domain Head opens their view, selects the file, and:
   * **Approves**: Status set to `'Approved'`. Trigger updates the controls table to `Active`.
   * **Rejects**: Rejection reason is mandatory. Status set to `'Rejected'`. Trigger updates control to `Failed`, and a gap is created automatically.
4. **Tamper Event Scenario**: If a file in storage is altered or replaced maliciously after upload:
   * The server-side verification recalculates the SHA-256 hash during review.
   * Recognizing a signature mismatch, the system auto-rejects the evidence package (`ai_verdict = 'Rejected'`) and writes a security alert block to the audit logs.

---

## 6. Phase 6: Operational & Resiliency Scenarios

* **Edge Function Offline state**: If Groq API goes offline or the edge function times out, the database intercept sets `ai_status = 'error'`, and the UI displays a warning: *"AI assessment temporarily unavailable. Task routed for manual evaluation."*
* **Browser Refreshes**: Auth sessions are verified on load. Refreshing does not log the user out, and page parameters (like control ID links) are preserved.
