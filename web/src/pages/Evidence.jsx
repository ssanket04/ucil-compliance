import React, { useState, useEffect, useRef } from 'react';
import { DATA } from '../data';
import {
  fetchAllEvidence,
  fetchControls,
  fetchMetrics,
  fetchAuditLog,
  fetchEvidenceForControl,
  fetchEvidenceTimeline,
  uploadEvidence,
  submitEvidenceForReview,
  runEvidenceVerdict,
  formatTimestamp,
  timeAgo
} from '../supabaseClient';
import Badge from '../components/Badge';
import StatusBadge from '../components/StatusBadge';
import RemarkBlock from '../components/RemarkBlock';
import EvidenceTimeline from '../components/EvidenceTimeline';

export default function Evidence({ controlId }) {
  const [folders, setFolders] = useState([]);
  const [metrics, setMetrics] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [expandedFolders, setExpandedFolders] = useState({});
  const [timelines, setTimelines] = useState({});
  const [timelineLoading, setTimelineLoading] = useState({});
  const [uploading, setUploading] = useState({});

  const folderRefs = useRef({});

  const loadData = async () => {
    try {
      const [allEvidence, allControls, metricsRaw, auditLog] = await Promise.all([
        fetchAllEvidence(),
        fetchControls(),
        fetchMetrics(),
        fetchAuditLog(20),
      ]);

      const controls = allControls.length ? allControls.map(c => ({
        id:          c.id,
        control_code: c.control_code,
        name:        c.name,
        domain:      c.domain_name || '—',
        owner:       c.owner_name || '—',
        domainHead:  c.domain_head_name || '—',
        status:      c.status,
      })) : DATA.controls.map(c => ({
        id:          c.id,
        control_code: c.id,
        name:        c.name,
        domain:      c.domain,
        owner:       c.owner,
        domainHead:  c.domainHead,
        status:      c.status,
      }));

      const evidenceByControlId = {};
      allEvidence.forEach(ev => {
        if (!evidenceByControlId[ev.control_id]) evidenceByControlId[ev.control_id] = [];
        evidenceByControlId[ev.control_id].push(ev);
      });

      const evidenceByControlCode = {};
      allEvidence.forEach(ev => {
        if (!evidenceByControlCode[ev.control_code]) evidenceByControlCode[ev.control_code] = [];
        evidenceByControlCode[ev.control_code].push(ev);
      });

      const allEvidenceFolders = controls.map(c => {
        const evRecords = evidenceByControlId[c.id] || evidenceByControlCode[c.control_code] || [];
        let overallStatus = c.status === 'Active' ? 'Approved'
          : c.status === 'Failed' ? 'Rejected'
          : c.status === 'Under Review' ? 'Under Review' : 'Pending';

        if (evRecords.length > 0) {
          const statuses = evRecords.map(e => e.status);
          if (statuses.includes('Rejected'))          overallStatus = 'Rejected';
          else if (statuses.includes('Reassigned'))   overallStatus = 'Reassigned';
          else if (statuses.includes('Under Review')) overallStatus = 'Under Review';
          else if (statuses.includes('Pending'))      overallStatus = 'Pending';
          else if (statuses.every(s => s === 'Approved')) overallStatus = 'Approved';
        }

        const files = evRecords.map(ev => ({
          id:           ev.id,
          name:         ev.file_name,
          size:         ev.file_size || '—',
          uploadedBy:   ev.uploaded_by_name || '—',
          uploadedDate: ev.upload_date ? new Date(ev.upload_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          status:       ev.status,
          reviewer:     ev.reviewed_by_name || '—',
          reviewDate:   ev.review_date ? new Date(ev.review_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : null,
          sha256Hash:   ev.sha256_hash,
        }));

        const latest = evRecords[0] || null;

        return {
          controlId:       c.control_code,
          controlDbId:     c.id,
          controlName:     c.name,
          domain:          c.domain,
          files,
          overallStatus,
          aiVerdict:       latest?.ai_verdict || null,
          aiDetail:        latest?.ai_verdict_detail || null,
          manualRemark:    latest?.manual_remark || null,
          observations:    latest?.observations || null,
          rejectionReason: latest?.rejection_reason || null,
        };
      });

      setFolders(allEvidenceFolders);
      setMetrics(metricsRaw);
      setAuditLogs(auditLog);
    } catch (err) {
      console.error('Error loading evidence data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    if (!loading && controlId && folders.length > 0) {
      setExpandedFolders(prev => ({ ...prev, [controlId]: true }));
      loadTimeline(controlId);
      setTimeout(() => {
        const el = folderRefs.current[controlId];
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }, 300);
    }
  }, [loading, controlId, folders]);

  const loadTimeline = async (id) => {
    const f = folders.find(folder => folder.controlId === id);
    if (!f) return;
    setTimelineLoading(prev => ({ ...prev, [id]: true }));
    try {
      const evRecords = await fetchEvidenceForControl(f.controlDbId);
      if (evRecords.length > 0) {
        const tlRaw = await fetchEvidenceTimeline(evRecords[0].id);
        if (tlRaw.length > 0) {
          const tlItems = tlRaw.map(t => ({
            action: t.action + (t.users?.full_name ? ` — ${t.users.full_name}` : ''),
            time:   formatTimestamp(t.performed_at),
            type:   t.action_type,
          }));
          setTimelines(prev => ({ ...prev, [id]: tlItems }));
        } else {
          setTimelines(prev => ({ ...prev, [id]: [] }));
        }
      } else {
        setTimelines(prev => ({ ...prev, [id]: [] }));
      }
    } catch (err) {
      console.error('Timeline error:', err);
    } finally {
      setTimelineLoading(prev => ({ ...prev, [id]: false }));
    }
  };

  const toggleFolder = (id) => {
    const isExpanding = !expandedFolders[id];
    setExpandedFolders(prev => ({ ...prev, [id]: isExpanding }));
    if (isExpanding) {
      loadTimeline(id);
    }
  };

  const handleFileUploadChange = async (controlDbId, cId, file) => {
    if (!file) return;
    setUploading(prev => ({ ...prev, [cId]: true }));
    try {
      const result = await uploadEvidence(controlDbId, file);
      await submitEvidenceForReview(result.id);
      try {
        await runEvidenceVerdict(result.id, controlDbId);
      } catch (aiErr) {
        console.error('AI Verdict failed:', aiErr);
      }
      await loadData();
      loadTimeline(cId);
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Upload failed: ' + err.message);
    } finally {
      setUploading(prev => ({ ...prev, [cId]: false }));
    }
  };

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading Evidence Management...</div>;
  }

  const m = metrics || DATA.metrics;
  const approvedCount    = m.implemented    || folders.filter(f => f.overallStatus === 'Approved').length;
  const underReviewCount = m.in_progress_ev_review    ?? m.inProgress?.evidenceUnderReview ?? folders.filter(f => f.overallStatus === 'Under Review').length;
  const reassignedCount  = m.in_progress_ev_reassigned ?? m.inProgress?.evidenceReassigned  ?? folders.filter(f => f.overallStatus === 'Reassigned').length;
  const pendingCount     = m.in_progress_ev_pending    ?? m.inProgress?.evidencePending     ?? folders.filter(f => f.overallStatus === 'Pending').length;
  const rejectedCount    = m.open_gaps      || m.openGaps       || folders.filter(f => f.overallStatus === 'Rejected').length;

  const fileIcons = { '.pdf': '📄', '.xlsx': '📊', '.docx': '📝' };
  const getIcon = (name) => fileIcons[name.slice(name.lastIndexOf('.')).toLowerCase()] || '📎';

  const filteredFolders = folders.filter(f => {
    const sTerm = search.toLowerCase();
    return f.controlId.toLowerCase().includes(sTerm) || f.controlName.toLowerCase().includes(sTerm) || f.domain.toLowerCase().includes(sTerm);
  });

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '10px', marginBottom: '14px' }}>
        <div className="metric-card non-clickable">
          <div className="metric-label">Approved</div>
          <div className="metric-value" style={{ color: 'var(--text-success)' }}>{approvedCount}</div>
          <div className="metric-delta text-success">= Dashboard Implemented = Library Active</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label">Under Review</div>
          <div className="metric-value" style={{ color: 'var(--text-warning)' }}>{underReviewCount}</div>
          <div className="metric-delta text-warning">= Dashboard In Progress breakdown</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label">Reassigned</div>
          <div className="metric-value" style={{ color: 'var(--text-info)' }}>{reassignedCount}</div>
          <div className="metric-delta text-info">= Dashboard In Progress breakdown</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label">Pending</div>
          <div className="metric-value" style={{ color: 'var(--text-secondary)' }}>{pendingCount}</div>
          <div className="metric-delta text-secondary">= Dashboard In Progress breakdown</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label">Rejected / Gaps</div>
          <div className="metric-value" style={{ color: 'var(--text-danger)' }}>{rejectedCount}</div>
          <div className="metric-delta text-danger">= Dashboard Gaps = Library Failed</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '14px' }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Search by control ID or name…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: '10px' }}>Control evidence folders ({folders.length} controls)</div>

      <div id="evidence-folders-list">
        {filteredFolders.map((ev) => {
          const isExpanded = expandedFolders[ev.controlId];
          const isTimelineLoading = timelineLoading[ev.controlId];
          const timelineItems = timelines[ev.controlId] || [];
          const isUploading = uploading[ev.controlId];

          const folderStatusClass = ev.overallStatus === 'Approved'     ? 'badge-green'
            : ev.overallStatus === 'Rejected'     ? 'badge-red'
            : ev.overallStatus === 'Reassigned'   ? 'badge-blue'
            : ev.overallStatus === 'Under Review' ? 'badge-amber' : 'badge-gray';

          return (
            <div className="evidence-folder" id={`folder-${ev.controlId}`} key={ev.controlId} ref={el => folderRefs.current[ev.controlId] = el}>
              <div className="folder-header" onClick={() => toggleFolder(ev.controlId)}>
                <div className="folder-icon">📁</div>
                <div className="folder-name">{ev.controlId} — {ev.controlName}</div>
                <div className="folder-meta">{ev.domain} · {ev.files.length} file(s)</div>
                <span className={`badge ${folderStatusClass}`}>{ev.overallStatus}</span>
                <div className="folder-chevron">{isExpanded ? '▼' : '▶'}</div>
              </div>
              {isExpanded && (
                <div className="folder-body">
                  <div style={{ marginBottom: '14px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Upload Evidence
                    </div>
                    <div className="upload-zone" style={{ padding: '20px', cursor: 'pointer' }} onClick={() => document.getElementById(`fileinput-${ev.controlId}`).click()}>
                      <div style={{ fontSize: '20px', marginBottom: '6px' }}>↑</div>
                      <div style={{ fontSize: '12px', fontWeight: 600 }}>{isUploading ? 'Uploading file...' : 'Drop files here or click to browse'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '3px' }}>PDF, Word, Excel — max 50 MB</div>
                    </div>
                    <input type="file" id={`fileinput-${ev.controlId}`} style={{ display: 'none' }} onChange={(e) => handleFileUploadChange(ev.controlDbId, ev.controlId, e.target.files[0])} />
                  </div>
                  {ev.files.length > 0 && (
                    <div style={{ marginBottom: '14px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Files</div>
                      {ev.files.map((f, i) => (
                        <div className="ev-file-row" key={i}>
                          <div className="ev-file-icon">{getIcon(f.name)}</div>
                          <div className="ev-file-info">
                            <div className="ev-file-name">{f.name}</div>
                            <div className="ev-file-meta">
                              {f.size} · Uploaded by {f.uploadedBy} · {f.uploadedDate}
                              {f.sha256Hash && (
                                <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-info)', marginTop: '3px' }}>
                                  SHA-256: {f.sha256Hash}
                                </div>
                              )}
                            </div>
                          </div>
                          <div style={{ marginRight: '10px' }}><StatusBadge status={f.status} /></div>
                          <div className="ev-file-actions"><button className="btn-sm">View</button></div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                    <RemarkBlock title="AI Verdict" icon="🤖" content={ev.aiVerdict || ev.aiDetail || null} type="ai" />
                    <div className="remark-block">
                      <div className="remark-header">✍️ Manual Remarks</div>
                      <div className="remark-body">
                        <textarea className="form-textarea" placeholder="Add or edit manual remarks…" rows="3" style={{ minHeight: '60px', margin: 0 }} defaultValue={ev.manualRemark || ''} />
                      </div>
                    </div>
                  </div>
                  {ev.observations && <RemarkBlock title="Observations / Red flags" icon="🚩" content={ev.observations} type="obs" />}
                  {ev.rejectionReason && (
                    <div style={{ background: 'var(--bg-danger)', border: '0.5px solid var(--border-danger)', borderRadius: 'var(--r-md)', padding: '10px 12px', marginBottom: '12px', fontSize: '12px', color: 'var(--text-danger)' }}>
                      <strong>Rejection reason:</strong> {ev.rejectionReason}
                    </div>
                  )}
                  <div id={`timeline-${ev.controlId}`} style={{ marginBottom: '12px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Upload history timeline</div>
                    {isTimelineLoading ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Loading timeline…</div>
                    ) : timelineItems.length > 0 ? (
                      <EvidenceTimeline items={timelineItems} />
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>No timeline entries yet.</div>
                    )}
                  </div>
                  <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '12px', marginTop: '10px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px' }}>Review Actions</div>
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                      <button className="btn-sm btn-success">✓ Approve</button>
                      <button className="btn-sm btn-danger">↩ Reject</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="card" id="access-log-section" style={{ marginTop: '20px' }}>
        <div className="card-title">Access monitoring log</div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>User</th><th>Role</th><th>Action</th><th>Control</th><th>Time</th></tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 8).map((a, idx) => (
                <tr key={idx}>
                  <td>{a.users?.full_name || 'System'}</td>
                  <td><Badge text={a.users?.role || 'System'} color="blue" /></td>
                  <td>{a.action.replace('evidence_', '').replace(/_/g, ' ')}</td>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>{a.entity_id ? a.entity_id.slice(0, 8) + '…' : '—'}</td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{timeAgo(a.performed_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
