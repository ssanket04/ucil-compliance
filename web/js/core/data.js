/* ============================================================
   DATA.JS — Central data store (replace with API calls later)
   ============================================================ */
const DATA = {

  metrics: {
    uniqueCanonical: 200,
    implemented: 150,
    inProgress: {
      pendingSME: 6,
      evidenceUnderReview: 12,
      evidencePending: 10,
      evidenceReassigned: 15
    },
    openGaps: 7,
    criticalGaps: 2,
    circularsIngested: 1,
    frameworksIngested: 6,
    internalPolicies: 1,
    totalSourcesIngested: 8,
    aiAutoApprovalRate: 97,
    controlMultiplier: 5.2,
    totalMappings: 1040
  },

  frameworks: [
    { name: 'ISO 27001', pct: 88, status: 'Compliant',           satisfied: 88, partial: 0,  missing: 12 },
    { name: 'SOX',       pct: 91, status: 'Compliant',           satisfied: 91, partial: 0,  missing: 9  },
    { name: 'NIST CSF',  pct: 82, status: 'Partially Compliant', satisfied: 72, partial: 10, missing: 18 },
    { name: 'RBI CSF',   pct: 76, status: 'Partially Compliant', satisfied: 60, partial: 16, missing: 24 },
    { name: 'PCI-DSS',   pct: 70, status: 'Not Compliant',       satisfied: 55, partial: 15, missing: 30 },
    { name: 'COBIT',     pct: 64, status: 'Not Compliant',       satisfied: 50, partial: 14, missing: 36 },
  ],

  controls: [
    {
      id: 'CC-0041', name: 'User access review', domain: 'Access Control',
      description: 'Access reviewed and revoked upon role change or termination',
      frameworks: ['ISO A.8.2', 'SOX ITGC', 'RBI 3.1'],
      extra: ['NIST PR.AC-1', 'COBIT APO01'],
      owner: 'IT Security', domainHead: 'Sanjay Mehta',
      status: 'Active', domainColor: 'blue', confidence: 0.94,
      reason: 'All mapped frameworks verified. Evidence uploaded and approved.',
    },
    {
      id: 'CC-0089', name: 'Privileged access logging', domain: 'Privileged Access',
      description: 'Privileged access logged and reviewed by IT Risk team',
      frameworks: ['NIST PR.AC', 'PCI 7.2', 'ISO A.9.4'],
      extra: [],
      owner: 'IT Risk', domainHead: 'Sanjay Mehta',
      status: 'Active', domainColor: 'amber', confidence: 0.91,
      reason: 'Logging tool verified; access review process documented.',
    },
    {
      id: 'CC-0112', name: 'Incident response testing', domain: 'Incident Mgmt',
      description: 'IR plan tested with documented tabletop exercise',
      frameworks: ['ISO A.16.1', 'NIST RS.RP', 'RBI 5.2'],
      extra: [],
      owner: 'Compliance', domainHead: 'Priya Sharma',
      status: 'Under Review', domainColor: 'red', confidence: 0.78,
      reason: 'Last test documentation is under review by Domain Head. Pending approval.',
    },
    {
      id: 'CC-0203', name: 'Encryption at rest', domain: 'Data Protection',
      description: 'AES-256 encryption for all customer PII data',
      frameworks: ['PCI 3.5', 'ISO A.8.24', 'RBI 4.1'],
      extra: [],
      owner: 'IT Security', domainHead: 'Priya Sharma',
      status: 'Active', domainColor: 'green', confidence: 0.82,
      reason: 'Encryption standard confirmed by IT Security team. Audit trail complete.',
    },
    {
      id: 'CC-0287', name: 'Change management approval', domain: 'Change Mgmt',
      description: '4-eye approval with full audit trail in ITSM tool',
      frameworks: ['COBIT BAI06', 'SOX ITGC', 'ISO A.8.32'],
      extra: [],
      owner: 'IT Governance', domainHead: 'Rahul Verma',
      status: 'Failed', domainColor: 'gray', confidence: 0.88,
      reason: 'ITSM audit trail export failed during last compliance run. Reassessment required.',
    },
    {
      id: 'CC-0345', name: 'Data retention policy', domain: 'Data Protection',
      description: 'Data classified and retained per defined retention schedules',
      frameworks: ['ISO A.8.10', 'RBI 6.1'],
      extra: [],
      owner: 'Compliance', domainHead: 'Priya Sharma',
      status: 'Active', domainColor: 'green', confidence: 0.86,
      reason: 'Retention schedule approved and implemented.',
    },
    // Generate remaining 194 controls with proper status distribution
    // Total: Active: 150 (4 detailed + 146 generated), Under Review: 43 (1 detailed + 42 generated), Failed: 7 (1 detailed + 6 generated)
    ...Array.from({ length: 194 }, (_, i) => {
      const id = `CC-${String(i + 400).padStart(4, '0')}`;
      const domains = ['Access Control', 'Privileged Access', 'Incident Mgmt', 'Data Protection', 'Change Mgmt'];
      const domainHeads = { 'Access Control': 'Sanjay Mehta', 'Privileged Access': 'Sanjay Mehta', 'Incident Mgmt': 'Priya Sharma', 'Data Protection': 'Priya Sharma', 'Change Mgmt': 'Rahul Verma' };
      const owners = ['IT Security', 'IT Risk', 'Compliance', 'IT Governance'];
      const frameworks = [['ISO A.8.2', 'SOX ITGC'], ['NIST PR.AC', 'PCI 7.2'], ['ISO A.16.1', 'RBI 5.2'], ['PCI 3.5', 'ISO A.8.24']];
      const domain = domains[i % domains.length];
      
      // Status distribution: Active: 146 more (150-4), Under Review: 42 more (43-1), Failed: 6 more (7-1)
      let status, reason;
      if (i < 6) {
        status = 'Failed';
        reason = 'Control implementation failed validation. Remediation required.';
      } else if (i < 48) {
        status = 'Under Review';
        reason = 'Evidence submitted and pending Domain Head review.';
      } else {
        status = 'Active';
        reason = 'Control verified and documented. All requirements satisfied.';
      }
      
      return {
        id,
        name: `Control ${id.slice(3)}`,
        domain,
        description: `Control requirement for ${domain.toLowerCase()}`,
        frameworks: frameworks[i % frameworks.length],
        extra: i % 3 === 0 ? ['COBIT APO01'] : [],
        owner: owners[i % owners.length],
        domainHead: domainHeads[domain],
        status,
        domainColor: ['blue', 'amber', 'red', 'green', 'gray'][i % 5],
        confidence: 0.75 + (i % 20) * 0.01,
        reason,
      };
    })
  ],

  mappings: [
    { id: 'CC-0041', name: 'User access review',        canon: 'Least-privilege, revoke on change or exit',  iso: 'A.8.2, A.9.2', nist: 'PR.AC-1', rbi: '3.1.2', sox: 'ITGC-AC', conf: 0.94, mult: 5, multColor: 'green', satisfies: '5 frameworks — ISO, NIST, RBI, SOX, COBIT' },
    { id: 'CC-0089', name: 'Privileged access logging', canon: 'Log and review all privileged activity',      iso: 'A.9.4',         nist: 'PR.AC-4', rbi: '3.2.1', sox: 'ITGC-PA', conf: 0.91, mult: 4, multColor: 'green', satisfies: '4 frameworks — ISO, NIST, RBI, SOX' },
    { id: 'CC-0112', name: 'Incident response testing', canon: 'Tested IR plan, documented lessons learned', iso: 'A.16.1',        nist: 'RS.RP-1', rbi: '5.2.4', sox: '—',       conf: 0.78, mult: 3, multColor: 'blue',  satisfies: '3 frameworks — ISO, NIST, RBI' },
    { id: 'CC-0203', name: 'Encryption at rest',        canon: 'AES-256 encryption for PII data',            iso: 'A.8.24',        nist: 'PR.DS-1', rbi: '4.1.3', sox: '—',       conf: 0.82, mult: 3, multColor: 'blue',  satisfies: '3 frameworks — ISO, NIST, RBI' },
    { id: 'CC-0287', name: 'Patch management SLA',      canon: 'Severity-based remediation SLA',             iso: 'A.8.8',         nist: 'ID.RA-1', rbi: '—',     sox: 'ITGC-CM', conf: 0.61, mult: 2, multColor: 'amber', satisfies: '2 frameworks — ISO, SOX' },
  ],

  gaps: [
    { id: 'CC-0287', sev: 'critical', desc: 'Change management approval — ITSM audit trail export failed during last compliance run', why: 'Critical control gap identified in unified library. ITSM tool integration failure prevents audit trail generation.', impact: 'Regulatory penalty, supervisory observation letter, reputational damage.', benefit: 'Closes critical gap; demonstrates proactive cyber governance to regulators.', category: ['Financial', 'Reputational'] },
    { id: 'CC-0400', sev: 'critical',  desc: 'Cyber crisis management plan — no documented cyber crisis plan with defined escalation matrix', why: 'Multiple frameworks mandate formal documented risk analysis for each applicable requirement.', impact: 'Non-compliance finding in external audits. Potential regulatory fines.', benefit: 'Achieves full compliance; eliminates highest-risk audit finding.', category: ['Financial'] },
    { id: 'CC-0401', sev: 'high', desc: 'External stakeholder communication during incidents — no formalized procedure for external coordination', why: 'Control library lacks defined process for coordinating with external parties during incident response.', impact: 'Coordination failures during breach; reputational exposure if breach handling is disorganised.', benefit: 'Strengthens IR posture; closes incident response domain gap entirely.', category: ['Reputational', 'Non-financial'] },
    { id: 'CC-0402', sev: 'high', desc: 'Automated anomaly detection — no control mapped for anomaly-based alerting', why: 'Unified library missing monitoring control for anomaly detection capabilities.', impact: 'Delayed threat detection; audit non-conformity in next surveillance audit.', benefit: 'Closes monitoring gap; improves threat detection capability.', category: ['Non-financial'] },
    { id: 'CC-0403', sev: 'high', desc: 'SOC monitoring with escalation path — no 24×7 monitoring SLA or escalation procedure', why: 'Control library lacks continuous cyber event monitoring with defined escalation SLA.', impact: 'Regulatory exposure in next examination cycle. Potential directive issued.', benefit: 'Satisfies monitoring requirements in full across multiple frameworks.', category: ['Financial', 'Non-financial'] },
    { id: 'CC-0404', sev: 'medium', desc: 'Continuous risk profile management — only periodic assessments found, no continuous update process', why: 'Control library shows periodic reviews only; missing ongoing risk profile maintenance.', impact: 'Risk posture may be stale between periodic reviews; emerging risks undetected.', benefit: 'Supports continuous assurance model across frameworks.', category: ['Non-financial'] },
    { id: 'CC-0405', sev: 'low', desc: 'Security awareness records — training completion not linked to evidence requirement', why: 'Control library missing documented evidence linkage for awareness program delivery.', impact: 'Minor gap; unlikely to cause audit finding in isolation.', benefit: 'Completes awareness coverage; supports evidence reuse in future audits.', category: ['Non-financial'] },
  ],

  evidence: [
    {
      controlId: 'CC-0041', controlName: 'User access review', domain: 'Access Control',
      files: [
        { name: 'Access_Review_Q1_2025.pdf', size: '2.4 MB', uploadedBy: 'Anita Roy', uploadedDate: '15 Apr 2025', status: 'Approved', reviewer: 'IT Security', reviewDate: '16 Apr 2025' },
        { name: 'IAM_Revocation_Log.xlsx',   size: '840 KB', uploadedBy: 'Anita Roy', uploadedDate: '15 Apr 2025', status: 'Approved', reviewer: 'IT Security', reviewDate: '16 Apr 2025' },
      ],
      timeline: [
        { action: 'Evidence uploaded by Anita Roy', time: '15 Apr 2025, 10:32', type: 'info' },
        { action: 'Approved by Control Owner (IT Security)', time: '16 Apr 2025, 09:15', type: 'success' },
        { action: 'Approved by Domain Head (Sanjay Mehta)', time: '17 Apr 2025, 09:15', type: 'success' },
      ],
      overallStatus: 'Approved',
      aiVerdict: null,
      manualRemark: 'Access review process well-documented. Evidence aligns with ISO A.8.2 requirements.',
    },
    {
      controlId: 'CC-0112', controlName: 'Incident response testing', domain: 'Incident Mgmt',
      files: [
        { name: 'Tabletop_Exercise_Mar2025.pdf', size: '1.8 MB', uploadedBy: 'Ravi Kumar', uploadedDate: '20 Mar 2025', status: 'Under Review', reviewer: 'Compliance', reviewDate: null },
      ],
      timeline: [
        { action: 'Evidence uploaded by Ravi Kumar', time: '20 Mar 2025, 11:00', type: 'info' },
        { action: 'Under review by Control Owner (Compliance)', time: '20 Mar 2025, 11:05', type: 'warning' },
      ],
      overallStatus: 'Under Review',
      aiVerdict: null,
      manualRemark: null,
    },
    {
      controlId: 'CC-0203', controlName: 'Encryption at rest', domain: 'Data Protection',
      files: [
        { name: 'Encryption_Audit_2025.pdf', size: '3.1 MB', uploadedBy: 'Mohan Das', uploadedDate: '10 Apr 2025', status: 'Rejected', reviewer: 'IT Security', reviewDate: '12 Apr 2025' },
      ],
      timeline: [
        { action: 'Evidence uploaded by Mohan Das', time: '10 Apr 2025, 14:20', type: 'info' },
        { action: 'Rejected by Control Owner (IT Security)', time: '12 Apr 2025, 10:45', type: 'danger' },
      ],
      overallStatus: 'Rejected',
      aiVerdict: null,
      manualRemark: 'Document does not cover the cloud storage scope mandated by RBI. Please re-upload with cloud encryption evidence included.',
      observations: 'Missing evidence for Azure Blob Storage encryption. PCI DSS scope not covered.',
    },
  ],

  regulatory: [
    { 
      id: 'RBI/2024-25/112', 
      title: 'Cyber Resilience Framework Update', 
      issuer: 'RBI', 
      date: '12 Apr 2025', 
      impactedControls: 85,  // 85 unique controls map to RBI CSF (out of 200 total)
      gaps: 3,               // 3 of these 85 controls have Failed status (part of 7 total gaps)
      status: 'In review', 
      severity: 'critical',
      // Impacted controls: All controls that map to RBI CSF
      impactedIds: [
        { id: 'CC-0041', name: 'User access review', status: 'Active' },
        { id: 'CC-0089', name: 'Privileged access logging', status: 'Active' },
        { id: 'CC-0112', name: 'Incident response testing', status: 'Under Review' },
        { id: 'CC-0203', name: 'Encryption at rest', status: 'Active' },
        { id: 'CC-0287', name: 'Change management approval', status: 'Failed' },  // Gap 1
        { id: 'CC-0400', name: 'Cyber crisis management plan', status: 'Failed' },  // Gap 2
        { id: 'CC-0401', name: 'External stakeholder communication', status: 'Failed' },  // Gap 3
        // ... 78 more controls that map to RBI CSF (total 85)
      ],
      // Unmatched: RBI CSF requirements with no existing control mapping
      // These will be auto-created as new controls in unified library
      unmatched: [
        { ref: 'RBI-CSF-8.5', desc: 'Secure deletion of sensitive data with documented procedures', unifiedId: 'CC-0594' },
        { ref: 'RBI-CSF-9.2', desc: 'Third-party cyber risk assessment framework', unifiedId: 'CC-0595' },
        { ref: 'RBI-CSF-10.3', desc: 'Continuous monitoring of critical systems', unifiedId: 'CC-0596' },
      ]
    },
    { 
      id: 'PCI-DSS-v4.0.1', 
      title: 'PCI-DSS v4.0.1 Section 6 Update', 
      issuer: 'PCI SSC', 
      date: '01 Mar 2025', 
      impactedControls: 45,  // 45 unique controls map to PCI-DSS (out of 200 total)
      gaps: 0,               // All 45 controls are Active or Under Review
      status: 'Remediated', 
      severity: 'medium',
      impactedIds: [
        { id: 'CC-0089', name: 'Privileged access logging', status: 'Active' },
        { id: 'CC-0203', name: 'Encryption at rest', status: 'Active' },
        // ... 43 more controls
      ],
      unmatched: []
    },
    { 
      id: 'ISO-27001-2022', 
      title: 'ISO 27001:2022 Annex A Update', 
      issuer: 'ISO', 
      date: '15 Jan 2025', 
      impactedControls: 120,  // 120 unique controls map to ISO 27001 (out of 200 total)
      gaps: 0,                // All 120 controls are Active or Under Review
      status: 'Remediated', 
      severity: 'low',
      impactedIds: [
        { id: 'CC-0041', name: 'User access review', status: 'Active' },
        { id: 'CC-0345', name: 'Data retention policy', status: 'Active' },
        // ... 118 more controls
      ],
      unmatched: []
    },
  ],

  notifications: [
    { id: 'N001', type: 'danger',  icon: '🚨', title: 'Critical gap created',           sub: 'CC-0512 marked critical. Action required from Compliance team.', person: 'System', time: '2h ago',  unread: true, action: 'gaps' },
    { id: 'N002', type: 'warning', icon: '📋', title: 'Evidence rejected',              sub: 'Encryption at rest (CC-0203) evidence returned to Mohan Das. Remarks attached.', person: 'Priya Sharma', time: '3h ago', unread: true, action: 'evidence' },
    { id: 'N003', type: 'info',    icon: '⚡', title: 'Regulatory update detected',     sub: 'RBI/2024-25/112 affects 85 controls. Impact report generated.', person: 'System', time: '5h ago', unread: true, action: 'regulatory' },
    { id: 'N004', type: 'success', icon: '✅', title: 'Evidence approved',              sub: 'User access review (CC-0041) evidence approved by Sanjay Mehta.', person: 'Sanjay Mehta', time: '1d ago', unread: false, action: 'evidence' },
    { id: 'N005', type: 'warning', icon: '⚠',  title: 'Compliance conflict detected',  sub: 'BCP testing frequency conflict between ISO A.17.1 and RBI CSF 6.3 flagged in SME review.', person: 'System', time: '1d ago', unread: false, action: 'queue' },
  ],

  scanInfo: {
    lastCircularScan:  { timestamp: '17 Apr 2025, 08:00', status: 'up-to-date' },
    lastComplianceEval:{ timestamp: '16 Apr 2025, 23:00', status: 'up-to-date' },
    nextScheduledScan: { timestamp: '18 Apr 2025, 08:00', status: 'pending' },
  },

  queue: [
    { 
      id: 'MAP-0387', 
      conf: 0.74, 
      uniqueControl: 'Business continuity plan with documented testing and escalation',
      frameworkControls: [
        { framework: 'ISO 27001 A.17.1', requirement: 'Annual BCP test with documented results' },
        { framework: 'RBI CSF 6.3', requirement: 'Biannual BCP test with defined escalation matrix' }
      ],
      frameworks: [{ label: 'ISO A.17.1', color: 'blue' }, { label: 'RBI CSF 6.3', color: 'gray' }], 
      conflict: 'Frequency: ISO annual vs RBI biannual',
      conflictDetail: {
        issue: 'Testing frequency requirements differ between frameworks',
        compliant: 'ISO 27001 A.17.1 (requires annual testing)',
        nonCompliant: 'RBI CSF 6.3 (requires biannual testing - every 6 months)',
        impact: 'Current annual testing schedule satisfies ISO but creates a compliance gap for RBI regulatory requirements',
        resolution: 'Increase BCP testing frequency to biannual (every 6 months). This satisfies RBI\'s stricter requirement while maintaining ISO compliance, as biannual testing exceeds ISO\'s minimum annual requirement.'
      }
    },
    { 
      id: 'MAP-0412', 
      conf: 0.79, 
      uniqueControl: 'Third-party vendor risk assessment and monitoring',
      frameworkControls: [
        { framework: 'ISO 27001 A.5.22', requirement: 'Supplier security assessment prior to onboarding' },
        { framework: 'NIST ID.SC-2', requirement: 'Suppliers and third-party partners identified and assessed' },
        { framework: 'RBI CSF 7.1', requirement: 'Third-party risk management with periodic review' }
      ],
      frameworks: [{ label: 'ISO A.5.22', color: 'blue' }, { label: 'NIST ID.SC-2', color: 'gray' }, { label: 'RBI CSF 7.1', color: 'green' }], 
      conflict: null,
      conflictDetail: null
    },
    { 
      id: 'MAP-0445', 
      conf: 0.68, 
      uniqueControl: 'Password complexity and length requirements',
      frameworkControls: [
        { framework: 'ISO 27001 A.9.4', requirement: 'Minimum 12 characters with special character enforcement' },
        { framework: 'NIST PR.AC-7', requirement: 'Password length prioritized over complexity requirements' }
      ],
      frameworks: [{ label: 'ISO A.9.4', color: 'blue' }, { label: 'NIST PR.AC-7', color: 'gray' }], 
      conflict: null,
      conflictDetail: null
    },
    { 
      id: 'MAP-0502', 
      conf: 0.72, 
      uniqueControl: 'Data backup and recovery with defined objectives',
      frameworkControls: [
        { framework: 'ISO 27001 A.8.13', requirement: 'Backup testing with documented recovery procedures' },
        { framework: 'RBI CSF 6.2', requirement: 'Backup with RTO ≤ 4 hours and RPO ≤ 1 hour' }
      ],
      frameworks: [{ label: 'ISO A.8.13', color: 'blue' }, { label: 'RBI CSF 6.2', color: 'green' }], 
      conflict: 'RTO/RPO: RBI specifies stricter objectives',
      conflictDetail: {
        issue: 'Recovery time and recovery point objectives differ in specificity',
        compliant: 'ISO 27001 A.8.13 (requires backup testing with documented procedures)',
        nonCompliant: 'RBI CSF 6.2 (mandates specific RTO ≤ 4 hours and RPO ≤ 1 hour)',
        impact: 'Current backup procedures satisfy ISO\'s general testing requirement but lack the specific RTO/RPO targets mandated by RBI for regulatory compliance',
        resolution: 'Document and implement specific recovery objectives: RTO ≤ 4 hours and RPO ≤ 1 hour. Update backup testing procedures to validate these targets. This satisfies RBI\'s specific requirements while maintaining ISO compliance.'
      }
    },
    { 
      id: 'MAP-0578', 
      conf: 0.66, 
      uniqueControl: 'Network segmentation with DMZ isolation',
      frameworkControls: [
        { framework: 'PCI-DSS 1.3', requirement: 'DMZ architecture with specific firewall rules for internet-facing systems' },
        { framework: 'NIST PR.AC-5', requirement: 'Network segmentation with flexible isolation approaches' }
      ],
      frameworks: [{ label: 'PCI 1.3', color: 'blue' }, { label: 'NIST PR.AC-5', color: 'gray' }], 
      conflict: null,
      conflictDetail: null
    },
    { 
      id: 'MAP-0621', 
      conf: 0.83, 
      uniqueControl: 'Encryption key management with secure storage',
      frameworkControls: [
        { framework: 'PCI-DSS 3.6', requirement: 'Cryptographic key management with HSM protection' },
        { framework: 'ISO 27001 A.8.24', requirement: 'Key management with secure generation and storage' }
      ],
      frameworks: [{ label: 'PCI 3.6', color: 'blue' }, { label: 'ISO A.8.24', color: 'gray' }], 
      conflict: null,
      conflictDetail: null
    },
  ],
};
