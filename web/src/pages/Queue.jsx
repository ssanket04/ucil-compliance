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
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading SME Review Queue...</div>;
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

  return (
    <>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '14px', alignItems: 'center' }}>
        <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
          {queue.length} items pending SME review (confidence 0.65–0.84)
        </span>
      </div>

      {errorMsg && <div className="banner banner-danger" style={{ marginBottom: '12px' }}>{errorMsg}</div>}
      {successMsg && <div className="banner banner-success" style={{ marginBottom: '12px' }}>{successMsg}</div>}

      <div id="queue-list">
        {queue.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '40px', color: 'var(--text-secondary)', fontSize: '13px' }}>
            All mappings reviewed. Queue is empty. ✓
          </div>
        ) : (
          queue.map((item) => {
            const isExpanded = expandedItems[item.id];
            const justification = justifications[item.id] || '';

            return (
              <div className="queue-item" id={`qi-${item.id}`} key={item.id}>
                <div className="queue-header" onClick={() => toggleItem(item.id)} style={{ cursor: 'pointer' }}>
                  <div className="queue-id">{item.id}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      Unique Control Formed
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {item.uniqueControl}
                    </div>
                  </div>
                  <ConfPill value={item.conf} />
                  {item.conflict && (
                    <button className="btn-sm" style={{ borderColor: 'var(--border-danger)', color: 'var(--text-danger)', marginLeft: '8px' }} onClick={(e) => { e.stopPropagation(); toggleItem(item.id); }}>
                      ⚠ Conflict
                    </button>
                  )}
                  <span style={{ fontSize: '11px', color: 'var(--text-tertiary)', marginLeft: '8px' }}>
                    {isExpanded ? '▼' : '▶'}
                  </span>
                </div>
                {isExpanded && (
                  <div style={{ paddingTop: '10px' }}>
                    <div style={{ background: 'var(--bg-secondary)', borderRadius: 'var(--r-md)', padding: '10px', marginBottom: '10px' }}>
                      <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        Mapping Details
                      </div>
                      <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '0.5px solid var(--border-t)' }}>
                        <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-info)', marginBottom: '3px' }}>
                          {item.frameworkName} — {item.clauseRef}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                          {item.aiRationale}
                        </div>
                      </div>
                    </div>
                    <div className="queue-meta">
                      {item.frameworks.map((f, idx) => (
                        <Badge key={idx} text={f.label} color={f.color} />
                      ))}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <textarea className="form-textarea" placeholder="Add SME justification or override note…" rows="2" value={justification} onChange={(e) => handleJustificationChange(item.id, e.target.value)} />
                    </div>
                    <div className="queue-actions">
                      <button className="btn-sm btn-success" onClick={() => handleApprove(item.dbId, item.id)}>✓ Approve</button>
                      <button className="btn-sm btn-danger" onClick={() => handleReject(item.dbId, item.id)}>✗ Reject</button>
                      <button className="btn-sm btn-info">✎ Edit Control</button>
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
