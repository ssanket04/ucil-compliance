import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchQueue, approveQueueItem, rejectQueueItem } from '../supabaseClient';
import Badge from '../components/Badge';
import ConfPill from '../components/ConfPill';

export default function Queue({ onQueueCountChange }) {
  const [queue, setQueue] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedItems, setExpandedItems] = useState({});
  const [justifications, setJustifications] = useState({});
  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // Keep track of current time for countdown calculation
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000); // update every minute
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    async function loadQueue() {
      try {
        const queueItems = await fetchQueue('Pending');

        const mappedQueue = queueItems.length ? queueItems.map(item => ({
          id:            item.mapping_id,
          dbId:          item.id,
          conf:          item.confidence_score,
          uniqueControl: item.controls?.name || 'Control mapping pending review',
          controlCode:   item.controls?.control_code || '—',
          frameworkName: item.frameworks?.name || '—',
          clauseRef:     item.clause_ref || '—',
          aiRationale:   item.ai_rationale || 'AI rationale not available.',
          frameworks:    [{ label: item.frameworks?.name || 'Framework', color: 'blue' }],
          conflict:      null,
          conflictDetail: null,
          expiresAt:     item.expires_at,
        })) : DATA.queue.map(item => ({
          id:            item.id,
          dbId:          null,
          conf:          item.conf,
          uniqueControl: item.uniqueControl,
          controlCode:   '—',
          frameworkName: item.frameworks?.[0]?.label || '—',
          clauseRef:     item.conflict || '—',
          aiRationale:   item.conflictDetail?.issue || 'Review required.',
          frameworks:    item.frameworks || [],
          conflict:      item.conflict,
          conflictDetail: item.conflictDetail,
          expiresAt:     item.expiresAt || new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
        }));

        setQueue(mappedQueue);
        if (onQueueCountChange) {
          onQueueCountChange(mappedQueue.length);
        }
      } catch (err) {
        console.error('Error loading queue:', err);
      } finally {
        setLoading(false);
      }
    }
    loadQueue();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading SME Review Queue...</div>;
  }

  const toggleItem = (id) => {
    setExpandedItems(prev => ({ ...prev, [id]: !prev[id] }));
  };

  const handleJustificationChange = (id, val) => {
    setJustifications(prev => ({ ...prev, [id]: val }));
  };

  const dismissItem = (id) => {
    setQueue(prev => {
      const next = prev.filter(item => item.id !== id);
      if (onQueueCountChange) {
        onQueueCountChange(next.length);
      }
      return next;
    });
  };

  const handleApprove = async (dbId, displayId) => {
    const justification = justifications[displayId] || '';
    setErrorMsg('');
    setSuccessMsg('');

    if (dbId) {
      try {
        await approveQueueItem(dbId, justification);
        setSuccessMsg('Queue item approved successfully!');
      } catch (err) {
        setErrorMsg('Approval failed: ' + err.message);
        return;
      }
    } else {
      setSuccessMsg('Local queue item approved!');
    }
    dismissItem(displayId);
  };

  const handleReject = async (dbId, displayId) => {
    const justification = justifications[displayId] || '';
    setErrorMsg('');
    setSuccessMsg('');

    if (!justification.trim()) {
      setErrorMsg('Justification is required to reject a mapping.');
      return;
    }

    if (dbId) {
      try {
        await rejectQueueItem(dbId, justification);
        setSuccessMsg('Queue item rejected successfully!');
      } catch (err) {
        setErrorMsg('Rejection failed: ' + err.message);
        return;
      }
    } else {
      setSuccessMsg('Local queue item rejected!');
    }
    dismissItem(displayId);
  };

  const formatCountdown = (expiresAt) => {
    if (!expiresAt) return null;
    const expDate = new Date(expiresAt);
    const diffMs = expDate - now;
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / 1000 / 60 / 60);
    const mins = Math.floor((diffMs / 1000 / 60) % 60);
    return `${hours}h ${mins}m left`;
  };

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', alignItems: 'center' }}>
        <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
          {queue.length} mappings pending SME verification (AI confidence matches 0.50–0.84)
        </span>
      </div>

      {errorMsg && <div className="banner banner-danger" style={{ marginBottom: '16px' }}>{errorMsg}</div>}
      {successMsg && <div className="banner banner-success" style={{ marginBottom: '16px' }}>{successMsg}</div>}

      <div id="queue-list" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {queue.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '48px 20px', color: 'var(--text-secondary)' }}>
            <div style={{ fontSize: '24px', marginBottom: '8px' }}>✓</div>
            <div style={{ fontSize: '13px', fontWeight: 600 }}>All mappings verified. Review queue is empty.</div>
          </div>
        ) : (
          queue.map((item) => {
            const isExpanded = expandedItems[item.id];
            const justification = justifications[item.id] || '';
            const timeRemaining = formatCountdown(item.expiresAt);

            return (
              <div className="queue-item" id={`qi-${item.id}`} key={item.id} style={{ borderLeft: item.conflict ? '3px solid var(--border-danger)' : '' }}>
                <div className="queue-header" onClick={() => toggleItem(item.id)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '16px' }}>
                  <div className="queue-id">{item.id}</div>
                  
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>
                      Target Canonical Control
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                      {item.uniqueControl}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                    <ConfPill value={item.conf} />
                    
                    {timeRemaining && (
                      <span className="badge badge-amber" style={{ fontFamily: 'var(--font-mono)', fontSize: '10px' }}>
                        ⏱ {timeRemaining}
                      </span>
                    )}

                    {item.conflict && (
                      <Badge text="Conflict" color="red" />
                    )}

                    <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '4px' }}>
                      {isExpanded ? '▼' : '▶'}
                    </span>
                  </div>
                </div>

                {isExpanded && (
                  <div style={{ paddingTop: '16px', borderTop: '1px solid var(--border-t)', marginTop: '14px' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '16px', marginBottom: '14px' }}>
                      
                      {/* Left Column: Details */}
                      <div>
                        <div style={{ background: 'rgba(255, 255, 255, 0.01)', border: '1px solid var(--border-t)', borderRadius: 'var(--r-md)', padding: '14px' }}>
                          <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                            Source Requirement
                          </div>
                          <div style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-info)', marginBottom: '4px' }}>
                            {item.frameworkName} — Clause {item.clauseRef}
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                            {item.aiRationale}
                          </div>
                        </div>
                      </div>

                      {/* Right Column: Meta & Actions */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {item.conflictDetail && (
                          <div style={{ background: 'rgba(239, 68, 68, 0.04)', border: '1px solid var(--border-danger)', borderRadius: 'var(--r-md)', padding: '12px', fontSize: '11.5px', color: 'var(--text-danger)' }}>
                            <strong>Conflict:</strong> {item.conflictDetail.issue}
                          </div>
                        )}
                        <div>
                          <div style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '6px' }}>Framework Tag</div>
                          <div className="queue-meta" style={{ margin: 0 }}>
                            {item.frameworks.map((f, idx) => (
                              <Badge key={idx} text={f.label} color={f.color} />
                            ))}
                          </div>
                        </div>
                      </div>

                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <textarea className="form-textarea" placeholder="Add justification or override details (Required for Reject)..." rows="2" value={justification} onChange={(e) => handleJustificationChange(item.id, e.target.value)} />
                    </div>

                    <div className="queue-actions">
                      <button className="btn btn-sm btn-success" onClick={() => handleApprove(item.dbId, item.id)}>✓ Approve Mapping</button>
                      <button className="btn btn-sm btn-danger" onClick={() => handleReject(item.dbId, item.id)}>✗ Reject Mapping</button>
                      <button className="btn btn-sm">✎ Edit Control</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </>
  );
}
