// Extra service-worker code for phone notifications. The app's main service worker loads this file.

self.addEventListener('push', (event) => {
  let d = {}
  try {
    d = event.data ? event.data.json() : {}
  } catch {
    /* plain text or empty: fall through to the defaults */
  }
  event.waitUntil(
    (async () => {
      // Every push must show a notification (iPhone cancels notifications for apps that don't).
      await self.registration.showNotification(d.title || 'RankR', {
        body: d.body || 'You have new activity',
        icon: '/pwa-192.png',
        badge: '/pwa-192.png',
        tag: d.tag || undefined,
        data: { url: d.url || '/activity' },
      })
      if (typeof d.badge === 'number' && self.navigator && self.navigator.setAppBadge) {
        try {
          await self.navigator.setAppBadge(d.badge)
        } catch {
          /* badges are a nice extra, never required */
        }
      }
    })(),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/activity'
  event.waitUntil(
    (async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of open) {
        if ('focus' in client) {
          await client.focus()
          client.postMessage({ type: 'rankr-open', url })
          return
        }
      }
      await self.clients.openWindow(url)
    })(),
  )
})