/* Autoura ops service worker — PUSH ONLY.
 *
 * Deliberately no fetch handler and no caching: this worker exists so the
 * installed ops PWA can receive checkpoint alerts, not to serve stale pages.
 * (The v1 PWA decision to skip offline stands; push is why the SW appeared.)
 */

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'Autoura', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'Autoura Ops'
  event.waitUntil(
    self.registration.showNotification(title, {
      body: data.body || '',
      icon: '/icons/ops-192.png',
      badge: '/icons/ops-192.png',
      data: { url: data.url || '/ops' },
      tag: data.tag || 'autoura-ops',
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = (event.notification.data && event.notification.data.url) || '/ops'
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if (w.url.includes('/ops') && 'focus' in w) return w.focus()
      }
      return clients.openWindow(url)
    })
  )
})
