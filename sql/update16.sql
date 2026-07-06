-- ============================================================
-- UCIL — update16.sql
-- Baseline Controls, Domains, Frameworks, and Mappings Seed
-- ------------------------------------------------------------
-- Seeds the database with the core 200 canonical controls,
-- compliance frameworks, domains, and mappings so that the
-- Unified Control Library and Ingest pages function as intended.
-- ============================================================

DO $$
DECLARE
  v_domain_id UUID;
  v_fw_id_iso UUID;
  v_fw_id_sox UUID;
  v_fw_id_nist UUID;
  v_fw_id_rbi UUID;
  v_fw_id_pci UUID;
  v_fw_id_cobit UUID;
  v_fw_id_policy UUID;
  v_control_id UUID;
  i INT;
  v_code TEXT;
  v_domain_name TEXT;
  v_status TEXT;
  v_reason TEXT;
  v_name TEXT;
  v_desc TEXT;
BEGIN
  -- 1. Insert Frameworks
  INSERT INTO public.frameworks (name, type, version, issuer, satisfied_pct, partial_pct, missing_pct, compliance_status, status) VALUES
  ('ISO 27001',       'Framework',       '2022', 'ISO',     88, 0,  12, 'Compliant',           'Loaded'),
  ('SOX',             'Framework',       '2024', 'PCAOB',   91, 0,  9,  'Compliant',           'Loaded'),
  ('NIST CSF',        'Framework',       '2.0',  'NIST',    72, 10, 18, 'Partially Compliant', 'Loaded'),
  ('RBI CSF',         'Circular',        'v2',   'RBI',     60, 16, 24, 'Partially Compliant', 'Loaded'),
  ('PCI-DSS',         'Framework',       '4.0',  'PCI SSC', 55, 15, 30, 'Not Compliant',       'Loaded'),
  ('COBIT',           'Framework',       '2019', 'ISACA',   50, 14, 36, 'Not Compliant',       'Loaded'),
  ('Internal Policy', 'Internal Policy', 'v3',   'Internal',90, 5,  5,  'Compliant',           'Loaded')
  ON CONFLICT (name) DO UPDATE SET status = 'Loaded';

  -- Get Framework IDs
  SELECT id INTO v_fw_id_iso    FROM public.frameworks WHERE name = 'ISO 27001';
  SELECT id INTO v_fw_id_sox    FROM public.frameworks WHERE name = 'SOX';
  SELECT id INTO v_fw_id_nist   FROM public.frameworks WHERE name = 'NIST CSF';
  SELECT id INTO v_fw_id_rbi    FROM public.frameworks WHERE name = 'RBI CSF';
  SELECT id INTO v_fw_id_pci    FROM public.frameworks WHERE name = 'PCI-DSS';
  SELECT id INTO v_fw_id_cobit  FROM public.frameworks WHERE name = 'COBIT';
  SELECT id INTO v_fw_id_policy FROM public.frameworks WHERE name = 'Internal Policy';

  -- 2. Insert Domains
  INSERT INTO public.domains (name, description) VALUES
  ('Access Control',    'Controls related to user access, identity, and privilege management'),
  ('Privileged Access', 'Controls for privileged and administrative account management'),
  ('Incident Mgmt',     'Controls for incident detection, response, and recovery'),
  ('Data Protection',   'Controls for data encryption, classification, and retention'),
  ('Change Mgmt',       'Controls for change management and configuration control'),
  ('Risk Management',   'Controls for risk assessment and treatment'),
  ('Vendor Management', 'Controls for third-party and vendor risk')
  ON CONFLICT (name) DO NOTHING;

  -- 3. Insert 6 Core Controls and Mappings
  -- CC-0041
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Access Control';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0041', 'User access review', 'Access reviewed and revoked upon role change or termination', v_domain_id, 'Active', 0.94, TRUE, 'All mapped frameworks verified. Evidence uploaded and approved.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_iso, 'ISO A.8.2', 'Access rights shall be reviewed', 0.94, 'Auto-Approved'),
  (v_control_id, v_fw_id_sox, 'SOX ITGC', 'User privilege verification', 0.94, 'Auto-Approved'),
  (v_control_id, v_fw_id_rbi, 'RBI 3.1', 'Periodic access rights review', 0.94, 'Auto-Approved'),
  (v_control_id, v_fw_id_nist, 'NIST PR.AC-1', 'Access review protocols', 0.94, 'Auto-Approved'),
  (v_control_id, v_fw_id_cobit, 'COBIT APO01', 'Manage access rights', 0.94, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- CC-0089
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Privileged Access';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0089', 'Privileged access logging', 'Privileged access logged and reviewed by IT Risk team', v_domain_id, 'Active', 0.91, TRUE, 'Logging tool verified; access review process documented.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_nist, 'NIST PR.AC', 'Privileged identity logging', 0.91, 'Auto-Approved'),
  (v_control_id, v_fw_id_pci, 'PCI 7.2', 'Review of system accounts access', 0.91, 'Auto-Approved'),
  (v_control_id, v_fw_id_iso, 'ISO A.9.4', 'Use of privileged utility programs', 0.91, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- CC-0112
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Incident Mgmt';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0112', 'Incident response testing', 'IR plan tested with documented tabletop exercise', v_domain_id, 'Under Review', 0.78, TRUE, 'Last test documentation is under review by Domain Head. Pending approval.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_iso, 'ISO A.16.1', 'Information security incident management', 0.78, 'Auto-Approved'),
  (v_control_id, v_fw_id_nist, 'NIST RS.RP', 'Response plan execution', 0.78, 'Auto-Approved'),
  (v_control_id, v_fw_id_rbi, 'RBI 5.2', 'Cyber incident response drills', 0.78, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- CC-0203
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Data Protection';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0203', 'Encryption at rest', 'AES-256 encryption for all customer PII data', v_domain_id, 'Active', 0.82, TRUE, 'Encryption standard confirmed by IT Security team. Audit trail complete.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_pci, 'PCI 3.5', 'Encrypt primary account number at rest', 0.82, 'Auto-Approved'),
  (v_control_id, v_fw_id_iso, 'ISO A.8.24', 'Use of cryptography', 0.82, 'Auto-Approved'),
  (v_control_id, v_fw_id_rbi, 'RBI 4.1', 'Encryption of sensitive data at rest', 0.82, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- CC-0287
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Change Mgmt';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0287', 'Change management approval', '4-eye approval with full audit trail in ITSM tool', v_domain_id, 'Failed', 0.88, TRUE, 'ITSM audit trail export failed during last compliance run. Reassessment required.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_cobit, 'COBIT BAI06', 'Manage changes approval', 0.88, 'Auto-Approved'),
  (v_control_id, v_fw_id_sox, 'SOX ITGC', 'Change management authorization', 0.88, 'Auto-Approved'),
  (v_control_id, v_fw_id_iso, 'ISO A.8.32', 'Change management controls', 0.88, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- CC-0345
  SELECT id INTO v_domain_id FROM public.domains WHERE name = 'Data Protection';
  INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
  VALUES ('CC-0345', 'Data retention policy', 'Data classified and retained per defined retention schedules', v_domain_id, 'Active', 0.86, TRUE, 'Retention schedule approved and implemented.')
  ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;

  INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
  (v_control_id, v_fw_id_iso, 'ISO A.8.10', 'Information deletion schedules', 0.86, 'Auto-Approved'),
  (v_control_id, v_fw_id_rbi, 'RBI 6.1', 'Data preservation timelines', 0.86, 'Auto-Approved')
  ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;

  -- 4. Generate 194 remaining controls
  FOR i IN 0..193 LOOP
    v_code := 'CC-' || LPAD((i + 400)::TEXT, 4, '0');
    
    -- Pick domain
    CASE (i % 5)
      WHEN 0 THEN v_domain_name := 'Access Control';
      WHEN 1 THEN v_domain_name := 'Privileged Access';
      WHEN 2 THEN v_domain_name := 'Incident Mgmt';
      WHEN 3 THEN v_domain_name := 'Data Protection';
      ELSE v_domain_name := 'Change Mgmt';
    END CASE;
    
    SELECT id INTO v_domain_id FROM public.domains WHERE name = v_domain_name;
    
    -- Pick status
    IF i < 6 THEN
      v_status := 'Failed';
      v_reason := 'Control implementation failed validation. Remediation required.';
    ELSIF i < 48 THEN
      v_status := 'Under Review';
      v_reason := 'Evidence submitted and pending Domain Head review.';
    ELSE
      v_status := 'Active';
      v_reason := 'All mapped frameworks verified. Evidence uploaded and approved.';
    END IF;
    
    -- Set names and desc
    v_name := 'Automated ' || v_domain_name || ' Control ' || i;
    v_desc := 'This is a canonical definition for control requirement ' || v_code || ' targeting ' || v_domain_name || ' guidelines.';
    
    INSERT INTO public.controls (control_code, name, description, domain_id, status, confidence_score, is_canonical, status_reason)
    VALUES (v_code, v_name, v_desc, v_domain_id, v_status, 0.85, TRUE, v_reason)
    ON CONFLICT (control_code) DO UPDATE SET domain_id = EXCLUDED.domain_id RETURNING id INTO v_control_id;
    
    -- Map to frameworks (matching data.demo.js mappings array)
    CASE (i % 4)
      WHEN 0 THEN
        INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
        (v_control_id, v_fw_id_iso, 'ISO A.8.2-cls-' || i, 'Obligation ISO class ' || i, 0.85, 'Auto-Approved'),
        (v_control_id, v_fw_id_sox, 'SOX ITGC-cls-' || i, 'Obligation SOX class ' || i, 0.85, 'Auto-Approved')
        ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;
      WHEN 1 THEN
        INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
        (v_control_id, v_fw_id_nist, 'NIST PR.AC-cls-' || i, 'Obligation NIST class ' || i, 0.85, 'Auto-Approved'),
        (v_control_id, v_fw_id_pci, 'PCI 7.2-cls-' || i, 'Obligation PCI class ' || i, 0.85, 'Auto-Approved')
        ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;
      WHEN 2 THEN
        INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
        (v_control_id, v_fw_id_iso, 'ISO A.16.1-cls-' || i, 'Obligation ISO class ' || i, 0.85, 'Auto-Approved'),
        (v_control_id, v_fw_id_rbi, 'RBI 5.2-cls-' || i, 'Obligation RBI class ' || i, 0.85, 'Auto-Approved')
        ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;
      ELSE
        INSERT INTO public.control_framework_mappings (control_id, framework_id, clause_ref, clause_text, confidence_score, status) VALUES
        (v_control_id, v_fw_id_pci, 'PCI 3.5-cls-' || i, 'Obligation PCI class ' || i, 0.85, 'Auto-Approved'),
        (v_control_id, v_fw_id_iso, 'ISO A.8.24-cls-' || i, 'Obligation ISO class ' || i, 0.85, 'Auto-Approved')
        ON CONFLICT (control_id, framework_id, clause_ref) DO NOTHING;
    END CASE;
  END LOOP;
END $$;
