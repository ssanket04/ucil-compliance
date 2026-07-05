import React from 'react';

export default function StatusBadge({ status }) {
  const map = {
    'Active':               'status-active',
    'Failed':               'status-failed',
    'Under Review':         'status-underreview',
    'Reassigned':           'status-reassigned',
    'Updated':              'status-updated',
    'Rejected':             'status-rejected',
    'Pending':              'status-pending',
    'Approved':             'status-approved',
    'Compliant':            'status-compliant',
    'Partially Compliant':  'status-partial',
    'Not Compliant':        'status-noncompliant',
    'In progress':          'status-inprogress',
    'Gap risk':             'status-noncompliant',
    'Non-compliant':        'status-noncompliant',
    'Processing':           'status-inprogress',
    'Completed':            'status-compliant',
  };
  return <span className={`status-badge ${map[status] || 'status-pending'}`}>{status}</span>;
}
