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
  approveEvidence,
  rejectEvidence,
  saveEvidenceRemark,
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
      })) : [];


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

  const handleApprove = async (evidenceId, cId) => {
    try {
      await approveEvidence(evidenceId);
      alert('Evidence approved successfully!');
      await loadData();
      loadTimeline(cId);
    } catch (err) {
      alert('Approval failed: ' + err.message);
    }
  };

  const handleReject = async (evidenceId, cId) => {
    const reason = prompt('Please enter a rejection reason:');
    if (!reason?.trim()) return;
    try {
      await rejectEvidence(evidenceId, reason, '');
      alert('Evidence rejected and returned to owner successfully!');
      await loadData();
      loadTimeline(cId);
    } catch (err) {
      alert('Rejection failed: ' + err.message);
    }
  };

  const handleSaveRemark = async (evidenceId, text, cId) => {
    try {
      await saveEvidenceRemark(evidenceId, text);
      alert('Remarks saved successfully!');
      await loadData();
      loadTimeline(cId);
    } catch (err) {
      alert('Save failed: ' + err.message);
    }
  };

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading Evidence Management...</div>;
  }

  const approvedCount = metrics?.implemented ?? folders.filter(f => f.overallStatus === 'Approved').length;
  const underReviewCount = metrics?.in_progress_ev_review ?? folders.filter(f => f.overallStatus === 'Under Review').length;
  const reassignedCount = metrics?.in_progress_ev_reassigned ?? folders.filter(f => f.overallStatus === 'Reassigned').length;
  const pendingCount = metrics?.in_progress_ev_pending ?? folders.filter(f => f.overallStatus === 'Pending').length;
  const rejectedCount = metrics?.open_gaps ?? folders.filter(f => f.overallStatus === 'Rejected').length;

  const fileIcons = { '.pdf': '📄', '.xlsx': '📊', '.docx': '📝' };
  const getIcon = (name) => fileIcons[name.slice(name.lastIndexOf('.')).toLowerCase()] || '📎';

  const filteredFolders = folders.filter(f => {
    const sTerm = search.toLowerCase();
    return f.controlId.toLowerCase().includes(sTerm) || f.controlName.toLowerCase().includes(sTerm) || f.domain.toLowerCase().includes(sTerm);
  });

  return (
    <>
      {/* Evidence Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '12px', marginBottom: '20px' }}>
        <div className="metric-card non-clickable">
          <div className="metric-label" style={{ color: 'var(--text-success)' }}>Approved</div>
          <div className="metric-value">{approvedCount}</div>
          <div className="metric-delta text-success">Compliant controls</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label" style={{ color: 'var(--text-warning)' }}>Under Review</div>
          <div className="metric-value">{underReviewCount}</div>
          <div className="metric-delta text-warning">Pending CISO review</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label" style={{ color: 'var(--text-info)' }}>Reassigned</div>
          <div className="metric-value">{reassignedCount}</div>
          <div className="metric-delta text-info">Returned to queue</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label" style={{ color: 'var(--text-secondary)' }}>Pending</div>
          <div className="metric-value">{pendingCount}</div>
          <div className="metric-delta text-secondary">Upload required</div>
        </div>
        <div className="metric-card non-clickable">
          <div className="metric-label" style={{ color: 'var(--text-danger)' }}>Rejected / Gaps</div>
          <div className="metric-value">{rejectedCount}</div>
          <div className="metric-delta text-danger">Failing checklist</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px' }}>
        <div className="search-wrap" style={{ flex: 1 }}>
          <span className="search-icon">⌕</span>
          <input type="text" placeholder="Search evidence files by control ID, name, or domain..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>
      </div>

      <div className="card-title" style={{ marginBottom: '16px' }}>Control Evidence Folders</div>

      {/* Folders List */}
      <div id="evidence-folders-list">
        {filteredFolders.length > 0 ? (
          filteredFolders.map((ev) => {
            const isExpanded = expandedFolders[ev.controlId];

          const isTimelineLoading = timelineLoading[ev.controlId];
          const timelineItems = timelines[ev.controlId] || [];
          const isUploading = uploading[ev.controlId];

          const folderStatusClass = ev.overallStatus === 'Approved' ? 'badge-green'
            : ev.overallStatus === 'Rejected' ? 'badge-red'
            : ev.overallStatus === 'Reassigned' ? 'badge-blue'
            : ev.overallStatus === 'Under Review' ? 'badge-amber' : 'badge-gray';

          return (
            <div className="evidence-folder" id={`folder-${ev.controlId}`} key={ev.controlId} ref={el => folderRefs.current[ev.controlId] = el}>
              <div className="folder-header" onClick={() => toggleFolder(ev.controlId)}>
                <div className="folder-icon">📁</div>
                <div className="folder-name">{ev.controlId} — {ev.controlName}</div>
                <div style={{ marginRight: '16px', fontSize: '11px', color: 'var(--text-secondary)' }}>
                  {ev.domain} · {ev.files.length} file(s)
                </div>
                <span className={`badge ${folderStatusClass}`} style={{ marginRight: '16px' }}>{ev.overallStatus}</span>
                <div className="folder-chevron" style={{ transform: isExpanded ? 'rotate(90deg)' : 'none', color: isExpanded ? 'var(--accent-gold)' : 'inherit' }}>▶</div>
              </div>

              {isExpanded && (
                <div className="folder-body">
                  {/* Upload File Zone */}
                  <div style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      Upload New Evidence
                    </div>
                    <div className="upload-zone" onClick={() => document.getElementById(`fileinput-${ev.controlId}`).click()}>
                      <div style={{ fontSize: '24px', marginBottom: '8px', color: 'var(--accent-gold)' }}>↑</div>
                      <div style={{ fontSize: '13px', fontWeight: 600 }}>{isUploading ? 'Uploading & verifying file...' : 'Drop files here or click to browse'}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginTop: '4px' }}>PDF, XLSX, DOCX formats supported. Limit 50MB.</div>
                    </div>
                    <input type="file" id={`fileinput-${ev.controlId}`} style={{ display: 'none' }} onChange={(e) => handleFileUploadChange(ev.controlDbId, ev.controlId, e.target.files[0])} />
                  </div>

                  {/* File List */}
                  {ev.files.length > 0 && (
                    <div style={{ marginBottom: '20px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Attached Files</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {ev.files.map((f, i) => (
                          <div className="ev-file-row" key={i} style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '12px 16px' }}>
                            <div className="ev-file-icon" style={{ fontSize: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                              <span>{getIcon(f.name)}</span>
                              {f.sha256Hash && (
                                <span style={{ fontSize: '10px', marginTop: '4px', cursor: 'help' }} title="SHA-256 integrity verified by trigger">🛡️</span>
                              )}
                            </div>
                            <div className="ev-file-info" style={{ marginLeft: '12px' }}>
                              <div className="ev-file-name" style={{ fontWeight: 600 }}>{f.name}</div>
                              <div className="ev-file-meta" style={{ marginTop: '4px' }}>
                                Size: {f.size} · By {f.uploadedBy} · {f.uploadedDate}
                                {f.sha256Hash && (
                                  <div style={{ fontSize: '9px', fontFamily: 'var(--font-mono)', color: 'var(--text-info)', marginTop: '4px', background: 'rgba(0,0,0,0.3)', padding: '2px 6px', borderRadius: '4px', display: 'inline-block' }}>
                                    SHA-256: {f.sha256Hash}
                                  </div>
                                )}
                              </div>
                            </div>
                            <div style={{ marginRight: '16px' }}><StatusBadge status={f.status} /></div>
                            <div className="ev-file-actions"><button className="btn btn-sm">Download</button></div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Verdict & Remarks Bento Boxes */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
                    <RemarkBlock title="AI Compliance Verdict" icon="🤖" content={ev.aiVerdict || ev.aiDetail || null} type="ai" />

                    <div className="remark-block">
                      <div className="remark-header">✍️ Control Owner Remarks</div>
                      <div className="remark-body" style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <textarea
                          id={`remark-input-${ev.controlId}`}
                          className="form-textarea"
                          placeholder="Add or edit manual remarks…"
                          rows="3"
                          style={{ minHeight: '80px', margin: 0 }}
                          defaultValue={ev.manualRemark || ''}
                        />
                        {ev.files.length > 0 && (
                          <button
                            className="btn btn-sm btn-info"
                            style={{ alignSelf: 'flex-end' }}
                            onClick={() => {
                              const latest = ev.files[0];
                              const textVal = document.getElementById(`remark-input-${ev.controlId}`).value;
                              handleSaveRemark(latest.id, textVal, ev.controlId);
                            }}
                          >
                            Save Remarks
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {ev.observations && <RemarkBlock title="Observations / Red flags" icon="🚩" content={ev.observations} type="obs" />}
                  {ev.rejectionReason && (
                    <div className="banner banner-danger" style={{ marginBottom: '16px' }}>
                      <div className="banner-icon">⚠</div>
                      <div className="banner-body">
                        <div className="banner-title">Rejection reason</div>
                        <div className="banner-text">{ev.rejectionReason}</div>
                      </div>
                    </div>
                  )}

                  {/* Upload Timeline */}
                  <div id={`timeline-${ev.controlId}`} style={{ marginBottom: '20px' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Verification Timeline</div>
                    {isTimelineLoading ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>Loading audit timeline…</div>
                    ) : timelineItems.length > 0 ? (
                      <EvidenceTimeline items={timelineItems} />
                    ) : (
                      <div style={{ fontSize: '11px', color: 'var(--text-tertiary)' }}>No verification logs available.</div>
                    )}
                  </div>

                  {/* Action Bar */}
                  {ev.files.length > 0 && (
                    <div style={{ background: 'rgba(0, 0, 0, 0.2)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '16px', marginTop: '16px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '12px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Review Actions</div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button className="btn btn-sm btn-success" onClick={() => handleApprove(ev.files[0].id, ev.controlId)}>✓ Approve Evidence</button>
                        <button className="btn btn-sm btn-danger" onClick={() => handleReject(ev.files[0].id, ev.controlId)}>↩ Return to Owner</button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
          })
        ) : (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)', borderStyle: 'dashed' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📂</div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>No controls or evidence folders generated yet</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              Upload your first regulatory standard or policy in the Ingestion tab to dynamically populate evidence folders.
            </div>
          </div>
        )}
      </div>

      {/* Access Log Monitoring */}
      <div className="card" id="access-log-section" style={{ marginTop: '24px' }}>
        <div className="card-title">Security & Integrity Audit Log</div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr><th>Audit Log ID</th><th>Actor / User</th><th>Role</th><th>Activity / Event</th><th>Target Control</th><th>Timestamp</th></tr>
            </thead>
            <tbody>
              {auditLogs.slice(0, 8).map((a, idx) => (
                <tr key={idx}>
                  <td style={{ fontFamily: 'var(--font-mono)', fontSize: '10px', color: 'var(--text-secondary)' }}>{a.id.slice(0,8)}…</td>
                  <td style={{ fontWeight: 600 }}>{a.users?.full_name || 'System'}</td>
                  <td><Badge text={a.users?.role || 'System'} color="blue" /></td>
                  <td style={{ textTransform: 'capitalize' }}>{a.action.replace('evidence_', '').replace(/_/g, ' ')}</td>
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
