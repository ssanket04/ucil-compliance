import React from 'react';

export default function ScanWidget({ scanInfo }) {
  function scanDot(status) {
    if (status === 'up-to-date') return <span style={{ color: 'var(--text-success)' }}>●</span>;
    if (status === 'pending')    return <span style={{ color: 'var(--text-warning)' }}>●</span>;
    return <span style={{ color: 'var(--text-danger)' }}>●</span>;
  }
  function scanClass(status) {
    return status === 'up-to-date' ? 'scan-up-to-date' : status === 'pending' ? 'scan-pending' : 'scan-failed';
  }
  function scanLabel(status) {
    return status === 'up-to-date' ? 'Up-to-date' : status === 'pending' ? 'Pending' : 'Failed';
  }
  return (
    <div className="scan-widget">
      <div className="scan-item">
        <div className="scan-label">Last circular scan</div>
        <div className="scan-value">{scanDot(scanInfo.lastCircularScan.status)} Circular monitoring</div>
        <div className="scan-time">{scanInfo.lastCircularScan.timestamp}</div>
        <div className={`scan-status-badge ${scanClass(scanInfo.lastCircularScan.status)}`}>{scanLabel(scanInfo.lastCircularScan.status)}</div>
      </div>
      <div className="scan-item">
        <div className="scan-label">Last compliance evaluation</div>
        <div className="scan-value">{scanDot(scanInfo.lastComplianceEval.status)} Control assessment</div>
        <div className="scan-time">{scanInfo.lastComplianceEval.timestamp}</div>
        <div className={`scan-status-badge ${scanClass(scanInfo.lastComplianceEval.status)}`}>{scanLabel(scanInfo.lastComplianceEval.status)}</div>
      </div>
      <div className="scan-item">
        <div className="scan-label">Next scheduled scan</div>
        <div className="scan-value">{scanDot(scanInfo.nextScheduledScan.status)} Automated run</div>
        <div className="scan-time">{scanInfo.nextScheduledScan.timestamp}</div>
        <div className={`scan-status-badge ${scanClass(scanInfo.nextScheduledScan.status)}`}>{scanLabel(scanInfo.nextScheduledScan.status)}</div>
      </div>
    </div>
  );
}
