import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchScanInfo, formatTimestamp } from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';

export default function Ingest() {
  const [scanInfo, setScanInfo] = useState(null);
  const [loading, setLoading] = useState(true);

  const SOURCES = [
    { name: 'ISO 27001:2022',     type: 'Framework',       note: 'Document', connected: true },
    { name: 'NIST CSF 2.0',       type: 'Framework',       note: 'Document', connected: true },
    { name: 'RBI CSF v2',         type: 'Framework',       note: 'Document', connected: true },
    { name: 'PCI-DSS v4.0',       type: 'Framework',       note: 'Document', connected: true },
    { name: 'COBIT 2019',         type: 'Framework',       note: 'Document', connected: true },
    { name: 'SOX',                type: 'Framework',       note: 'Document', connected: true },
    { name: 'RBI Circular 2024',  type: 'Circular',        note: 'Document', connected: true },
    { name: 'Internal Policy v3', type: 'Internal Policy', note: 'Document', connected: true },
  ];

  const JOBS = [
    { source: 'RBI CSF v2.0',       type: 'Circular',        controls: 85,   status: 'Completed',  time: 'Today 09:14',  method: 'AI Fetch',      uploader: 'System',    uploaderDesig: '',                   approver: 'Rajiv Chaudhary', approverDesig: 'VP Compliance' },
    { source: 'ISO 27001',          type: 'Framework',       controls: 1204, status: 'Completed',  time: 'Today 07:00',  method: 'AI Fetch',      uploader: 'System',    uploaderDesig: '',                   approver: 'Priya Sharma',    approverDesig: 'Director Risk' },
    { source: 'Internal Policy v3', type: 'Internal Policy', controls: 89,   status: 'Completed',  time: 'Yesterday',    method: 'Manual Upload', uploader: 'Anita Roy', uploaderDesig: 'Senior Analyst',     approver: 'Sanjay Mehta',    approverDesig: 'Manager IT Security' },
    { source: 'SOX RCM Q1',         type: 'Framework',       controls: 214,  status: 'Processing', time: 'Today 10:42',  method: 'Manual Upload', uploader: 'Mohan Das', uploaderDesig: 'Compliance Analyst', approver: 'Pending',         approverDesig: '' },
  ];

  const typeColor = { Framework: 'blue', Circular: 'amber', 'Internal Policy': 'gray' };
  const icons     = { Framework: '📋', Circular: '📜', 'Internal Policy': '📁' };

  useEffect(() => {
    async function loadScan() {
      try {
        const scanRaw = await fetchScanInfo();
        const scanMap = {};
        scanRaw.forEach(s => { scanMap[s.scan_type] = s; });

        const lastScanTimestamp = scanMap['circular_scan']?.completed_at
          ? formatTimestamp(scanMap['circular_scan'].completed_at)
          : DATA.scanInfo.lastCircularScan.timestamp;

        const scraperStatus = scanMap['circular_scan']?.status === 'running' ? 'Running…' : 'Active';
        setScanInfo({ timestamp: lastScanTimestamp, status: scraperStatus });
      } catch (err) {
        console.error('Error fetching scan info in Ingest:', err);
      } finally {
        setLoading(false);
      }
    }
    loadScan();
  }, []);

  const scraperStatus = scanInfo?.status || 'Active';
  const lastScanTimestamp = scanInfo?.timestamp || DATA.scanInfo.lastCircularScan.timestamp;

  return (
    <>
      <div className="card" style={{ background: 'var(--bg-success)', borderColor: 'var(--border-success)', marginBottom: '14px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ fontSize: '24px' }}>🔄</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-success)', marginBottom: '2px' }}>
              Live Web Scraper — {scraperStatus}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text-success)' }}>
              Continuously monitoring regulatory sources for new circulars and updates
            </div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '10px', color: 'var(--text-success)', marginBottom: '2px' }}>Last scan</div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-success)' }}>{lastScanTimestamp}</div>
          </div>
          <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: 'var(--text-success)', animation: 'pulse 2s infinite' }}></div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Source systems</div>
        <div className="src-grid">
          {SOURCES.map((s, idx) => (
            <div className={`src-chip ${s.connected ? 'connected' : ''}`} key={idx}>
              <div style={{ fontSize: '18px' }}>{icons[s.type]}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}>{s.type} · {s.note}</div>
              </div>
              <div className={`src-dot ${s.connected ? 'dot-on' : 'dot-off'}`}></div>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Upload control document</div>
        <div className="upload-zone" style={{ padding: '20px' }}>
          <div style={{ fontSize: '20px', marginBottom: '6px' }}>↑</div>
          <div style={{ fontSize: '12px', fontWeight: 600 }}>Drop PDF, Word, or Excel files here</div>
          <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>
            Supports .pdf · .docx · .xlsx · .csv
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-title">Recent ingestion jobs</div>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: '28%' }}>Source</th>
              <th style={{ width: '14%' }}>Type</th>
              <th style={{ width: '10%' }}>Controls</th>
              <th style={{ width: '12%' }}>Method</th>
              <th style={{ width: '12%' }}>Uploader</th>
              <th style={{ width: '12%' }}>Approver</th>
              <th style={{ width: '12%' }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {JOBS.map((j, idx) => (
              <tr key={idx}>
                <td style={{ fontSize: '12px', fontWeight: 500 }}>{j.source}</td>
                <td><Badge text={j.type} color={typeColor[j.type]} /></td>
                <td style={{ fontWeight: 600 }}>{j.controls.toLocaleString()}</td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{j.method}</td>
                <td>
                  <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{j.uploader}</div>
                  {j.uploaderDesig && (
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{j.uploaderDesig}</div>
                  )}
                </td>
                <td>
                  <div style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{j.approver}</div>
                  {j.approverDesig && (
                    <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '1px' }}>{j.approverDesig}</div>
                  )}
                </td>
                <td><StatusBadge status={j.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
