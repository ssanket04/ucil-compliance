-- ============================================================
-- UCIL — 05_seed_demo.sql   (OPTIONAL — demo / staging only)
-- ------------------------------------------------------------
-- DO NOT run in production. Populates representative data so the
-- UI is non-empty before real documents are ingested. Idempotent
-- (ON CONFLICT DO NOTHING). Run AFTER 01–04.
-- ============================================================

INSERT INTO public.frameworks (name, type, version, issuer, satisfied_pct, partial_pct, missing_pct, compliance_status, status) VALUES
('ISO 27001',       'Framework',       '2022', 'ISO',     88, 0,  12, 'Compliant',           'Loaded'),
('SOX',             'Framework',       '2024', 'PCAOB',   91, 0,  9,  'Compliant',           'Loaded'),
('NIST CSF',        'Framework',       '2.0',  'NIST',    72, 10, 18, 'Partially Compliant', 'Loaded'),
('RBI CSF',         'Circular',        'v2',   'RBI',     60, 16, 24, 'Partially Compliant', 'Loaded'),
('PCI-DSS',         'Framework',       '4.0',  'PCI SSC', 55, 15, 30, 'Not Compliant',       'Loaded'),
('COBIT',           'Framework',       '2019', 'ISACA',   50, 14, 36, 'Not Compliant',       'Loaded'),
('Internal Policy', 'Internal Policy', 'v3',   'Internal',90, 5,  5,  'Compliant',           'Loaded')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.domains (name, description) VALUES
('Access Control',    'Controls related to user access, identity, and privilege management'),
('Privileged Access', 'Controls for privileged and administrative account management'),
('Incident Mgmt',     'Controls for incident detection, response, and recovery'),
('Data Protection',   'Controls for data encryption, classification, and retention'),
('Change Mgmt',       'Controls for change management and configuration control'),
('Risk Management',   'Controls for risk assessment and treatment'),
('Vendor Management', 'Controls for third-party and vendor risk')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.scan_info (scan_type, status, completed_at, next_scheduled_at) VALUES
('circular_scan',    'up-to-date', NOW() - INTERVAL '10 hours', NOW() + INTERVAL '14 hours'),
('compliance_eval',  'up-to-date', NOW() - INTERVAL '1 day',    NOW() + INTERVAL '23 hours'),
('scheduled_scrape', 'pending',    NULL,                        NOW() + INTERVAL '14 hours')
ON CONFLICT (scan_type) DO NOTHING;

INSERT INTO public.regulatory_changes (circular_id, title, issuer, issued_date, total_impacted, total_gaps_created, status, detected_by) VALUES
('RBI/2024-25/112', 'Cyber Resilience Framework Update', 'RBI',     '2025-04-12', 23, 3, 'Active',     'Web Scraper'),
('PCI-DSS-v4.0.1',  'PCI-DSS v4.0.1 Section 6 Update',   'PCI SSC', '2025-03-01', 11, 0, 'Remediated', 'Manual'),
('ISO-27001-2022',  'ISO 27001:2022 Annex A Update',     'ISO',     '2025-01-15', 8,  0, 'Remediated', 'Manual')
ON CONFLICT (circular_id) DO NOTHING;

INSERT INTO public.conflicts
  (conflict_code, title, policy_ref_1, requirement_1, policy_ref_2, requirement_2, status, partial_status, explanation, suggested_resolution) VALUES
('CONF-001', 'Data retention period conflict',
 'ISO 27001 A.8.10', '3-year retention minimum', 'RBI CSF 5.4.2', '5-year retention minimum',
 'Conflict Detected', 'Compliant with ISO 27001, Non-compliant with RBI CSF',
 'ISO requires minimum 3-year data retention while RBI mandates 5 years. Internal policy currently aligned to 3 years, creating a compliance gap against RBI.',
 'Align internal policy to 5-year retention to satisfy both frameworks simultaneously.'),
('CONF-002', 'BCP testing frequency conflict',
 'ISO 27001 A.17.1', 'Annual BCP test', 'RBI CSF 6.3', 'Biannual BCP test',
 'Conflict Detected', 'Compliant with ISO 27001, Non-compliant with RBI CSF',
 'ISO requires annual BCP testing. RBI requires biannual (every 6 months). Current practice is annual only.',
 'Increase BCP testing to biannual cadence to satisfy RBI without violating ISO.')
ON CONFLICT (conflict_code) DO NOTHING;

INSERT INTO public.gaps (gap_code, clause_ref, severity, description, why_critical, impact_if_unresolved, benefit_if_resolved, impact_category, status) VALUES
('CC-0287', 'COBIT-BAI06', 'critical', 'Change management approval — ITSM audit trail export failed during last compliance run',
 'Critical control gap identified in unified library. ITSM tool integration failure prevents audit trail generation.',
 'Regulatory penalty, supervisory observation letter, reputational damage.',
 'Closes critical gap; demonstrates proactive cyber governance to regulators.',
 ARRAY['Financial','Reputational'], 'Open'),
('CC-0400', 'RBI-4.2.1', 'critical', 'Cyber crisis management plan — no documented plan exists for cyber-specific crisis scenarios',
 'RBI mandates a documented cyber crisis management plan. No current plan exists, creating a direct regulatory gap.',
 'RBI supervisory action, potential enforcement notice, inability to respond to cyber crisis.',
 'Closes critical RBI requirement; enables structured incident response.',
 ARRAY['Regulatory','Reputational'], 'Open'),
('CC-0401', 'NIST-RS.CO-3', 'high', 'Incident communication plan — no formal communication protocol for security incidents',
 'No documented protocol exists for communicating security incidents to internal and external stakeholders.',
 'Delayed response, reputational damage, potential regulatory non-compliance.',
 'Reduces incident response time; demonstrates mature security governance.',
 ARRAY['Reputational','Non-financial'], 'Open')
ON CONFLICT (gap_code) DO NOTHING;
