import React, { useCallback, useEffect, useRef, useState } from 'react';
import { API_URL } from '../config';
import { fetchWithUserSession } from '../utils/userSession';
import './NotificationCenter.css';

function formatNotificationTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function NotificationCenter({ userId }) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const containerRef = useRef(null);

  const loadNotifications = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const response = await fetchWithUserSession(`${API_URL}/user/${encodeURIComponent(userId)}/notifications?limit=40`, { cache: 'no-store' });
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to load notifications');
      }
      const data = await response.json();
      setNotifications(Array.isArray(data.notifications) ? data.notifications : []);
      setUnreadCount(Number(data.unread_count) || 0);
      setError('');
    } catch (loadError) {
      setError(loadError.message || 'Failed to load notifications');
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadNotifications();
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') loadNotifications();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [loadNotifications]);

  useEffect(() => {
    const handleOutsideClick = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  const markRead = async (notification) => {
    if (notification.read_at) return;
    try {
      const response = await fetchWithUserSession(`${API_URL}/user/${encodeURIComponent(userId)}/notifications/${notification.id}/read`, { method: 'PATCH' });
      if (!response.ok) throw new Error('Failed to mark notification read');
      setNotifications((previous) => previous.map((item) => item.id === notification.id ? { ...item, read_at: new Date().toISOString() } : item));
      setUnreadCount((previous) => Math.max(previous - 1, 0));
    } catch (markError) {
      setError(markError.message);
    }
  };

  const markAllRead = async () => {
    if (!unreadCount) return;
    try {
      const response = await fetchWithUserSession(`${API_URL}/user/${encodeURIComponent(userId)}/notifications/read-all`, { method: 'POST' });
      if (!response.ok) throw new Error('Failed to mark notifications read');
      const timestamp = new Date().toISOString();
      setNotifications((previous) => previous.map((notification) => ({ ...notification, read_at: notification.read_at || timestamp })));
      setUnreadCount(0);
    } catch (markError) {
      setError(markError.message);
    }
  };

  return (
    <div className={`notification-center${unreadCount > 0 ? ' has-unread' : ''}`} ref={containerRef}>
      <button className="notification-trigger" type="button" aria-label="Notifications" aria-expanded={isOpen} onClick={() => setIsOpen((open) => !open)}>
        <svg className="notification-bell" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 7-3 9h18c0-2-3-2-3-9M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && <span className="notification-count">{unreadCount > 99 ? '99+' : unreadCount}</span>}
      </button>

      {isOpen && (
        <div className="notification-panel" role="dialog" aria-label="Notifications">
          <div className="notification-panel-header">
            <div><span className="notification-panel-kicker">Inbox</span><h2 className="app-subsection-heading">Notifications</h2></div>
            <button type="button" className="notification-mark-all" onClick={markAllRead} disabled={!unreadCount}>Mark all read</button>
          </div>
          {error && <div className="notification-error">{error}</div>}
          {loading && notifications.length === 0 && <div className="notification-empty">Loading...</div>}
          {!loading && notifications.length === 0 && <div className="notification-empty">You’re all caught up.</div>}
          <div className="notification-list">
            {notifications.map((notification) => (
              <button className={`notification-item ${notification.read_at ? '' : 'is-unread'}`} type="button" key={notification.id} onClick={() => markRead(notification)}>
                <span className="notification-item-dot" aria-hidden="true" />
                <span className="notification-item-copy"><strong>{notification.title}</strong><span>{notification.body}</span><small>{formatNotificationTime(notification.created_at)}</small></span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default NotificationCenter;
