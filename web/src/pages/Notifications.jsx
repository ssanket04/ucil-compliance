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
    return <div style={{ padding: '20px', color: 'var(--text-secondary)' }}>Loading notifications...</div>;
  }

  return (
    <>
      <div className="card">
        <div className="card-title">Recent notifications</div>
        <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
          {notifications.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: 'var(--text-secondary)' }}>
              No notifications yet.
            </div>
          ) : (
            notifications.map((n) => (
              <div className="notif-item" key={n.id} style={{ display: 'flex', gap: '10px', padding: '10px 0', borderBottom: '0.5px solid var(--border-t)' }}>
                <div className="notif-icon" style={{ fontSize: '18px', flexShrink: 0 }}>{n.icon}</div>
                <div className="notif-body" style={{ flex: 1, minWidth: 0 }}>
                  <div className="notif-title" style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-primary)' }}>{n.title}</div>
                  <div className="notif-sub" style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '2px', lineHeight: '1.4' }}>{n.sub}</div>
                  <div className="notif-footer" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                    <span className="notif-time" style={{ fontSize: '10px', color: 'var(--text-tertiary)' }}>{n.time}</span>
                    {n.unread && <div className="notif-unread" style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--text-info)', flexShrink: 0, marginTop: '3px' }}></div>}
                  </div>
                </div>
                {n.action && (
                  <button className="btn-sm" onClick={() => onNavigate(n.action)}>View</button>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-title">Notification triggers</div>
        <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>The following events generate automatic notifications to responsible parties.</div>
        <table className="data-table">
          <thead><tr><th>Trigger event</th><th>Notifies</th><th>Channel</th></tr></thead>
          <tbody>
            {[
              ['Evidence uploaded',              'Domain Head',              'Email'],
              ['Evidence approved',              'Control Owner',            'Email'],
              ['Evidence rejected / returned',   'Control Owner',            'Email'],
              ['Gap marked critical',            'Compliance Lead, CISO',    'Email'],
              ['Regulatory update detected',     'Compliance Team',          'Email'],
              ['Compliance conflict detected',   'CISO, Compliance Lead',    'Email'],
              ['SME review pending > 48h',       'Compliance Lead',          'Email'],
            ].map(([t,n,c], idx) => (
              <tr key={idx}>
                <td style={{ fontSize: '12px' }}>{t}</td>
                <td><Badge text={n} color="blue" /></td>
                <td style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>{c}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
