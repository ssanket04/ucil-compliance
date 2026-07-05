import React, { useState, useEffect } from 'react';
import { DATA } from '../data';
import { fetchNotifications, markAllNotificationsRead, timeAgo } from '../supabaseClient';
import Badge from '../components/Badge';

export default function Notifications({ onNavigate }) {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadNotifications() {
      try {
        const notifsRaw = await fetchNotifications();
        const mappedNotifs = notifsRaw.length ? notifsRaw.map(n => ({
          id:     n.id,
          type:   n.trigger_event.includes('reject') ? 'warning' : n.trigger_event.includes('critical') ? 'danger' : 'info',
          icon:   n.trigger_event.includes('reject') ? '📋' : n.trigger_event.includes('critical') ? '🚨' : '🔔',
          title:  n.title || 'Notification',
          sub:    n.message || 'Details not provided.',
          person: 'System',
          time:   timeAgo(n.created_at),
          unread: !n.is_read,
          action: n.trigger_event.includes('reject') ? 'evidence' : n.trigger_event.includes('critical') ? 'gaps' : 'dashboard'
        })) : DATA.notifications;

        setNotifications(mappedNotifs);
        await markAllNotificationsRead();
      } catch (err) {
        console.error('Error loading notifications:', err);
      } finally {
        setLoading(false);
      }
    }
    loadNotifications();
  }, []);

  if (loading) {
    return <div style={{ padding: '24px', color: 'var(--text-secondary)' }}>Loading notifications...</div>;
  }

  return (
    <>
      {/* Recent Notifications Feed Card */}
      <div className="card">
        <div className="card-title">Recent System Notifications</div>
        <div style={{ maxHeight: '420px', overflowY: 'auto', paddingRight: '4px' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '32px 0', textAlign: 'center', color: 'var(--text-tertiary)' }}>
              No recent notifications to display.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {notifications.map((n) => (
                <div className="notif-item" key={n.id} style={{
                  display: 'flex',
                  gap: '14px',
                  padding: '14px 16px',
                  borderBottom: '1px solid var(--border-t)',
                  borderLeft: n.unread ? '3px solid var(--accent-gold)' : 'none',
                  background: n.unread ? 'rgba(201, 168, 76, 0.02)' : 'transparent',
                  borderRadius: 'var(--r-sm)',
                  marginBottom: '4px',
                  alignItems: 'center'
                }}>
                  <div className="notif-icon" style={{ fontSize: '20px', filter: 'drop-shadow(0 0 4px rgba(255,255,255,0.15))' }}>{n.icon}</div>
                  <div className="notif-body" style={{ flex: 1, minWidth: 0 }}>
                    <div className="notif-title" style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</div>
                    <div className="notif-sub" style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>{n.sub}</div>
                    <div className="notif-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <span className="notif-time" style={{ fontSize: '10px', color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>{n.time}</span>
                      {n.unread && <div className="notif-unread" style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--accent-gold)', boxShadow: '0 0 6px var(--accent-gold)' }}></div>}
                    </div>
                  </div>
                  {n.action && (
                    <button className="btn btn-sm btn-info" onClick={() => onNavigate(n.action)}>
                      Review Action
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Notification Triggers Configuration Card */}
      <div className="card" style={{ marginTop: '16px' }}>
        <div className="card-title">SecOps Notification Routing rules</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px', lineHeight: 1.5 }}>
          Autonomous alerts dispatched to relevant roles in real time.
        </div>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>System Trigger Event</th>
                <th>Target Recipient Role</th>
                <th>Alert Dispatch Channel</th>
              </tr>
            </thead>
            <tbody>
              {[
                ['Evidence document uploaded',              'Domain Head',              'Email + Slack notification'],
                ['Evidence approved by Domain Head',       'Control Owner',            'Slack alert'],
                ['Evidence rejected / returned to owner',   'Control Owner',            'Email escalation'],
                ['Gap severity elevated to critical',       'Compliance Lead, CISO',    'Email + High priority Slack'],
                ['Regulatory circular detected by scraper', 'Compliance Team',          'Email summary digest'],
                ['Compliance conflict detected between frameworks', 'CISO, Compliance Lead', 'Email escalation + SecOps warning'],
                ['SME verification pending review > 48h',  'Compliance Lead',          'Email remainder alert'],
              ].map(([t,n,c], idx) => (
                <tr key={idx}>
                  <td style={{ fontSize: '12.5px', fontWeight: 500 }}>{t}</td>
                  <td><Badge text={n} color="blue" /></td>
                  <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
