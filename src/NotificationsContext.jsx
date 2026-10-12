import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { supabase } from './supabase.js'
import { getUnreadCount } from './api.js'
import { syncPushSubscription } from './push.js'

const NotificationsContext = createContext({ unread: 0, refreshUnread: () => {}, setUnread: () => {} })
export const useNotifications = () => useContext(NotificationsContext)

// Keeps the red badge number up to date: it checks when the app opens, when you come back to it,
// and instantly whenever a friend's action creates a new notification for you (realtime).
export function NotificationsProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const navigate = useNavigate()
  const [unread, setUnread] = useState(0)

  const lastCheck = useRef(0)

  // force: skip the "checked a moment ago" shortcut (used after you change something yourself)
  const refreshUnread = useCallback(
    async (force = true) => {
      if (!userId) return
      if (force !== true && Date.now() - lastCheck.current < 45000) return
      lastCheck.current = Date.now()
      try {
        setUnread(await getUnreadCount())
      } catch {
        /* notifications not set up yet, or offline: keep the last number */
      }
    },
    [userId],
  )

  useEffect(() => {
    if (!userId) {
      setUnread(0)
      return undefined
    }
    refreshUnread()

    // coming back to the app: check again, but not more than once every 45 seconds
    const onVisible = () => document.visibilityState === 'visible' && refreshUnread(false)
    document.addEventListener('visibilitychange', onVisible)

    let channel
    try {
      channel = supabase
        .channel(`notifications-${userId}`)
        // a new notification arrived: just count it, no extra request (the next check corrects any drift)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `recipient_id=eq.${userId}` }, () => {
          lastCheck.current = Date.now()
          setUnread((u) => u + 1)
        })
        .subscribe()
    } catch {
      /* realtime unavailable: the other triggers still keep it fresh */
    }

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      if (channel) supabase.removeChannel(channel)
    }
  }, [userId, refreshUnread])

  // Phone notifications: keep this device attached to the signed-in person.
  useEffect(() => {
    if (userId) syncPushSubscription(userId)
  }, [userId])

  // Tapping a phone notification while the app is open sends us here.
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined
    const onMessage = (e) => {
      if (e.data?.type === 'rankr-open' && typeof e.data.url === 'string' && e.data.url.startsWith('/')) navigate(e.data.url)
    }
    navigator.serviceWorker.addEventListener('message', onMessage)
    return () => navigator.serviceWorker.removeEventListener('message', onMessage)
  }, [navigate])

  // The little number on the app icon (only once notifications are allowed).
  useEffect(() => {
    try {
      if (!('setAppBadge' in navigator) || !('Notification' in window) || Notification.permission !== 'granted') return
      if (unread > 0) navigator.setAppBadge(unread).catch(() => {})
      else navigator.clearAppBadge().catch(() => {})
    } catch {
      /* not supported here */
    }
  }, [unread])

  const value = useMemo(() => ({ unread, refreshUnread, setUnread }), [unread, refreshUnread])
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>
}