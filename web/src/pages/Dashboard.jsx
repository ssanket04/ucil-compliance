import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchMetrics, fetchFrameworks, fetchRegulatoryChanges, fetchScanInfo, fetchAuditLog, formatTimestamp, timeAgo } from '../supabaseClient';
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
          fetchAuditLog(5),
        ]);

        const m = metricsRaw ? {
          uniqueCanonical:      metricsRaw.unique_canonical      || DATA.metrics.uniqueCanonical,
          implemented:          metricsRaw.implemented           || DATA.metrics.implemented,
          inProgress: {
            pendingSME:          metricsRaw.in_progress_sme       || DATA.metrics.inProgress.pendingSME,
            evidenceUnderReview: metricsRaw.in_progress_ev_review || DATA.metrics.inProgress.evidenceUnderReview,
            evidencePending:     metricsRaw.in_progress_ev_pending || DATA.metrics.inProgress.evidencePending,
            evidenceReassigned:  metricsRaw.in_progress_ev_reassigned || DATA.metrics.inProgress.evidenceReassigned,
          },
          openGaps:             metricsRaw.open_gaps             || DATA.metrics.openGaps,
          criticalGaps:         metricsRaw.critical_gaps         || DATA.metrics.criticalGaps,
          circularsIngested:    metricsRaw.circulars_ingested    || DATA.metrics.circularsIngested,
          frameworksIngested:   metricsRaw.frameworks_ingested   || DATA.metrics.frameworksIngested,
          internalPolicies:     metricsRaw.internal_policies     || DATA.metrics.internalPolicies,
          totalSourcesIngested: metricsRaw.total_sources         || DATA.metrics.totalSourcesIngested,
          aiAutoApprovalRate:   metricsRaw.ai_auto_approval_rate || DATA.metrics.aiAutoApprovalRate,
          controlMultiplier:    metricsRaw.control_multiplier    || DATA.metrics.controlMultiplier,
          totalMappings:        metricsRaw.total_mappings        || DATA.metrics.totalMappings,
        } : DATA.metrics;

        setMetrics(m);

        const fws = frameworksRaw.length ? frameworksRaw.map(fw => ({
          name:      fw.name,
          status:    fw.compliance_status,
          satisfied: Math.round(fw.satisfied_pct),
          partial:   Math.round(fw.partial_pct),
          missing:   Math.round(fw.missing_pct),
        })) : DATA.frameworks;
        setFrameworks(fws);

        const regs = regulatoryRaw.length ? regulatoryRaw.map(r => ({
          id:               r.circular_id,
          title:            r.title,
          date:             r.issued_date ? new Date(r.issued_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—',
          impactedControls: r.total_impacted,
          gaps:             r.gaps_count || 0,
          status:           r.status,
        })) : DATA.regulatory;
        setRegulatory(regs);

        const scanMap = {};
        scanRaw.forEach(s => { scanMap[s.scan_type] = s; });
        const sc = {
          lastCircularScan: {
            timestamp: scanMap['circular_scan']?.completed_at ? formatTimestamp(scanMap['circular_scan'].completed_at) : DATA.scanInfo.lastCircularScan.timestamp,
            status:    scanMap['circular_scan']?.status || DATA.scanInfo.lastCircularScan.status,
          },
        };
        setScanInfo(sc);

        const act = auditLog.length ? auditLog.map(a => ({
          text:  `${a.users?.full_name || 'System'} — ${a.action.replace(/_/g, ' ')}`,
          time:  timeAgo(a.performed_at),
          color: a.action.includes('gap') ? 'var(--text-danger)'
               : a.action.includes('approve') ? 'var(--text-success)'
               : a.action.includes('reject') ? 'var(--text-warning)'
               : 'var(--text-info)',
        })) : [
          { text: 'RBI CSF v2 ingestion completed — 85 controls mapped', time: '2h ago', color: 'var(--text-success)' },
          { text: '12 low-confidence mappings sent to SME queue', time: '4h ago', color: 'var(--text-warning)' },
          { text: 'Priya S. approved 8 ISO–SOX mappings', time: '6h ago', color: 'var(--text-info)' },
          { text: '3 conflicting controls flagged: NIST vs PCI-DSS', time: '1d ago', color: 'var(--text-danger)' },
          { text: 'Gap report exported for Q1 audit pack', time: '1d ago', color: 'var(--text-success)' },
        ];
        setActivity(act);

      } catch (err) {
        console.error('Error loading dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  if (loading) {
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading dashboard...</div>;
  }

  const m = metrics || DATA.metrics;
  const totalInProgress = m.inProgress.pendingSME
    + m.inProgress.evidenceUnderReview
    + m.inProgress.evidencePending
    + m.inProgress.evidenceReassigned;

  const implementedPct = m.uniqueCanonical > 0
    ? Math.round(m.implemented / m.uniqueCanonical * 100)
    : 0;

  const autoApprovalDisplay = m.aiAutoApprovalRate ? `${Math.round(m.aiAutoApprovalRate)}%` : '0%';
  const autoApprovalSub = m.uniqueCanonical > 0
    ? `${Math.round(m.aiAutoApprovalRate * m.uniqueCanonical / 100)} of ${m.uniqueCanonical} controls auto-approved`
    : 'Confidence ≥ 0.85';

  const multiplierDisplay = m.controlMultiplier ? `1 → ${Number(m.controlMultiplier).toFixed(1)}×` : '1 → 5.2×';
  const lastScanTime = scanInfo?.lastCircularScan.timestamp || DATA.scanInfo.lastCircularScan.timestamp;

  return (
    <>
      <div className="grid-4">
        <MetricCard label="Unique canonical controls" value={m.uniqueCanonical} delta="Total controls = Unified Library = Domain Head View" deltaType="good" onClick={() => onNavigate('library')} />
        <MetricCard label="Implemented controls" value={m.implemented} delta={`${implementedPct}% · Active in Library · Approved in Evidence`} deltaType="good" onClick={() => onNavigate('library')} />
        <div className="metric-card" onClick={() => setShowInProgressBreakdown(!showInProgressBreakdown)} style={{ cursor: 'pointer' }}>
          <div className="metric-label">In Progress <span style={{ fontSize: '10px', opacity: 0.7 }}>(click for breakdown)</span></div>
          <div className="metric-value">{totalInProgress}</div>
          <div className="metric-delta text-warning">= Evidence (Under Review + Reassigned + Pending) + SME</div>
          {showInProgressBreakdown && (
            <div style={{ marginTop: '12px', paddingTop: '12px', borderTop: '0.5px solid var(--border-t)' }}>
              <div style={{ fontSize: '11px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onNavigate('queue'); }}>
                <span style={{ color: 'var(--text-secondary)' }}>Pending SME review</span>
                <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.pendingSME}</strong>
              </div>
              <div style={{ fontSize: '11px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onNavigate('evidence'); }}>
                <span style={{ color: 'var(--text-secondary)' }}>Evidence under review</span>
                <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidenceUnderReview}</strong>
              </div>
              <div style={{ fontSize: '11px', marginBottom: '6px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onNavigate('evidence'); }}>
                <span style={{ color: 'var(--text-secondary)' }}>Evidence reassigned</span>
                <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidenceReassigned}</strong>
              </div>
              <div style={{ fontSize: '11px', display: 'flex', justifyContent: 'space-between', cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); onNavigate('evidence'); }}>
                <span style={{ color: 'var(--text-secondary)' }}>Evidence pending</span>
                <strong style={{ color: 'var(--text-primary)' }}>{m.inProgress.evidencePending}</strong>
              </div>
            </div>
          )}
        </div>
        <MetricCard label="Open gaps" value={m.openGaps} delta={`${m.criticalGaps} critical · Failed in Library · Rejected in Evidence`} deltaType="bad" onClick={() => onNavigate('gaps')} />
      </div>

      <div className="grid-4">
        <MetricCard label="Total sources ingested" value={m.totalSourcesIngested} delta={`${m.frameworksIngested} frameworks · ${m.circularsIngested} circulars · ${m.internalPolicies} policies`} deltaType="good" onClick={() => onNavigate('ingest')} />
        <MetricCard label="Control Efficiency" value={multiplierDisplay} delta="One control satisfies multiple frameworks" deltaType="good" onClick={() => onNavigate('library')} />
        <MetricCard label="AI Auto-Approval Rate" value={autoApprovalDisplay} delta={`${autoApprovalSub} · Matches Library auto-approved`} deltaType="good" onClick={() => onNavigate('library')} />
        <MetricCard label="Web Scraper Status" value="Active" delta={`Last scan: ${lastScanTime}`} deltaType="good" onClick={() => onNavigate('ingest')} />
      </div>

      <div className="row">
        <div className="col-14">
          <div className="card">
            <div className="card-title">Framework compliance status</div>
            <div style={{ maxHeight: '700px', overflowY: 'auto', overflowX: 'hidden' }}>
              {frameworks.map((fw, idx) => (
                <FrameworkBar key={idx} name={fw.name} satisfied={fw.satisfied} partial={fw.partial} missing={fw.missing} status={fw.status} />
              ))}
            </div>
          </div>
        </div>
        <div className="col">
          <div className="card" style={{ height: '100%' }}>
            <div className="card-title">Recent activity</div>
            <ActivityFeed items={activity} />
          </div>
        </div>
      </div>

      <div className="row">
        <div className="col">
          <div className="card" style={{ height: '100%' }}>
            <div className="card-title" style={{ cursor: 'pointer' }} onClick={() => onNavigate('regulatory')}>
              Recent regulatory updates <span style={{ fontSize: '11px', color: 'var(--text-info)', fontWeight: 400 }}>→ view all</span>
            </div>
            <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
              {regulatory.slice(0, 3).map((r, idx) => (
                <div className="reg-update-item" key={idx}>
                  <div className="reg-update-date">{r.date.split(' ').slice(0, 2).join(' ')}</div>
                  <div className="reg-update-body">
                    <div className="reg-update-title">{r.id}</div>
                    <div className="reg-update-meta">{r.title} · Affects {r.impactedControls} controls{r.gaps > 0 ? ` · ${r.gaps} gaps` : ''}</div>
                  </div>
                  <div><Badge text={r.status === 'Remediated' ? 'Remediated' : 'In review'} color={r.status === 'Remediated' ? 'green' : 'red'} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
