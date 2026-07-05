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
      {/* Live Scraper Notification Banner */}
      <div className="card" style={{ border: '1px solid var(--border-success)', background: 'rgba(46, 204, 113, 0.02)', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ fontSize: '24px', filter: 'drop-shadow(0 0 8px rgba(46, 204, 113, 0.4))' }}>🔄</div>
          
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-success)', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Live Web Regulatory Scraper</span>
              <span className="badge badge-green" style={{ textTransform: 'uppercase', fontSize: '9px' }}>{scraperStatus}</span>
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

      {/* Main Content Layout */}
      <div className="bento-grid">
        {/* Source Systems Grid */}
        <div className="col-8">
          <div className="card" style={{ height: '100%', marginBottom: 0 }}>
            <div className="card-title">Connected Ingestion Sources</div>
            <div className="src-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              {SOURCES.map((s, idx) => (
                <div className={`src-chip ${s.connected ? 'connected' : ''}`} key={idx}>
                  <div style={{ fontSize: '18px' }}>{icons[s.type]}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</div>
                    <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '2px' }}>{s.type} · {s.note}</div>
                  </div>
                  <div className={`src-dot ${s.connected ? 'dot-on' : 'dot-off'}`}></div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Upload Box */}
        <div className="col-4">
          <div className="card" style={{ height: '100%', marginBottom: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div className="card-title">Upload Manual Document</div>
            <div className="upload-zone" style={{ padding: '36px 16px' }}>
              <div style={{ fontSize: '28px', marginBottom: '8px', color: 'var(--accent-gold)' }}>↑</div>
              <div style={{ fontSize: '13px', fontWeight: 600 }}>Drop files here or click to browse</div>
              <div style={{ fontSize: '10px', color: 'var(--text-tertiary)', marginTop: '6px' }}>
                Supports PDF, DOCX, XLSX formats. Limit 50MB.
              </div>
            </div>
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
              {JOBS.map((j, idx) => (
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
