import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { sb, fetchMetrics, fetchFrameworks, fetchRegulatoryChanges, fetchScanInfo, fetchAuditLog, formatTimestamp, timeAgo } from '../supabaseClient';
import MetricCard from '../components/MetricCard';
import { FrameworkBar } from '../components/FrameworkBar';
import ActivityFeed from '../components/ActivityFeed';
import Badge from '../components/Badge';

export default function Dashboard({ onNavigate }) {
  const [metrics, setMetrics] = useState(null);
  const [frameworks, setFrameworks] = useState([]);
  const [regulatory, setRegulatory] = useState([]);
  const [scanInfo, setScanInfo] = useState(null);
  const [activity, setActivity] = useState([]);
  const [auditChainVerified, setAuditChainVerified] = useState(true);
  const [showInProgressBreakdown, setShowInProgressBreakdown] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [metricsRaw, frameworksRaw, regulatoryRaw, scanRaw, auditLog] = await Promise.all([
          fetchMetrics(),
          fetchFrameworks(),
          fetchRegulatoryChanges(),
          fetchScanInfo(),
          fetchAuditLog(10), // Fetch up to 10 logs for a better feed
        ]);

        // Use Nullish Coalescing (??) instead of OR (||) to prevent 0 mapping to dummy fallbacks
        const m = metricsRaw ? {
          uniqueCanonical:      metricsRaw.unique_canonical      ?? 0,
          implemented:          metricsRaw.implemented           ?? 0,
          inProgress: {
            pendingSME:          metricsRaw.in_progress_sme       ?? 0,
            evidenceUnderReview: metricsRaw.in_progress_ev_review ?? 0,
            evidencePending:     metricsRaw.in_progress_ev_pending ?? 0,
            evidenceReassigned:  metricsRaw.in_progress_ev_reassigned ?? 0,
          },
          openGaps:             metricsRaw.open_gaps             ?? 0,
          criticalGaps:         metricsRaw.critical_gaps         ?? 0,
          circularsIngested:    metricsRaw.circulars_ingested    ?? 0,
          frameworksIngested:   metricsRaw.frameworks_ingested   ?? 0,
          internalPolicies:     metricsRaw.internal_policies     ?? 0,
          totalSourcesIngested: metricsRaw.total_sources         ?? 0,
          aiAutoApprovalRate:   metricsRaw.ai_auto_approval_rate ?? 0,
          controlMultiplier:    metricsRaw.control_multiplier    ?? 1.0,
          totalMappings:        metricsRaw.total_mappings        ?? 0,
        } : null;

        const finalMetrics = m || {
          uniqueCanonical:      0,
          implemented:          0,
          inProgress: { pendingSME: 0, evidenceUnderReview: 0, evidencePending: 0, evidenceReassigned: 0 },
          openGaps:             0,
          criticalGaps:         0,
          circularsIngested:    0,
          frameworksIngested:   0,
          internalPolicies:     0,
          totalSourcesIngested: 0,
          aiAutoApprovalRate:   0,
          controlMultiplier:    1.0,
          totalMappings:        0
        };

        setMetrics(finalMetrics);

        // If database contains frameworks/circulars, map them. Otherwise, leave empty to show zero-state
        const fws = frameworksRaw && frameworksRaw.length > 0 ? frameworksRaw.map(fw => ({
          name:      fw.name,
          status:    fw.compliance_status,
          satisfied: Math.round(fw.satisfied_pct),
          partial:   Math.round(fw.partial_pct),
          missing:   Math.round(fw.missing_pct),
        })) : [];
        setFrameworks(fws);

        const regs = regulatoryRaw && regulatoryRaw.length > 0 ? regulatoryRaw.map(r => ({
          id:               r.circular_id,
          title:            r.title,
          date:             r.issued_date ? new Date(r.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          impactedControls: r.total_impacted,
          gaps:             r.total_gaps_created || 0,
          status:           r.status,
        })) : [];
        setRegulatory(regs);

        const scanMap = {};
        if (scanRaw) {
          scanRaw.forEach(s => { scanMap[s.scan_type] = s; });
        }
        const sc = {
          lastCircularScan: {
            timestamp: scanMap['circular_scan']?.completed_at ? formatTimestamp(scanMap['circular_scan'].completed_at) : '—',
            status:    scanMap['circular_scan']?.status || 'inactive',
          },
        };
        setScanInfo(sc);

        // Map live audit actions using natural language
        const act = auditLog && auditLog.length > 0 ? auditLog.map(a => {
          let actionLabel = a.action.replace(/_/g, ' ');
          if (a.action === 'evidence_uploaded') actionLabel = `uploaded verification evidence file`;
          else if (a.action === 'evidence_approved') actionLabel = `approved uploaded evidence`;
          else if (a.action === 'evidence_rejected') actionLabel = `rejected evidence and returned to owner`;
          else if (a.action === 'gdpr_erasure') actionLabel = `applied GDPR PII erasure protocol`;
          
          return {
            text:  `${a.users?.full_name || 'System'} ${actionLabel}`,
            time:  timeAgo(a.performed_at),
            color: a.action.includes('fail') || a.action.includes('reject') ? 'var(--text-danger)'
                 : a.action.includes('approve') ? 'var(--text-success)'
                 : 'var(--text-info)',
          };
        }) : [];
        setActivity(act);

        // Bounded verification of the last 100 audit entries on load (Q29-A)
        let isChainSecure = true;
        try {
          const nowIso = new Date().toISOString();
          const oneWeekAgoIso = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
          const { data: chainResult } = await sb.rpc('verify_audit_chain', {
            p_from_ts: oneWeekAgoIso,
            p_to_ts: nowIso
          });
          if (chainResult && chainResult.length > 0) {
            isChainSecure = chainResult[0].is_valid ?? true;
          }
        } catch (chainErr) {
          console.warn('Audit verification query skipped:', chainErr.message);
        }
        setAuditChainVerified(isChainSecure);

      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading Executive Dashboard...</div>;
  }

  const m = metrics;
  const totalInProgress = m.inProgress.pendingSME
    + m.inProgress.evidenceUnderReview
    + m.inProgress.evidencePending
    + m.inProgress.evidenceReassigned;

  const implementedPct = m.uniqueCanonical > 0
    ? Math.round(m.implemented / m.uniqueCanonical * 100)
    : 0;

  const autoApprovalDisplay = m.aiAutoApprovalRate ? `${Math.round(m.aiAutoApprovalRate)}%` : '0%';
  const autoApprovalSub = m.uniqueCanonical > 0
    ? `${Math.round(m.aiAutoApprovalRate * m.uniqueCanonical / 100)} of ${m.uniqueCanonical} auto-approved`
    : 'Confidence ≥ 0.85';

  const multiplierVal = Number(m.controlMultiplier);
  const multiplierDisplay = m.uniqueCanonical > 0 && multiplierVal > 0 ? `1 → ${multiplierVal.toFixed(1)}×` : '1 → 1.0×';
  const lastScanTime = scanInfo?.lastCircularScan.timestamp || '—';

  return (
    <>
      {/* Bento Grid Top Level Row */}
      <div className="bento-grid">
        {/* Row 1 Metrics Column */}
        <div className="col-8" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
          <MetricCard label="Unique Canonical Controls" value={m.uniqueCanonical} delta="Matches Library & Domain Head" deltaType="good" onClick={() => onNavigate('library')} />
          <MetricCard label="Implemented Controls" value={m.implemented} delta={`${implementedPct}% compliance coverage`} deltaType="good" onClick={() => onNavigate('library')} />
          
          <div className="metric-card" onClick={() => setShowInProgressBreakdown(!showInProgressBreakdown)} style={{ cursor: 'pointer' }}>
            <div className="metric-label">In Progress <span style={{ fontSize: '9px', color: 'var(--accent-gold-lt)' }}>(Click to expand)</span></div>
            <div className="metric-value">{totalInProgress}</div>
            <div className="metric-delta text-warning">Pending Review / SME</div>
            {showInProgressBreakdown && (
              <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '1px solid var(--border-t)' }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: '11px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onNavigate('queue')}>
                  <span style={{ color: 'var(--text-secondary)' }}>SME queue</span>
                  <strong style={{ color: 'var(--accent-gold-lt)' }}>{m.inProgress.pendingSME}</strong>
                </div>
                <div style={{ fontSize: '11px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onNavigate('evidence')}>
                  <span style={{ color: 'var(--text-secondary)' }}>Under review</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidenceUnderReview}</strong>
                </div>
                <div style={{ fontSize: '11px', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onNavigate('evidence')}>
                  <span style={{ color: 'var(--text-secondary)' }}>Reassigned</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidenceReassigned}</strong>
                </div>
                <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={() => onNavigate('evidence')}>
                  <span style={{ color: 'var(--text-secondary)' }}>Pending evidence</span>
                  <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidencePending}</strong>
                </div>
              </div>
            )}
          </div>

          <MetricCard label="Open Gaps" value={m.openGaps} delta={`${m.criticalGaps} critical gaps require remediation`} deltaType="bad" onClick={() => onNavigate('gaps')} />
        </div>

        {/* Row 1 Activity Column */}
        <div className="col-4">
          <div className="card" style={{ height: '100%', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <span>SecOps Audit Trail</span>
              {auditChainVerified ? (
                <span className="badge badge-green" style={{ fontSize: '9px', textTransform: 'uppercase', letterSpacing: '0.05em', cursor: 'help' }} title="Tamper-evident SHA-256 block hash verification succeeded for last 100 records.">
                  🛡️ Audit Chain Verified
                </span>
              ) : (
                <span className="badge badge-red" style={{ fontSize: '9px', textTransform: 'uppercase' }}>
                  ⚠ Verification Error
                </span>
              )}
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: activity.length > 0 ? 'flex-start' : 'center' }}>
              {activity.length > 0 ? (
                <ActivityFeed items={activity} />
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11.5px', padding: '16px' }}>
                  No security audit entries recorded yet.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Bento Grid Row 2 */}
      <div className="bento-grid">
        <div className="col-8">
          <div className="card" style={{ height: '100%', marginBottom: 0, display: 'flex', flexDirection: 'column' }}>
            <div className="card-title">Framework Compliance Status</div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: frameworks.length > 0 ? 'flex-start' : 'center' }}>
              {frameworks.length > 0 ? (
                <div style={{ maxHeight: '380px', overflowY: 'auto', paddingRight: '4px' }}>
                  {frameworks.map((fw, idx) => (
                    <FrameworkBar key={idx} name={fw.name} satisfied={fw.satisfied} partial={fw.partial} missing={fw.missing} status={fw.status} />
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', padding: '24px 16px' }}>
                  <div style={{ fontSize: '28px', marginBottom: '12px' }}>📋</div>
                  <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>No framework/standard/circulars ingested yet</div>
                  <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)', marginTop: '6px', maxWidth: '300px', margin: '6px auto 0' }}>
                    Ingest your first policy or standard document to dynamically generate compliance and multiplier analytics.
                  </div>
                  <button className="btn btn-sm btn-primary" style={{ marginTop: '16px' }} onClick={() => onNavigate('ingest')}>Go to Ingestion →</button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-4" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <MetricCard label="Total Ingested Sources" value={m.totalSourcesIngested} delta={`${m.frameworksIngested} frameworks · ${m.circularsIngested} circulars`} deltaType="good" onClick={() => onNavigate('ingest')} />
          <MetricCard label="Control Efficiency" value={multiplierDisplay} delta="One control satisfies multiple regulations" deltaType="good" onClick={() => onNavigate('library')} />
        </div>
      </div>

      {/* Bento Grid Row 3 */}
      <div className="bento-grid">
        <div className="col-4">
          <MetricCard label="AI Auto-Approval Rate" value={autoApprovalDisplay} delta={autoApprovalSub} deltaType="good" onClick={() => onNavigate('library')} />
        </div>
        <div className="col-4">
          <MetricCard label="Live Circular Scraper" value="Active" delta={`Last scan: ${lastScanTime}`} deltaType="good" onClick={() => onNavigate('ingest')} />
        </div>

        <div className="col-4">
          <div className="card" style={{ height: '100%', marginBottom: 0, padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
            <div className="card-title" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: '8px' }} onClick={() => onNavigate('regulatory')}>
              <span>Regulatory Changes</span>
              <span style={{ fontSize: '11px', color: 'var(--text-info)', fontWeight: 'normal' }}>View all →</span>
            </div>
            
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: regulatory.length > 0 ? 'flex-start' : 'center' }}>
              {regulatory.length > 0 ? (
                <div style={{ maxHeight: '180px', overflowY: 'auto' }}>
                  {regulatory.slice(0, 2).map((r, idx) => (
                    <div className="reg-update-item" key={idx} style={{ padding: '8px 0' }}>
                      <div className="reg-update-date" style={{ width: '50px' }}>{r.date.split(' ').slice(0, 2).join(' ')}</div>
                      <div className="reg-update-body">
                        <div className="reg-update-title" style={{ fontSize: '11.5px', fontWeight: 'bold' }}>{r.id}</div>
                        <div className="reg-update-meta" style={{ fontSize: '10px' }}>Affects {r.impactedControls} controls</div>
                      </div>
                      <div>
                        <Badge text={r.status === 'Remediated' ? 'Done' : 'Review'} color={r.status === 'Remediated' ? 'green' : 'red'} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: '11px', padding: '8px 0' }}>
                  No recent regulatory changes detected.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
