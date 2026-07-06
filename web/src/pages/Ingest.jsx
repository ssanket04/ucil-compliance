import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { sb, runRegulatoryImpact, fetchRegulatoryChanges, CURRENT_USER, fetchScanInfo, fetchFrameworks, formatTimestamp } from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';

export default function Ingest() {
  const [scanInfo, setScanInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');

  // Local state for jobs to dynamically display live database rows from regulatory_changes
  const [jobs, setJobs] = useState([]);
  // Dynamic sources fetched from database frameworks table instead of static SOURCES
  const [sources, setSources] = useState([]);

  const typeColor = { Framework: 'blue', Circular: 'amber', 'Internal Policy': 'gray' };
  const icons     = { Framework: '📋', Circular: '📜', 'Internal Policy': '📁' };

  const loadData = async () => {
    try {
      const [scanRaw, regChangesRaw, frameworksRaw] = await Promise.all([
        fetchScanInfo(),
        fetchRegulatoryChanges(),
        fetchFrameworks()
      ]);

      const scanMap = {};
      if (scanRaw) {
        scanRaw.forEach(s => { scanMap[s.scan_type] = s; });
      }

      const lastScanTimestamp = scanMap['circular_scan']?.completed_at
        ? formatTimestamp(scanMap['circular_scan'].completed_at)
        : '—';

      const scraperStatus = scanMap['circular_scan']?.status === 'running' ? 'Running…' : 'Active';
      setScanInfo({ timestamp: lastScanTimestamp, status: scraperStatus });

      // Convert database records from regulatory_changes into jobs structure
      const mappedJobs = regChangesRaw.map(r => ({
        source:        r.title || r.circular_id,
        type:          'Circular',
        controls:      r.total_impacted || 0,
        status:        r.status === 'In review' ? 'Processing' : 'Completed',
        time:          r.created_at ? formatTimestamp(r.created_at) : '—',
        method:        r.detected_by === 'Manual' ? 'Manual Upload' : 'AI Fetch',
        uploader:      r.detected_by === 'Manual' ? 'Compliance Staff' : 'System',
        uploaderDesig: '',
        approver:      r.status === 'In review' ? 'Pending Review' : 'System Auto-Approved',
        approverDesig: ''
      }));

      setJobs(mappedJobs);

      // Parse frameworks from database to populate Ingestion Sources dynamically
      const mappedSources = frameworksRaw && frameworksRaw.length > 0 ? frameworksRaw.map(fw => ({
        name:      fw.name,
        type:      fw.type || 'Framework',
        note:      fw.issuer || 'Document',
        connected: fw.status === 'Loaded'
      })) : [];

      setSources(mappedSources);
    } catch (err) {
      console.error('Error fetching scan info in Ingest:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleManualUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setSuccessMessage('');
    setErrorMessage('');
    setUploadProgress('Analyzing file integrity...');

    try {
      // Step 1: Calculate SHA-256 hash (Required for system files integrity check)
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

      setUploadProgress('Uploading file to secure storage...');

      // Step 2: Upload document to evidence-files bucket
      const filePath = `circulars/${Date.now()}_${file.name}`;
      const { error: uploadError } = await sb.storage
        .from('evidence-files')
        .upload(filePath, file, { upsert: false });
      
      if (uploadError) throw uploadError;

      setUploadProgress('Analyzing document impact with AI model...');

      // Step 3: Call regulatory impact edge function
      const fileName = file.name;
      const res = await runRegulatoryImpact(fileName, filePath, sha256Hash);

      setSuccessMessage(`Document "${file.name}" ingested successfully! Mapped to ${res.total_impacted} controls and flagged ${res.total_new_gaps} gaps.`);
      await loadData();
    } catch (err) {
      console.error('Manual ingestion failed:', err);
      // Fallback details parse if error is raw JSON from Edge Function
      let friendlyError = err.message;
      if (err.message && err.message.includes('{')) {
        try {
          const startIdx = err.message.indexOf('{');
          const jsonPayload = JSON.parse(err.message.substring(startIdx));
          if (jsonPayload.error && jsonPayload.error.message) {
            friendlyError = jsonPayload.error.message;
          }
        } catch (_) {}
      }
      setErrorMessage(friendlyError);
    } finally {
      setUploading(false);
      setUploadProgress('');
      if (e.target) e.target.value = '';
    }
  };

  const lastScanTimestamp = scanInfo?.timestamp || '—';
  const scraperActiveState = scanInfo?.status || 'Inactive';

  return (
    <>
      {/* Top Banner Card */}
      <div className="card" style={{ background: 'rgba(201, 168, 76, 0.02)', border: '1px solid var(--border-gold)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px', flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span className="badge badge-amber" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Scraper: {scraperActiveState}</span>
              <div className="card-title" style={{ margin: 0 }}>RBI, ISO, NIST Web Scraper Active</div>
            </div>
            <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
              Continuously parsing global regulatory sources (RBI, ISO, NIST) to automatically extract and map compliance updates.
            </div>
          </div>
          
          <div style={{ textAlign: 'right', marginRight: '12px' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Last execution</div>
            <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--accent-gold-lt)' }}>{lastScanTimestamp}</div>
          </div>

          <div className="pulse-glow" style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--text-success)', boxShadow: '0 0 10px var(--text-success)' }}></div>
        </div>
      </div>

      {successMessage && (
        <div className="banner banner-success" style={{ marginBottom: '16px' }}>
          <div className="banner-icon">✓</div>
          <div className="banner-body">
            <div className="banner-title">Ingestion Complete</div>
            <div className="banner-text">{successMessage}</div>
          </div>
        </div>
      )}

      {errorMessage && (
        <div className="banner banner-danger" style={{ marginBottom: '16px' }}>
          <div className="banner-icon">⚠</div>
          <div className="banner-body">
            <div className="banner-title">Ingestion Failed</div>
            <div className="banner-text">{errorMessage}</div>
          </div>
        </div>
      )}

      {/* Main Content Layout */}
      <div className="bento-grid">
        {/* Source Systems Grid */}
        <div className="col-8">
          <div className="card" style={{ height: '100%', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">Connected Ingestion Sources</div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: sources.length > 0 ? 'flex-start' : 'center' }}>
              {sources.length > 0 ? (
                <div className="src-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px' }}>
                  {sources.map((s, idx) => (
                    <div className={`src-chip ${s.connected ? 'connected' : ''}`} key={idx}>
                      <div style={{ fontSize: '18px' }}>{icons[s.type] || '📋'}</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.type} · {s.note}</div>
                      </div>
                      <div className={`src-dot ${s.connected ? 'dot-on' : 'dot-off'}`}></div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--text-tertiary)' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔌</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>No ingestion sources connected yet</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '380px', margin: '4px auto 0' }}>
                    Upload your first circular, guideline, or internal policy document to link a dynamic mapping source.
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upload Box */}
        <div className="col-4">
          <div className="card" style={{ height: '100%', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="card-title">Upload Manual Document</div>
            
            <div 
              className="upload-zone" 
              style={{ padding: '36px 16px', position: 'relative' }}
              onClick={() => !uploading && document.getElementById('circular-file-input').click()}
            >
              {uploading ? (
                <div>
                  <div style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--accent-gold)', animation: 'pulse 1.5s infinite' }}>🤖</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--accent-gold-lt)' }}>AI Processing Ingest...</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '6px' }}>{uploadProgress}</div>
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: '28px', marginBottom: '8px', color: 'var(--accent-gold)' }}>↑</div>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>Drop files here or click to browse</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                    Supports PDF, DOCX, XLSX formats. Limit 50MB.
                  </div>
                </div>
              )}
            </div>

            <input 
              type="file" 
              id="circular-file-input" 
              style={{ display: 'none' }} 
              accept=".pdf,.docx,.xlsx,.txt" 
              onChange={handleManualUpload} 
              disabled={uploading}
            />
          </div>
        </div>
      </div>

      {/* Recent Ingestion Table */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-title">Recent Ingestion History</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th style={{ width: '25%' }}>Source Document</th>
                <th style={{ width: '15%' }}>Type</th>
                <th style={{ width: '12%' }}>Controls Found</th>
                <th style={{ width: '12%' }}>Method</th>
                <th style={{ width: '16%' }}>Uploader</th>
                <th style={{ width: '16%' }}>Approved By</th>
                <th style={{ width: '14%' }}>Ingest Status</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)' }}>
                    Loading ingestion logs...
                  </td>
                </tr>
              ) : jobs.length > 0 ? (
                jobs.map((j, idx) => (
                  <tr key={idx}>
                    <td style={{ fontSize: '12.5px', fontWeight: 600 }}>
                      <div>{j.source}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px', fontWeight: 'normal' }}>Processed {j.time}</div>
                    </td>
                    <td><Badge text={j.type} color={typeColor[j.type]} /></td>
                    <td style={{ fontWeight: 600, color: 'var(--accent-gold-lt)' }}>{j.controls.toLocaleString()}</td>
                    <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{j.method}</td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 500 }}>{j.uploader}</div>
                      {j.uploaderDesig && (
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{j.uploaderDesig}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: '12px', fontWeight: 500 }}>{j.approver}</div>
                      {j.approverDesig && (
                        <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '2px' }}>{j.approverDesig}</div>
                      )}
                    </td>
                    <td><StatusBadge status={j.status} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="7" style={{ textAlign: 'center', padding: '24px', color: 'var(--text-tertiary)', fontSize: '12px' }}>
                    No circulars ingested yet. Click above to upload your first document!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
